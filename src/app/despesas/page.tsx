import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dashboard";
import { endOfDay, formatBRL, monthRange, parseDayKey, shortDate, toDayKey } from "@/lib/finance";
import { toDateInput } from "@/lib/form-state";
import { periodLabel, toPeriod } from "@/lib/credit-letters";
import { ensureSeriesRows } from "@/lib/expense-data";
import { paidAsOf, remainingInstallments } from "@/lib/expense-series";
import { Card, Stat } from "@/components/ui";
import { DayFilter } from "@/components/day-filter";
import { PageSkeleton } from "@/components/page-skeleton";
import { ExpenseManager, type ExpenseItem } from "./expense-manager";

export const metadata: Metadata = { title: "Despesas · Fincontrol" };

const filters = [
  { key: undefined, label: "Todas" },
  { key: "fixas", label: "Fixas" },
  { key: "variaveis", label: "Variáveis" },
] as const;

const defaultCategories = ["Moradia", "Contas", "Alimentação", "Transporte", "Saúde", "Lazer", "Assinaturas", "Educação", "Outros"];

export default function DespesasPage({ searchParams }: PageProps<"/despesas">) {
  return (
    <Suspense fallback={<PageSkeleton label="Carregando despesas" />}>
      <Despesas searchParams={searchParams} />
    </Suspense>
  );
}

async function Despesas({ searchParams }: Pick<PageProps<"/despesas">, "searchParams">) {
  await connection();
  const { data, tipo } = await searchParams;
  const today = new Date();
  // O mês exibido é o do dia selecionado; status e totais "até o dia" usam o fim desse dia.
  const day = parseDayKey(typeof data === "string" ? data : undefined, today);
  const dayKey = toDayKey(day);
  const until = endOfDay(day);
  const period = toPeriod(day.getFullYear(), day.getMonth());
  const { start, end } = monthRange(day.getFullYear(), day.getMonth());
  const filter = tipo === "fixas" || tipo === "variaveis" ? tipo : undefined;

  const user = await getCurrentUser();
  // Recorrentes e parceladas aparecem automaticamente nos meses abertos.
  await ensureSeriesRows(user.id, period);

  const [expenses, usedCategories] = await Promise.all([
    db.expense.findMany({
      where: { userId: user.id, dueDate: { gte: start, lt: end } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: {
        series: {
          include: { expenses: { select: { installmentNumber: true, status: true, paidAt: true, dueDate: true } } },
        },
      },
    }),
    db.expense.findMany({ where: { userId: user.id }, distinct: ["category"], select: { category: true } }),
  ]);

  const rows = expenses.map((e) => ({ ...e, paidNow: paidAsOf(e, until) }));
  const sum = (xs: typeof rows) => xs.reduce((a, e) => a + e.amountCents, 0);
  const fixed = rows.filter((e) => e.type === "FIXED");
  const variable = rows.filter((e) => e.type === "VARIABLE");
  const visible = filter === "fixas" ? fixed : filter === "variaveis" ? variable : rows;
  const dueUntilDay = rows.filter((e) => e.dueDate <= until);
  const openUntilDay = dueUntilDay.filter((e) => !e.paidNow);
  const onDay = `até ${shortDate(day)}`;

  const categories = [...new Set([...usedCategories.map((c) => c.category), ...defaultCategories])].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  const filterHref = (key?: string) => {
    const p = new URLSearchParams();
    if (data) p.set("data", dayKey);
    if (key) p.set("tipo", key);
    const qs = p.toString();
    return qs ? `/despesas?${qs}` : "/despesas";
  };

  const items: ExpenseItem[] = visible.map((e) => {
    const s = e.series;
    const paidLater = e.status === "PAID" && !e.paidNow;
    return {
      id: e.id,
      description: e.description,
      amountCents: e.amountCents,
      category: e.category,
      type: e.type,
      status: e.status,
      paidAsOf: e.paidNow,
      paidLaterLabel: paidLater && e.paidAt ? shortDate(e.paidAt) : null,
      dueDate: toDateInput(e.dueDate),
      dueAfterDay: e.dueDate > until,
      essential: e.essential,
      series: s
        ? {
            mode: s.mode,
            installmentNumber: e.installmentNumber,
            totalInstallments: s.totalInstallments,
            remaining:
              s.mode === "INSTALLMENTS" && s.totalInstallments
                ? remainingInstallments(
                    s.totalInstallments,
                    s.expenses.map((x) => ({ installmentNumber: x.installmentNumber, paid: paidAsOf(x, until) })),
                  )
                : null,
            endLabel: s.endPeriod != null ? periodLabel(s.endPeriod) : null,
            endMonthKey: s.endPeriod != null ? `${Math.floor(s.endPeriod / 100)}-${String(s.endPeriod % 100).padStart(2, "0")}` : null,
          }
        : null,
    };
  });

  return (
    <div className="space-y-6">
      <DayFilter eyebrow="Despesas" dayKey={dayKey} todayKey={toDayKey(today)} fromYear={today.getFullYear() - 3} toYear={today.getFullYear() + 3} />

      <div className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4">
        <Stat label={`Total de ${periodLabel(period)}`} value={formatBRL(sum(rows))} sub={`${formatBRL(sum(rows.filter((e) => e.paidNow)))} pago ${onDay}`} />
        <Stat
          label={`Em aberto ${onDay}`}
          value={formatBRL(sum(openUntilDay))}
          sub={
            openUntilDay.length
              ? `${openUntilDay.length} com vencimento até a data, sem pagamento`
              : "nada vencendo até a data em aberto"
          }
          tone={openUntilDay.length ? "critical" : undefined}
        />
        <Stat label="Fixas" value={formatBRL(sum(fixed))} sub={`${fixed.filter((e) => e.paidNow).length}/${fixed.length} pagas ${onDay}`} />
        <Stat
          label="Variáveis"
          value={formatBRL(sum(variable))}
          sub={`${formatBRL(sum(variable.filter((e) => e.dueDate <= until)))} lançados ${onDay}`}
        />
      </div>

      <nav aria-label="Filtrar por tipo" className="flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={filterHref(f.key)}
            aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${filter === f.key ? "bg-surface-2 font-medium" : "text-fg-2 hover:bg-surface-2"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <Card>
        <ExpenseManager
          key={`${filter ?? "all"}-${dayKey}`}
          items={items}
          categories={categories}
          defaultType={filter === "variaveis" ? "VARIABLE" : "FIXED"}
          dayKey={dayKey}
          dayLabel={shortDate(day)}
        />
      </Card>
    </div>
  );
}
