// Regras puras das despesas recorrentes/parceladas (sem acesso ao banco).
// Período = AAAAMM (ex.: 202610), igual aos consórcios.

import { fromPeriod, toPeriod, type Period } from "./credit-letters";

export type RecurrenceModeKey = "CONTINUOUS" | "INSTALLMENTS";

export interface SeriesRule {
  mode: RecurrenceModeKey;
  dueDay: number;
  startPeriod: Period;
  endPeriod: Period | null;
  totalInstallments: number | null;
  skippedPeriods: string;
}

export function addMonths(period: Period, n: number): Period {
  const { year, month } = fromPeriod(period);
  const d = new Date(year, month + n, 1);
  return toPeriod(d.getFullYear(), d.getMonth());
}

/** Quantos meses de `a` até `b` (b − a). */
export function monthsBetween(a: Period, b: Period): number {
  const pa = fromPeriod(a);
  const pb = fromPeriod(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

export const periodOfDate = (d: Date): Period => toPeriod(d.getFullYear(), d.getMonth());

/** Vencimento no período, ao meio-dia local, limitado ao último dia do mês. */
export function dueDateFor(period: Period, dueDay: number): Date {
  const { year, month } = fromPeriod(period);
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dueDay, last), 12);
}

export function parseSkipped(skipped: string): Set<Period> {
  return new Set(skipped.split(",").filter(Boolean).map(Number));
}

export function addSkipped(skipped: string, ...periods: Period[]): string {
  const set = parseSkipped(skipped);
  for (const p of periods) set.add(p);
  return [...set].sort((a, b) => a - b).join(",");
}

/** A série gera linha neste mês? (dentro do intervalo e não excluído) */
export function seriesCovers(rule: SeriesRule, period: Period): boolean {
  if (period < rule.startPeriod) return false;
  if (rule.endPeriod != null && period > rule.endPeriod) return false;
  return !parseSkipped(rule.skippedPeriods).has(period);
}

/** Meses que a série deve ter até `upto` (inclusive). */
export function seriesPeriodsUpTo(rule: SeriesRule, upto: Period): Period[] {
  const out: Period[] = [];
  const last = rule.endPeriod != null ? Math.min(rule.endPeriod, upto) : upto;
  for (let p = rule.startPeriod; p <= last; p = addMonths(p, 1)) if (seriesCovers(rule, p)) out.push(p);
  return out;
}

export function installmentNumberFor(rule: Pick<SeriesRule, "mode" | "startPeriod">, period: Period): number | null {
  return rule.mode === "INSTALLMENTS" ? monthsBetween(rule.startPeriod, period) + 1 : null;
}

/**
 * Parcelas que ainda faltam pagar. Parcelas anteriores ao primeiro mês
 * lançado (ex.: cadastrada já na 3/12) contam como pagas.
 */
export function remainingInstallments(total: number, rows: { installmentNumber: number | null; paid: boolean }[]): number {
  const numbers = rows.map((r) => r.installmentNumber).filter((n): n is number => n != null);
  const before = numbers.length ? Math.min(...numbers) - 1 : 0;
  const paid = rows.filter((r) => r.paid && r.installmentNumber != null).length;
  return Math.max(total - before - paid, 0);
}

// ─── Entrada do formulário → regra da série ─────────────────────────────────

export type RepeatInput =
  | { repeat: "NONE" }
  | { repeat: "CONTINUOUS"; endMode: "NEVER" }
  | { repeat: "CONTINUOUS"; endMode: "COUNT"; endCount: number }
  | { repeat: "CONTINUOUS"; endMode: "UNTIL"; endPeriod: Period }
  | { repeat: "INSTALLMENTS"; installments: number; currentInstallment: number };

/**
 * Converte a escolha do formulário numa regra, ancorada no mês `period` da
 * despesa sendo salva (a parcela `currentInstallment` cai nesse mês).
 */
export function ruleFromInput(input: Exclude<RepeatInput, { repeat: "NONE" }>, period: Period, dueDay: number) {
  if (input.repeat === "INSTALLMENTS") {
    const startPeriod = addMonths(period, -(input.currentInstallment - 1));
    return {
      mode: "INSTALLMENTS" as const,
      dueDay,
      startPeriod,
      endPeriod: addMonths(startPeriod, input.installments - 1),
      totalInstallments: input.installments,
    };
  }
  const endPeriod =
    input.endMode === "COUNT" ? addMonths(period, input.endCount - 1) : input.endMode === "UNTIL" ? input.endPeriod : null;
  return { mode: "CONTINUOUS" as const, dueDay, startPeriod: period, endPeriod, totalInstallments: null };
}

/** Pago até o fim do dia `until`? (sem paidAt, considera pago no vencimento) */
export function paidAsOf(e: { status: "PAID" | "PENDING"; paidAt: Date | null; dueDate: Date }, until: Date): boolean {
  return e.status === "PAID" && (e.paidAt ?? e.dueDate) <= until;
}
