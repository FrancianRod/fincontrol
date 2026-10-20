import "server-only";
import { db } from "./db";
import { effectiveSnapshot, installmentDueInPeriod, periodLabel, toPeriod } from "./credit-letters";
import { addMonths, periodOfDate } from "./expense-series";
import {
  biggestMoves,
  categoryChanges,
  categoryColorSlots,
  dailyAllowance,
  daysLeftInMonth,
  rule503020,
  totalsByCategory,
  type CategoryExpense,
} from "./analytics";
import type { MonthSummary } from "./finance";

export interface HistoryMonth {
  period: number;
  label: string; // "out/26"
  incomeCents: number;
  fixedCents: number;
  variableCents: number;
  creditLetterCents: number;
  costsCents: number; // fixos + variáveis + consórcio
  surplusCents: number; // entradas − custos (sobra real)
  investedCents: number; // aportes − resgates no mês
}

/**
 * Dados dos painéis de inteligência para o mês do dia `day`: histórico de 12
 * meses (terminando nele), gastos por categoria, regra 50/30/20 e destaques.
 * Valores do mês consideram tudo o que está lançado no mês.
 */
export async function getDashboardAnalytics(userId: string, day: Date, summary: MonthSummary) {
  const period = toPeriod(day.getFullYear(), day.getMonth());
  const firstPeriod = addMonths(period, -11);
  const from = new Date(Math.floor(firstPeriod / 100), (firstPeriod % 100) - 1, 1);
  const to = new Date(day.getFullYear(), day.getMonth() + 1, 1);

  const [expenses, incomes, txs, letters] = await Promise.all([
    db.expense.findMany({
      where: { userId, dueDate: { gte: from, lt: to } },
      select: { category: true, type: true, amountCents: true, dueDate: true, essential: true },
    }),
    db.income.findMany({ where: { userId, date: { gte: from, lt: to } }, select: { amountCents: true, date: true } }),
    db.investmentTransaction.findMany({
      where: {
        investment: { userId },
        date: { gte: from, lt: to },
        type: { in: ["APORTE", "RESGATE"] },
        // "Saldo inicial" é o saldo pré-existente importado na migração, não um aporte do mês.
        OR: [{ note: null }, { note: { not: "Saldo inicial" } }],
      },
      select: { type: true, amountCents: true, date: true },
    }),
    db.creditLetter.findMany({ where: { userId }, select: { periods: true } }),
  ]);

  // ─── Histórico mês a mês ──────────────────────────────────────────────────
  const history: HistoryMonth[] = [];
  for (let p = firstPeriod; p <= period; p = addMonths(p, 1)) {
    const inMonth = <T extends { date?: Date; dueDate?: Date }>(x: T) => periodOfDate((x.dueDate ?? x.date)!) === p;
    const monthExpenses = expenses.filter(inMonth);
    const incomeCents = incomes.filter(inMonth).reduce((a, i) => a + i.amountCents, 0);
    const fixedCents = monthExpenses.filter((e) => e.type === "FIXED").reduce((a, e) => a + e.amountCents, 0);
    const variableCents = monthExpenses.filter((e) => e.type === "VARIABLE").reduce((a, e) => a + e.amountCents, 0);
    const creditLetterCents = letters.reduce((a, l) => a + installmentDueInPeriod(effectiveSnapshot(l.periods, p), p), 0);
    const costsCents = fixedCents + variableCents + creditLetterCents;
    const investedCents = txs
      .filter(inMonth)
      .reduce((a, t) => a + (t.type === "RESGATE" ? -t.amountCents : t.amountCents), 0);
    history.push({
      period: p,
      label: periodLabel(p).replace(/\/(\d{2})(\d{2})$/, "/$2"),
      incomeCents,
      fixedCents,
      variableCents,
      creditLetterCents,
      costsCents,
      surplusCents: incomeCents - costsCents,
      investedCents,
    });
  }
  const current = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;

  // ─── Categorias do mês ────────────────────────────────────────────────────
  const monthExpenses = expenses.filter((e) => periodOfDate(e.dueDate) === period);
  const categoryRows: CategoryExpense[] = monthExpenses.map((e) => ({ category: e.category, type: e.type, amountCents: e.amountCents }));
  const prevRows: CategoryExpense[] = expenses
    .filter((e) => periodOfDate(e.dueDate) === addMonths(period, -1))
    .map((e) => ({ category: e.category, type: e.type, amountCents: e.amountCents }));
  const slots = categoryColorSlots(categoryRows);

  const totals = [...totalsByCategory(categoryRows)].sort((a, b) => b[1] - a[1]);
  const costsTotal = totals.reduce((a, [, v]) => a + v, 0);
  const top = totals[0] ? { category: totals[0][0], cents: totals[0][1], share: costsTotal ? totals[0][1] / costsTotal : 0 } : null;
  const moves = biggestMoves(categoryChanges(totalsByCategory(categoryRows), totalsByCategory(prevRows)));

  // ─── Regra 50/30/20 ───────────────────────────────────────────────────────
  // Essenciais: tudo marcado como essencial (fixo ou variável). Estilo de vida:
  // o que não é essencial. Investimentos: aportes líquidos do mês + consórcio.
  const needs = monthExpenses.filter((e) => e.essential).reduce((a, e) => a + e.amountCents, 0);
  const wants = monthExpenses.filter((e) => !e.essential).reduce((a, e) => a + e.amountCents, 0);
  const savings = Math.max(current.investedCents, 0) + current.creditLetterCents;
  const rule = rule503020(current.incomeCents, needs, wants, savings);

  // ─── Orçamento diário ─────────────────────────────────────────────────────
  const daysLeft = daysLeftInMonth(day);
  const hasReference = summary.variable.referenceSource !== "none";
  // Com limite/média: o que sobra do orçamento de variáveis (sem os já agendados).
  // Sem referência: a sobra prevista do mês.
  const available = hasReference
    ? Math.max(summary.variable.remaining - summary.variable.scheduled, 0)
    : Math.max(summary.projectedSurplus, 0);

  return {
    periodLabel: periodLabel(period),
    history,
    categories: {
      rows: categoryRows,
      slots: Object.fromEntries(slots) as Record<string, number>,
    },
    rule,
    plannedSavingsCents: summary.commitments.total,
    insights: {
      top,
      up: moves.up,
      down: moves.down,
      previousLabel: previous ? periodLabel(previous.period) : null,
      costsChange: previous && previous.costsCents > 0 ? (current.costsCents - previous.costsCents) / previous.costsCents : null,
      daysLeft,
      availableCents: available,
      availableBasis: hasReference ? ("variable" as const) : ("surplus" as const),
      dailyCents: dailyAllowance(available, daysLeft),
    },
  };
}

export type DashboardAnalytics = Awaited<ReturnType<typeof getDashboardAnalytics>>;
