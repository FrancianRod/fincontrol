"use server";

import type { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dashboard";
import { parseDayKey, toDayKey } from "@/lib/finance";
import {
  addMonths,
  addSkipped,
  dueDateFor,
  installmentNumberFor,
  periodOfDate,
  ruleFromInput,
  type RepeatInput,
} from "@/lib/expense-series";
import { fromPeriod, type Period } from "@/lib/credit-letters";
import { revalidateApp } from "@/lib/revalidate";
import { expenseRepeatSchema, expenseSchema, parseForm, type FormState } from "@/lib/validation";

type ExpenseInput = z.output<typeof expenseSchema>;
type RepeatForm = z.output<typeof expenseRepeatSchema>;

const ok = (): FormState => ({ ok: true, nonce: Date.now() });
const monthStart = (p: Period) => {
  const { year, month } = fromPeriod(p);
  return new Date(year, month, 1);
};

/** Data de pagamento: o dia do filtro (agora, se for hoje); mantém a existente. */
function paidAtFor(data: ExpenseInput, existing?: Date | null): Date | null {
  if (data.status !== "PAID") return null;
  if (existing) return existing;
  if (!data.paidOn || data.paidOn === toDayKey(new Date())) return new Date();
  const d = parseDayKey(data.paidOn);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

function rowFields(data: ExpenseInput, existingPaidAt?: Date | null) {
  return {
    description: data.description,
    amountCents: data.amountCents,
    category: data.category,
    type: data.type,
    status: data.status,
    dueDate: data.dueDate,
    essential: data.essential,
    paidAt: paidAtFor(data, existingPaidAt),
  };
}

function toRepeatInput(r: RepeatForm): RepeatInput {
  if (r.repeat === "INSTALLMENTS") {
    return { repeat: "INSTALLMENTS", installments: r.installments!, currentInstallment: r.currentInstallment ?? 1 };
  }
  if (r.repeat === "CONTINUOUS") {
    if (r.endMode === "COUNT") return { repeat: "CONTINUOUS", endMode: "COUNT", endCount: r.endCount! };
    if (r.endMode === "UNTIL") return { repeat: "CONTINUOUS", endMode: "UNTIL", endPeriod: Number(r.endMonth!.replace("-", "")) };
    return { repeat: "CONTINUOUS", endMode: "NEVER" };
  }
  return { repeat: "NONE" };
}

function parseAll(formData: FormData) {
  const expense = parseForm(expenseSchema, formData);
  if (expense.error) return { error: expense.error };
  const repeat = parseForm(expenseRepeatSchema, formData);
  if (repeat.error) return { error: repeat.error };
  return { data: expense.data, repeat: repeat.data, input: toRepeatInput(repeat.data) };
}

/** Regra da série ancorada no mês `period`; erro se terminar antes dele. */
function buildRule(input: Exclude<RepeatInput, { repeat: "NONE" }>, period: Period, dueDay: number) {
  const rule = ruleFromInput(input, period, dueDay);
  if (rule.endPeriod != null && rule.endPeriod < period) {
    return { error: { ok: false, message: "Corrija os campos destacados.", errors: { endMonth: ["Antes do mês da despesa"] } } satisfies FormState };
  }
  // Parcelas anteriores ao mês cadastrado (ex.: começou na 3/12) não são geradas.
  const skipped: Period[] = [];
  for (let p = rule.startPeriod; p < period; p = addMonths(p, 1)) skipped.push(p);
  return { rule, skippedPeriods: addSkipped("", ...skipped) };
}

export async function createExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const parsed = parseAll(formData);
  if (parsed.error) return parsed.error;
  const { data, input } = parsed;

  if (input.repeat === "NONE") {
    await db.expense.create({ data: { ...rowFields(data), userId: user.id } });
  } else {
    const period = periodOfDate(data.dueDate);
    const built = buildRule(input, period, data.dueDate.getDate());
    if (built.error) return built.error;
    const { rule, skippedPeriods } = built;

    await db.expenseSeries.create({
      data: {
        userId: user.id,
        ...rule,
        skippedPeriods,
        description: data.description,
        amountCents: data.amountCents,
        category: data.category,
        type: data.type,
        essential: data.essential,
        expenses: {
          create: { ...rowFields(data), userId: user.id, installmentNumber: installmentNumberFor(rule, period) },
        },
      },
    });
  }
  revalidateApp();
  return ok();
}

export async function updateExpense(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const parsed = parseAll(formData);
  if (parsed.error) return parsed.error;
  const { data, repeat, input } = parsed;

  const existing = await db.expense.findFirst({ where: { id, userId: user.id }, include: { series: true } });
  if (!existing) return { ok: false, message: "Despesa não encontrada." };
  const period = periodOfDate(existing.dueDate);
  const dueDay = data.dueDate.getDate();

  // Despesa avulsa
  if (!existing.series) {
    if (input.repeat === "NONE") {
      await db.expense.update({ where: { id }, data: rowFields(data, existing.paidAt) });
    } else {
      const built = buildRule(input, period, dueDay);
      if (built.error) return built.error;
      const { rule, skippedPeriods } = built;
      const series = await db.expenseSeries.create({
        data: {
          userId: user.id,
          ...rule,
          skippedPeriods,
          description: data.description,
          amountCents: data.amountCents,
          category: data.category,
          type: data.type,
          essential: data.essential,
        },
      });
      await db.expense.update({
        where: { id },
        data: { ...rowFields(data, existing.paidAt), seriesId: series.id, installmentNumber: installmentNumberFor(rule, period) },
      });
    }
    revalidateApp();
    return ok();
  }

  // Só este mês
  if (repeat.scope === "THIS") {
    await db.expense.update({ where: { id }, data: rowFields(data, existing.paidAt) });
    revalidateApp();
    return ok();
  }

  // Este mês e os próximos
  const series = existing.series;
  const nextMonth = monthStart(addMonths(period, 1));

  if (input.repeat === "NONE") {
    // Para de repetir depois deste mês.
    await db.$transaction([
      db.expenseSeries.update({ where: { id: series.id }, data: { endPeriod: period } }),
      db.expense.deleteMany({ where: { seriesId: series.id, status: "PENDING", dueDate: { gte: nextMonth } } }),
      db.expense.update({ where: { id }, data: rowFields(data, existing.paidAt) }),
    ]);
    revalidateApp();
    return ok();
  }

  const built = buildRule(input, period, dueDay);
  if (built.error) return built.error;
  const rule = {
    ...built.rule,
    // Recorrência contínua mantém o histórico anterior; parcelada renumera a partir da regra.
    startPeriod: built.rule.mode === "CONTINUOUS" ? Math.min(series.startPeriod, built.rule.startPeriod) : built.rule.startPeriod,
  };

  const following = await db.expense.findMany({
    where: { seriesId: series.id, id: { not: id }, dueDate: { gte: nextMonth } },
    select: { id: true, dueDate: true, status: true },
  });
  const beyondEnd = (p: Period) => rule.endPeriod != null && p > rule.endPeriod;

  await db.$transaction([
    db.expenseSeries.update({
      where: { id: series.id },
      data: {
        ...rule,
        description: data.description,
        amountCents: data.amountCents,
        category: data.category,
        type: data.type,
        essential: data.essential,
      },
    }),
    db.expense.update({
      where: { id },
      data: { ...rowFields(data, existing.paidAt), installmentNumber: installmentNumberFor(rule, period) },
    }),
    // Meses seguintes: mesmo conteúdo, vencimento no novo dia; status de cada mês é mantido.
    ...following
      .filter((e) => !(beyondEnd(periodOfDate(e.dueDate)) && e.status === "PENDING"))
      .map((e) => {
        const p = periodOfDate(e.dueDate);
        return db.expense.update({
          where: { id: e.id },
          data: {
            description: data.description,
            amountCents: data.amountCents,
            category: data.category,
            type: data.type,
            essential: data.essential,
            dueDate: dueDateFor(p, dueDay),
            installmentNumber: installmentNumberFor(rule, p),
          },
        });
      }),
    // Meses pendentes depois do novo término somem.
    db.expense.deleteMany({
      where: {
        id: { in: following.filter((e) => beyondEnd(periodOfDate(e.dueDate)) && e.status === "PENDING").map((e) => e.id) },
      },
    }),
  ]);
  revalidateApp();
  return ok();
}

/**
 * Exclui uma despesa. Em série: "THIS" remove só este mês (não volta a ser
 * gerado); "FOLLOWING" remove este e os próximos e encerra a série.
 */
export async function deleteExpense(id: string, scope: "THIS" | "FOLLOWING" = "THIS") {
  const user = await getCurrentUser();
  const row = await db.expense.findFirst({ where: { id, userId: user.id }, include: { series: true } });
  if (!row) return;
  const period = periodOfDate(row.dueDate);

  if (!row.series) {
    await db.expense.delete({ where: { id } });
  } else if (scope === "THIS") {
    await db.$transaction([
      db.expenseSeries.update({ where: { id: row.series.id }, data: { skippedPeriods: addSkipped(row.series.skippedPeriods, period) } }),
      db.expense.delete({ where: { id } }),
    ]);
  } else {
    const remainingBefore = await db.expense.count({ where: { seriesId: row.series.id, dueDate: { lt: monthStart(period) } } });
    await db.$transaction([
      db.expense.deleteMany({ where: { seriesId: row.series.id, dueDate: { gte: monthStart(period) } } }),
      remainingBefore === 0
        ? db.expenseSeries.delete({ where: { id: row.series.id } })
        : db.expenseSeries.update({ where: { id: row.series.id }, data: { endPeriod: addMonths(period, -1) } }),
    ]);
  }
  revalidateApp();
}
