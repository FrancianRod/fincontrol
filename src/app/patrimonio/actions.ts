"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dashboard";
import { revalidateApp } from "@/lib/revalidate";
import { applyInstallment, effectiveSnapshot, toPeriod } from "@/lib/credit-letters";
import { getSnapshots, saveSnapshot } from "@/lib/credit-letter-data";
import { endOfDay, formatBRL, parseDayKey, shortDate } from "@/lib/finance";
import { firstOverdraft, totalBalance, yieldToReach, type InvestmentTx } from "@/lib/investments";
import {
  balanceUpdateSchema,
  creditLetterSchema,
  initialInvestmentTxSchema,
  investmentSchema,
  investmentTxSchema,
  parseForm,
  periodSchema,
  type FormState,
} from "@/lib/validation";

const ok = (): FormState => ({ ok: true, nonce: Date.now() });

// ─── Investimentos ──────────────────────────────────────────────────────────
// O saldo vem das movimentações (APORTE soma, RESGATE subtrai, RENDIMENTO soma
// com sinal). A coluna balanceCents é uma cópia da soma total, recalculada a
// cada mudança.

async function syncInvestmentBalance(investmentId: string) {
  const txs = await db.investmentTransaction.findMany({ where: { investmentId }, select: { type: true, amountCents: true } });
  await db.investment.update({ where: { id: investmentId }, data: { balanceCents: totalBalance(txs) } });
}

/** Mensagem de erro se as movimentações deixarem o saldo negativo em alguma data. */
function overdraftMessage(txs: InvestmentTx[]) {
  const over = firstOverdraft(txs);
  if (!over) return null;
  const what = over.tx.type === "RENDIMENTO" ? "a desvalorização" : "o resgate";
  return `${what} de ${formatBRL(Math.abs(over.tx.amountCents))} em ${shortDate(over.tx.date)} ficaria maior que o saldo disponível naquela data (${formatBRL(over.balanceBefore)}).`;
}

async function findInvestmentWithTxs(investmentId: string, userId: string) {
  return db.investment.findFirst({
    where: { id: investmentId, userId },
    include: { transactions: { select: { type: true, amountCents: true, date: true } } },
  });
}

export async function createInvestment(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const { data, error } = parseForm(investmentSchema, formData);
  if (error) return error;
  const tx = parseForm(initialInvestmentTxSchema, formData);
  if (tx.error) return tx.error;

  const { amountCents, type, date } = tx.data;
  if (amountCents && type === "RESGATE") {
    return {
      ok: false,
      message: "Corrija os campos destacados.",
      errors: { type: ["Um investimento novo ainda não tem saldo para resgatar. Comece com um aporte."] },
    };
  }

  await db.investment.create({
    data: {
      ...data,
      userId: user.id,
      balanceCents: amountCents ?? 0,
      transactions: amountCents ? { create: { type, amountCents, date, note: "Aporte inicial" } } : undefined,
    },
  });
  revalidateApp();
  return ok();
}

export async function updateInvestment(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const { data, error } = parseForm(investmentSchema, formData);
  if (error) return error;

  const { count } = await db.investment.updateMany({ where: { id, userId: user.id }, data });
  if (!count) return { ok: false, message: "Investimento não encontrado." };
  revalidateApp();
  return ok();
}

export async function deleteInvestment(id: string) {
  const user = await getCurrentUser();
  await db.investment.deleteMany({ where: { id, userId: user.id } });
  revalidateApp();
}

/** Lança um aporte (+) ou resgate (−) num investimento. */
export async function addInvestmentTransaction(investmentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const { data, error } = parseForm(investmentTxSchema, formData);
  if (error) return error;

  const investment = await findInvestmentWithTxs(investmentId, user.id);
  if (!investment) return { ok: false, message: "Investimento não encontrado." };

  const message = overdraftMessage([...investment.transactions, data]);
  if (message) {
    return { ok: false, message: `Não dá para lançar: ${message}`, errors: { amountCents: ["Maior que o saldo disponível"] } };
  }

  await db.investmentTransaction.create({ data: { ...data, investmentId } });
  await syncInvestmentBalance(investmentId);
  revalidateApp();
  return ok();
}

/**
 * Atualiza o saldo para o valor de mercado informado numa data: lança um
 * RENDIMENTO com a diferença em relação ao saldo ao fim daquele dia.
 */
