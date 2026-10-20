// Regras puras dos consórcios por período (sem acesso ao banco).
// Período = AAAAMM (ex.: 202610). Para um mês qualquer vale o retrato mais
// recente até ele: os valores se mantêm até o próximo reajuste registrado.

export type Period = number;

export function toPeriod(year: number, month0: number): Period {
  return year * 100 + month0 + 1;
}

export function fromPeriod(period: Period): { year: number; month: number } {
  return { year: Math.floor(period / 100), month: (period % 100) - 1 };
}

/** "2026-10" -> 202610; null se inválido. */
export function parsePeriodKey(key: string): Period | null {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? Number(m[1]) * 100 + month : null;
}

export function periodLabel(period: Period) {
  const { year, month } = fromPeriod(period);
  const s = new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  return s.replace(".", "").replace(" de ", "/");
}

export interface Snapshot {
  period: Period;
  correctedCreditCents: number | null;
  paidCents: number;
  outstandingCents: number;
  installmentCents: number;
  paidInstallments: number;
  installmentPaid: boolean;
  /** Quando a parcela do mês foi registrada (null = início do mês). */
  installmentPaidAt?: Date | null;
}

/** Retrato vigente no período: o mais recente com period <= alvo. */
export function effectiveSnapshot<T extends Snapshot>(snapshots: T[], period: Period): T | null {
  let best: T | null = null;
  for (const s of snapshots) if (s.period <= period && (!best || s.period > best.period)) best = s;
  return best;
}

/** A parcela pesa no mês se ainda há saldo devedor ou se foi paga neste mês. */
export function installmentDueInPeriod(snapshot: Snapshot | null, period: Period): number {
  if (!snapshot) return 0;
  const paidThisMonth = snapshot.period === period && snapshot.installmentPaid;
  return snapshot.outstandingCents > 0 || paidThisMonth ? snapshot.installmentCents : 0;
}

/** Novo retrato ao registrar (ou desfazer) a parcela do período. */
export function applyInstallment(
  base: Snapshot,
  period: Period,
  totalInstallments: number | null,
  undo = false,
  paidAt: Date | null = null,
): Snapshot {
  if (undo) {
    // Só desfaz se a parcela foi registrada exatamente neste período.
    if (base.period !== period || !base.installmentPaid) return base;
    const amount = Math.min(base.installmentCents, base.paidCents);
    return {
      ...base,
      paidCents: base.paidCents - amount,
      outstandingCents: base.outstandingCents + amount,
      paidInstallments: Math.max(base.paidInstallments - 1, 0),
      installmentPaid: false,
      installmentPaidAt: null,
    };
  }

  const alreadyPaid = base.period === period && base.installmentPaid;
  if (alreadyPaid || base.outstandingCents <= 0) return base;

  const amount = Math.min(base.installmentCents, base.outstandingCents);
  const paidInstallments = base.paidInstallments + 1;
  return {
    ...base,
    period,
    paidCents: base.paidCents + amount,
    outstandingCents: base.outstandingCents - amount,
    paidInstallments: totalInstallments ? Math.min(paidInstallments, totalInstallments) : paidInstallments,
    installmentPaid: true,
    installmentPaidAt: paidAt,
  };
}

/**
 * Retrato vigente num dia exato. Se a parcela do mês foi registrada depois
 * desse dia, devolve os valores de antes do pagamento.
 */
export function snapshotAtDate<T extends Snapshot>(snapshots: T[], date: Date): { snapshot: Snapshot | null; paidLaterAt: Date | null } {
  const period = toPeriod(date.getFullYear(), date.getMonth());
  const s = effectiveSnapshot(snapshots, period);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  if (s && s.period === period && s.installmentPaid && s.installmentPaidAt && s.installmentPaidAt > endOfDay) {
    return { snapshot: applyInstallment(s, period, null, true), paidLaterAt: s.installmentPaidAt };
  }
  return { snapshot: s, paidLaterAt: null };
}
