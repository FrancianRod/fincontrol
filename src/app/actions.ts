"use server";

import { revalidateApp } from "@/lib/revalidate";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dashboard";
import { parseDayKey, toDayKey } from "@/lib/finance";
import { parseForm, variableBudgetSchema, type FormState } from "@/lib/validation";

/**
 * Alterna uma despesa entre Pago e Pendente. Com `dayKey` ("AAAA-MM-DD", o
 * dia do filtro), o pagamento fica registrado nesse dia; sem ele, agora.
 */
export async function toggleExpenseStatus(expenseId: string, dayKey?: string) {
  const user = await getCurrentUser();
  const expense = await db.expense.findFirst({ where: { id: expenseId, userId: user.id } });
  if (!expense) throw new Error("Despesa não encontrada");

  const paid = expense.status === "PENDING";
  let paidAt: Date | null = null;
  if (paid) {
    const day = dayKey && /^\d{4}-\d{2}-\d{2}$/.test(dayKey) && dayKey !== toDayKey(new Date()) ? parseDayKey(dayKey) : null;
    paidAt = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12) : new Date();
  }
  await db.expense.update({
    where: { id: expense.id },
    data: { status: paid ? "PAID" : "PENDING", paidAt },
  });
  revalidateApp();
}

/** Define (ou limpa, com campo vazio) o limite mensal de custos variáveis. */
export async function updateVariableBudget(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const { data, error } = parseForm(variableBudgetSchema, formData);
  if (error) return error;

  await db.user.update({ where: { id: user.id }, data: { variableBudgetCents: data.variableBudgetCents } });
  revalidateApp();
  return { ok: true, nonce: Date.now() };
}

/** Remove o limite: a projeção volta a usar a média dos últimos 3 meses. */
export async function clearVariableBudget() {
  const user = await getCurrentUser();
  await db.user.update({ where: { id: user.id }, data: { variableBudgetCents: null } });
  revalidateApp();
}