export async function updateInvestmentMarketValue(investmentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const { data, error } = parseForm(balanceUpdateSchema, formData);
  if (error) return error;

  const investment = await findInvestmentWithTxs(investmentId, user.id);
  if (!investment) return { ok: false, message: "Investimento não encontrado." };

  // Fim do dia: o rendimento entra depois das movimentações daquele dia.
  const date = endOfDay(data.date);
  const amountCents = yieldToReach(data.marketValueCents, investment.transactions, date);
  if (amountCents === 0) {
    return { ok: false, message: `O saldo em ${shortDate(date)} já é ${formatBRL(data.marketValueCents)}.` };
  }

  const tx = { type: "RENDIMENTO" as const, amountCents, date };
  const message = overdraftMessage([...investment.transactions, tx]);
  if (message) return { ok: false, message: `Não dá para atualizar: ${message}` };

  await db.investmentTransaction.create({ data: { ...tx, investmentId, note: data.note ?? "Atualização de saldo" } });
  await syncInvestmentBalance(investmentId);
  revalidateApp();
  return ok();
}

/** Remove uma movimentação; recusa se isso deixar o saldo negativo em alguma data. */
export async function deleteInvestmentTransaction(transactionId: string): Promise<FormState> {
  const user = await getCurrentUser();
  const tx = await db.investmentTransaction.findFirst({
    where: { id: transactionId, investment: { userId: user.id } },
    select: { investmentId: true },
  });
  if (!tx) return { ok: false, message: "Movimentação não encontrada." };

  const remaining = await db.investmentTransaction.findMany({
    where: { investmentId: tx.investmentId, id: { not: transactionId } },
    select: { type: true, amountCents: true, date: true },
  });
  const message = overdraftMessage(remaining);
  if (message) return { ok: false, message: `Não dá para excluir: ${message}` };

  await db.investmentTransaction.delete({ where: { id: transactionId } });
  await syncInvestmentBalance(tx.investmentId);
  revalidateApp();
  return ok();
}

// ─── Cartas de crédito / consórcios ─────────────────────────────────────────
// Parcela, crédito corrigido, pago e saldo devedor são gravados como retrato
// do mês/ano selecionado (CreditLetterPeriod). Os demais campos são da carta.

function parseCreditLetter(formData: FormData) {
  const letter = parseForm(creditLetterSchema, formData);
  if (letter.error) return { error: letter.error };
  const period = parseForm(periodSchema, formData);
  if (period.error) return { error: { ok: false, message: "Selecione um mês/ano válido." } satisfies FormState };

  const { correctedCreditCents, paidCents, outstandingCents, installmentCents, paidInstallments, ...fixed } = letter.data;
  return {
    fixed,
    period: period.data.period,
    values: { correctedCreditCents, paidCents, outstandingCents, installmentCents, paidInstallments },
  };
}

export async function createCreditLetter(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const parsed = parseCreditLetter(formData);
  if (parsed.error) return parsed.error;

  await db.creditLetter.create({
    data: {
      ...parsed.fixed,
      ...parsed.values,
      userId: user.id,
      periods: { create: { period: parsed.period, ...parsed.values } },
    },
  });
  revalidateApp();
  return ok();
}

export async function updateCreditLetter(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const parsed = parseCreditLetter(formData);
  if (parsed.error) return parsed.error;

  const { count } = await db.creditLetter.updateMany({ where: { id, userId: user.id }, data: parsed.fixed });
  if (!count) return { ok: false, message: "Consórcio não encontrado." };

  // Mantém a marcação de parcela paga se o retrato do mês já existia.
  const existing = await db.creditLetterPeriod.findUnique({
    where: { creditLetterId_period: { creditLetterId: id, period: parsed.period } },
    select: { installmentPaid: true, installmentPaidAt: true },
  });
  await saveSnapshot(id, {
    period: parsed.period,
    ...parsed.values,
    installmentPaid: existing?.installmentPaid ?? false,
    installmentPaidAt: existing?.installmentPaidAt ?? null,
  });
  revalidateApp();
  return ok();
}

export async function deleteCreditLetter(id: string) {
  const user = await getCurrentUser();
  await db.creditLetter.deleteMany({ where: { id, userId: user.id } });
  revalidateApp();
}

/**
 * Registra (ou desfaz) a parcela do mês do dia informado ("AAAA-MM-DD"):
 * ajusta pago, saldo devedor e contagem naquele período e guarda o dia.
 */
export async function setCreditLetterInstallmentPaid(id: string, dayKey: string, paid: boolean) {
  const user = await getCurrentUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error("Data inválida");
  const day = parseDayKey(dayKey);
  const period = toPeriod(day.getFullYear(), day.getMonth());
  const paidAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  const letter = await db.creditLetter.findFirst({ where: { id, userId: user.id } });
  if (!letter) throw new Error("Consórcio não encontrado");

  const base = effectiveSnapshot(await getSnapshots(id), period);
  if (!base) throw new Error("Sem valores registrados para este período");

  const next = applyInstallment(base, period, letter.totalInstallments, !paid, paidAt);
  if (next === base) return;
  await saveSnapshot(id, next);
  revalidateApp();
}
