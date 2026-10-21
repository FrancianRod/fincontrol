/**
 * Importa os dados do SQLite antigo (prisma/dev.db) para o Postgres do
 * Supabase, mantendo os mesmos ids (as relações continuam válidas).
 *
 *   npx tsx scripts/import-sqlite.ts            # simulação: só mostra as contagens
 *   npx tsx scripts/import-sqlite.ts --apply    # APAGA o que existe no Supabase e importa
 *
 * Usa DIRECT_URL (conexão de sessão) e roda tudo numa transação: se algo
 * falhar, nada muda no Supabase. O SQLite é aberto só para leitura.
 */
import "dotenv/config";
import Database from "better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const SQLITE_PATH = process.argv.find((a) => a.endsWith(".db")) ?? "prisma/dev.db";
const APPLY = process.argv.includes("--apply");

// Ordem de inserção respeita as chaves estrangeiras (pais antes dos filhos).
const TABLES = [
  "User",
  "Income",
  "ExpenseSeries",
  "Expense",
  "Investment",
  "InvestmentTransaction",
  "CreditLetter",
  "CreditLetterPeriod",
] as const;
type Table = (typeof TABLES)[number];

const DATE_FIELDS = new Set(["createdAt", "updatedAt", "date", "dueDate", "paidAt", "installmentPaidAt"]);
const BOOL_FIELDS = new Set(["received", "essential", "contemplated", "installmentPaid"]);

/** SQLite guarda datas como texto ISO, "AAAA-MM-DD HH:MM:SS" (UTC) ou epoch ms. */
function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v);
  const s = String(v);
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s) ? `${s.replace(" ", "T")}Z` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida: ${s}`);
  return d;
}

function convert(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DATE_FIELDS.has(k)) out[k] = toDate(v);
    else if (BOOL_FIELDS.has(k)) out[k] = v === 1 || v === true || v === "true";
    else out[k] = v;
  }
  return out;
}

const delegate = (db: Pick<PrismaClient, "user">, t: Table) => {
  const name = (t.charAt(0).toLowerCase() + t.slice(1)) as keyof PrismaClient;
  return (db as unknown as Record<string, { createMany(a: { data: unknown[] }): Promise<{ count: number }>; count(): Promise<number>; deleteMany(): Promise<unknown> }>)[name as string];
};

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL não definida no .env");

  const sqlite = new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const rows = Object.fromEntries(
    TABLES.map((t) => [t, (sqlite.prepare(`SELECT * FROM "${t}"`).all() as Record<string, unknown>[]).map(convert)]),
  ) as Record<Table, Record<string, unknown>[]>;

  console.log(`Origem: ${SQLITE_PATH}\n`);
  console.log("Tabela                  SQLite  Supabase (atual)");
  for (const t of TABLES) {
    const remote = await delegate(db, t).count();
    console.log(`${t.padEnd(22)} ${String(rows[t].length).padStart(7)}  ${String(remote).padStart(8)}`);
  }

  if (!APPLY) {
    console.log("\nSimulação: nada foi alterado. Rode com --apply para substituir os dados do Supabase.");
    await db.$disconnect();
    return;
  }

  await db.$transaction(
    async (tx) => {
      // Filhos antes dos pais para não violar chaves estrangeiras.
      for (const t of [...TABLES].reverse()) await delegate(tx, t).deleteMany();
      for (const t of TABLES) {
        if (!rows[t].length) continue;
        const { count } = await delegate(tx, t).createMany({ data: rows[t] });
        if (count !== rows[t].length) throw new Error(`${t}: inseridas ${count} de ${rows[t].length}`);
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  console.log("\nImportação concluída. Contagens no Supabase:");
  for (const t of TABLES) {
    const remote = await delegate(db, t).count();
    const ok = remote === rows[t].length ? "ok" : "DIFERENTE";
    console.log(`${t.padEnd(22)} ${String(remote).padStart(7)}  ${ok}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  // Nunca imprime a connection string.
  console.error("Erro:", String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://***"));
  process.exit(1);
});
