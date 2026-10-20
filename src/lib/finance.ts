// Regras de negócio puras (sem acesso ao banco) — fáceis de testar.
// Todos os valores em centavos.

export type MonthKey = `${number}-${string}`; // "2026-10"

export function toMonthKey(d: Date): MonthKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` as MonthKey;
}

export function parseMonthKey(key: string | undefined, fallback = new Date()): { year: number; month: number } {
  const m = key?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]) - 1;
    if (month >= 0 && month <= 11) return { year: Number(m[1]), month };
  }
  return { year: fallback.getFullYear(), month: fallback.getMonth() };
}

export function monthRange(year: number, month: number) {
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
}

export function shiftMonth(year: number, month: number, delta: number): MonthKey {
  return toMonthKey(new Date(year, month + delta, 1));
}

// ─── Dias ("AAAA-MM-DD", fuso local) ─────────────────────────────────────────

export function toDayKey(d: Date): string {
  return `${toMonthKey(d)}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-10-16" -> Date às 00:00 local; data inválida cai no fallback. */
export function parseDayKey(key: string | undefined, fallback = new Date()): Date {
  const m = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() === Number(m[2]) - 1) return d;
  }
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

export function shiftDay(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
}

/** Último instante do dia (para "até a data, inclusive"). */
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Mesmo dia em outro mês/ano, limitado ao último dia do mês (31/jan -> 28/fev). */
export function withMonth(d: Date, year: number, month: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(d.getDate(), last));
}

export function dayLabel(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export function shortDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Situação do mês consultado em relação a hoje. */
export type MonthPhase = "past" | "current" | "future";

export function monthPhase(year: number, month: number, today = new Date()): MonthPhase {
  const a = year * 12 + month;
  const b = today.getFullYear() * 12 + today.getMonth();
  return a < b ? "past" : a > b ? "future" : "current";
}

// ─── Entradas do cálculo ─────────────────────────────────────────────────────

export interface IncomeRow {
  amountCents: number;
  received: boolean;
}

export interface ExpenseRow {
  amountCents: number;
  type: "FIXED" | "VARIABLE";
  status: "PAID" | "PENDING";
  essential: boolean;
}

export interface MonthInput {
  phase: MonthPhase;
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
  /** Limite definido pelo usuário; se nulo usamos a média histórica. */
  variableBudgetCents: number | null;
  /** Totais de custos variáveis dos meses anteriores (para a média). */
  variableHistoryCents: number[];
  /** Soma dos aportes mensais planejados em investimentos. */
  investmentContributionCents: number;
  /** Soma das parcelas mensais de consórcios ainda com saldo devedor. */
  creditLetterInstallmentCents: number;
  /**
   * Variáveis do mês já lançados com data depois do dia consultado (fora de
   * `expenses`). Entram na projeção como gasto previsto.
   */
  variableScheduledCents?: number;
}

export interface MonthSummary {
  income: { received: number; expected: number; total: number };
  fixed: { paid: number; pending: number; total: number };
  variable: {
    spent: number;
    essential: number;
    /** Referência usada na projeção (limite ou média). */
    reference: number;
    referenceSource: "budget" | "average" | "none";
    /** Quanto ainda deve ser gasto até o fim do mês, segundo a referência. */
    remaining: number;
    /** Variáveis lançados para depois do dia consultado (já contidos em remaining). */
    scheduled: number;
  };
  costs: { total: number };
  commitments: { investments: number; creditLetters: number; total: number };
  /** Renda recebida − despesas já pagas. */
  currentBalance: number;
  /** Renda total − fixos − variáveis (gasto + restante) − aportes. */
  projectedSurplus: number;
  /** Fixos + variáveis essenciais. */
  costOfLiving: { fixed: number; variableEssential: number; total: number; shareOfIncome: number | null };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function average(xs: number[]): number {
  return xs.length ? Math.round(sum(xs) / xs.length) : 0;
}

export function summarizeMonth(input: MonthInput): MonthSummary {
  const received = sum(input.incomes.filter((i) => i.received).map((i) => i.amountCents));
  const expected = sum(input.incomes.filter((i) => !i.received).map((i) => i.amountCents));
  const incomeTotal = received + expected;

  const fixed = input.expenses.filter((e) => e.type === "FIXED");
  const variable = input.expenses.filter((e) => e.type === "VARIABLE");

  const fixedPaid = sum(fixed.filter((e) => e.status === "PAID").map((e) => e.amountCents));
  const fixedPending = sum(fixed.filter((e) => e.status === "PENDING").map((e) => e.amountCents));
  const variableSpent = sum(variable.map((e) => e.amountCents));
  const variableEssential = sum(variable.filter((e) => e.essential).map((e) => e.amountCents));
  const variablePaid = sum(variable.filter((e) => e.status === "PAID").map((e) => e.amountCents));

  const history = input.variableHistoryCents.filter((v) => v > 0);
  const referenceSource =
    input.variableBudgetCents != null ? "budget" : history.length ? "average" : "none";
  const reference =
    referenceSource === "budget" ? input.variableBudgetCents! : referenceSource === "average" ? average(history) : 0;

  // Mês encerrado: vale só o que foi lançado. Senão, o mês fecha com o maior
  // entre a referência e o total já lançado (até o dia + agendados).
  const scheduled = input.variableScheduledCents ?? 0;
  const remaining =
    input.phase === "past" ? scheduled : Math.max(Math.max(reference, variableSpent + scheduled) - variableSpent, 0);

  const commitmentsTotal = input.investmentContributionCents + input.creditLetterInstallmentCents;
  const costsTotal = fixedPaid + fixedPending + variableSpent;

  const projectedSurplus = incomeTotal - costsTotal - remaining - commitmentsTotal;

  const fixedTotal = fixedPaid + fixedPending;
  const colTotal = fixedTotal + variableEssential;

  return {
    income: { received, expected, total: incomeTotal },
    fixed: { paid: fixedPaid, pending: fixedPending, total: fixedTotal },
    variable: { spent: variableSpent, essential: variableEssential, reference, referenceSource, remaining, scheduled },
    costs: { total: costsTotal },
    commitments: {
      investments: input.investmentContributionCents,
      creditLetters: input.creditLetterInstallmentCents,
      total: commitmentsTotal,
    },
    currentBalance: received - fixedPaid - variablePaid,
    projectedSurplus,
    costOfLiving: {
      fixed: fixedTotal,
      variableEssential,
      total: colTotal,
      shareOfIncome: incomeTotal > 0 ? colTotal / incomeTotal : null,
    },
  };
}

// ─── Formatação ──────────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatBRL = (cents: number) => brl.format(cents / 100);
export const formatBRLCompact = (cents: number) => brlCompact.format(cents / 100);
export const formatPct = (ratio: number) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(ratio);

export function monthLabel(year: number, month: number) {
  const s = new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
