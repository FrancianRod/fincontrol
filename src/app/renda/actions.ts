"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dashboard";
import { revalidateApp } from "@/lib/revalidate";
import { incomeSchema, parseForm, type FormState } from "@/lib/validation";

export async function createIncome(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const { data, error } = parseForm(incomeSchema, formData);
  if (error) return error;

  await db.income.create({ data: { ...data, userId: user.id } });
  revalidateApp();
  return { ok: true, nonce: Date.now() };
}

export async function updateIncome(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const { data, error } = parseForm(incomeSchema, formData);
  if (error) return error;

  const { count } = await db.income.updateMany({ where: { id, userId: user.id }, data });
  if (!count) return { ok: false, message: "Entrada não encontrada." };
  revalidateApp();
  return { ok: true, nonce: Date.now() };
}

export async function deleteIncome(id: string) {
  const user = await getCurrentUser();
  await db.income.deleteMany({ where: { id, userId: user.id } });
  revalidateApp();
}

export async function toggleIncomeReceived(id: string) {
  const user = await getCurrentUser();
  const income = await db.income.findFirst({ where: { id, userId: user.id } });
  if (!income) throw new Error("Entrada não encontrada");
  await db.income.update({ where: { id }, data: { received: !income.received } });
  revalidateApp();
}
