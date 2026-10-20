// Regras puras dos painéis de inteligência do dashboard (sem banco).
// Valores em centavos.

export interface CategoryExpense {
  category: string;
  type: "FIXED" | "VARIABLE";
  amountCents: number;
}

export type CategoryView = "ALL" | "FIXED" | "VARIABLE";

/** Quantas categorias ganham cor própria; o resto vira "Outros". */
export const MAX_COLORED_CATEGORIES = 7;
export const OTHER = "Outros";

export function totalsByCategory(expenses: CategoryExpense[], view: CategoryView = "ALL"): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenses) {
    if (view !== "ALL" && e.type !== view) continue;
    out.set(e.category, (out.get(e.category) ?? 0) + e.amountCents);
  }
  return out;
}

/**
 * Cor de cada categoria (índice 1..7 do tema categórico), definida pelo
 * ranking de TODOS os gastos do mês. Assim a cor segue a categoria e não muda
 * ao alternar entre Todos / Fixos / Variáveis. Fora do top 7 = "Outros".
 */
export function categoryColorSlots(expenses: CategoryExpense[]): Map<string, number> {
  const ranked = [...totalsByCategory(expenses)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  return new Map(ranked.slice(0, MAX_COLORED_CATEGORIES).map(([cat], i) => [cat, i + 1]));
}

export interface CategorySlice {
  category: string;
  cents: number;
  share: number; // 0..1
  slot: number | null; // null = "Outros"
}

/** Fatias do gráfico na visão escolhida, na ordem das cores; categorias sem cor somam em "Outros" (no fim). */
export function categorySlices(expenses: CategoryExpense[], view: CategoryView, slots: Map<string, number>): CategorySlice[] {
  const totals = totalsByCategory(expenses, view);
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  let other = 0;
  const colored: CategorySlice[] = [];
  for (const [category, cents] of totals) {
    const slot = slots.get(category);
    if (slot == null || category === OTHER) other += cents;
    else colored.push({ category, cents, share: cents / total, slot });
  }
  colored.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  if (other) colored.push({ category: OTHER, cents: other, share: other / total, slot: null });
  return colored;
}

// ─── Variação entre meses ───────────────────────────────────────────────────

export interface CategoryChange {
  category: string;
  current: number;
  previous: number;
  /** (atual − anterior) / anterior; null quando o mês anterior é 0 */
  pct: number | null;
}

/** Mudanças por categoria; ignora bases pequenas para não gerar "+900%" com R$ 5. */
export function categoryChanges(current: Map<string, number>, previous: Map<string, number>, minBaseCents = 5000): CategoryChange[] {
  const cats = new Set([...current.keys(), ...previous.keys()]);
  return [...cats]
    .map((category) => {
      const c = current.get(category) ?? 0;
      const p = previous.get(category) ?? 0;
      return { category, current: c, previous: p, pct: p > 0 ? (c - p) / p : null };
    })
    .filter((x) => x.previous >= minBaseCents || x.current >= minBaseCents);
}

/** Maior alta e maior queda em R$ (as que mais mexem no orçamento). */
export function biggestMoves(changes: CategoryChange[]) {
  const withDelta = changes.map((c) => ({ ...c, delta: c.current - c.previous }));
  const up = withDelta.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta)[0] ?? null;
  const down = withDelta.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta)[0] ?? null;
  return { up, down };
}

// ─── Regra 50/30/20 ─────────────────────────────────────────────────────────

export interface RuleBucket {
  key: "needs" | "wants" | "savings";
  cents: number;
  share: number | null; // da renda; null sem renda
  target: number; // 0.5 / 0.3 / 0.2
  /** needs/wants: teto; savings: piso */
  kind: "max" | "min";
  status: "ok" | "over" | "under" | "none";
}

export function rule503020(incomeCents: number, needsCents: number, wantsCents: number, savingsCents: number): RuleBucket[] {
  const bucket = (key: RuleBucket["key"], cents: number, target: number, kind: RuleBucket["kind"]): RuleBucket => {
    const share = incomeCents > 0 ? cents / incomeCents : null;
    const status =
      share == null ? "none" : kind === "max" ? (share <= target ? "ok" : "over") : share >= target ? "ok" : "under";
    return { key, cents, share, target, kind, status };
  };
  return [
    bucket("needs", needsCents, 0.5, "max"),
    bucket("wants", wantsCents, 0.3, "max"),
    bucket("savings", savingsCents, 0.2, "min"),
  ];
}

// ─── Orçamento diário ───────────────────────────────────────────────────────

/** Dias restantes no mês contando o próprio dia (0 se o mês já passou). */
export function daysLeftInMonth(day: Date, today = new Date()): number {
  const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  if (monthIndex(day) < monthIndex(today)) return 0;
  const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  return last - day.getDate() + 1;
}

/** Quanto dá para gastar por dia sem estourar o disponível (nunca negativo). */
export function dailyAllowance(availableCents: number, daysLeft: number): number {
  return daysLeft > 0 ? Math.max(Math.floor(availableCents / daysLeft), 0) : 0;
}
