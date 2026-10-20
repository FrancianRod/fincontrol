import "server-only";
import { db } from "./db";
import { effectiveSnapshot, installmentDueInPeriod, snapshotAtDate, type Period, type Snapshot } from "./credit-letters";

const snapshotSelect = {
  period: true,
  correctedCreditCents: true,
  paidCents: true,
  outstandingCents: true,
  installmentCents: true,
  paidInstallments: true,
  installmentPaid: true,
  installmentPaidAt: true,
} as const;

/**
 * Consórcios do usuário com os valores vigentes no período.
 * `snapshot` é null quando não há registro até aquele mês (ex.: mês anterior
 * ao cadastro) — nesse caso o consórcio não entra na projeção.
 * Com `at`, os valores são os do dia exato (parcela registrada depois do dia
 * ainda não conta).
 */
export async function getCreditLettersForPeriod(userId: string, period: Period, at?: Date) {
  const letters = await db.creditLetter.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { periods: { select: snapshotSelect, orderBy: { period: "asc" } } },
  });

  return letters.map(({ periods, ...letter }) => {
    const exact = at ? snapshotAtDate(periods, at) : null;
    const snapshot = exact ? exact.snapshot : effectiveSnapshot(periods, period);
    const current = effectiveSnapshot(periods, period);
    return {
      ...letter,
      snapshot,
      /** Há um retrato registrado exatamente neste mês (reajuste/pagamento). */
      exactPeriod: snapshot?.period === period,
      installmentPaidThisPeriod: snapshot?.period === period && snapshot.installmentPaid,
      /** Parcela do mês registrada depois do dia consultado. */
      installmentPaidLaterAt: exact?.paidLaterAt ?? null,
      // A parcela do mês pesa no compromisso mesmo se paga depois do dia.
      dueThisPeriodCents: installmentDueInPeriod(current, period),
      firstPeriod: periods[0]?.period ?? null,
    };
  });
}

export type CreditLetterForPeriod = Awaited<ReturnType<typeof getCreditLettersForPeriod>>[number];

/** Grava o retrato do período e mantém as colunas "vigentes" da carta iguais ao último retrato. */
export async function saveSnapshot(creditLetterId: string, snapshot: Snapshot) {
  const { period, ...values } = snapshot;
  await db.creditLetterPeriod.upsert({
    where: { creditLetterId_period: { creditLetterId, period } },
    create: { creditLetterId, period, ...values },
    update: values,
  });
  await syncLatest(creditLetterId);
}

export async function syncLatest(creditLetterId: string) {
  const latest = await db.creditLetterPeriod.findFirst({
    where: { creditLetterId },
    orderBy: { period: "desc" },
    select: snapshotSelect,
  });
  if (!latest) return;
  await db.creditLetter.update({
    where: { id: creditLetterId },
    data: {
      correctedCreditCents: latest.correctedCreditCents,
      paidCents: latest.paidCents,
      outstandingCents: latest.outstandingCents,
      installmentCents: latest.installmentCents,
      paidInstallments: latest.paidInstallments,
    },
  });
}

export async function getSnapshots(creditLetterId: string) {
  return db.creditLetterPeriod.findMany({ where: { creditLetterId }, select: snapshotSelect });
}
