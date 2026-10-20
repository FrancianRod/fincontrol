import "server-only";
import { db } from "./db";
import type { Period } from "./credit-letters";
import { dueDateFor, installmentNumberFor, periodOfDate, seriesPeriodsUpTo } from "./expense-series";

/**
 * Cria as linhas mensais que faltam das séries recorrentes/parceladas até
 * `upto` (e no mínimo até o mês atual). Chamado ao abrir um mês: navegar
 * para frente "projeta" as despesas automaticamente. Idempotente.
 */
export async function ensureSeriesRows(userId: string, upto: Period) {
  const limit = Math.max(upto, periodOfDate(new Date()));
  const series = await db.expenseSeries.findMany({
    where: { userId, startPeriod: { lte: limit } },
    include: { expenses: { select: { dueDate: true } } },
  });

  const rows = series.flatMap((s) => {
    const existing = new Set(s.expenses.map((e) => periodOfDate(e.dueDate)));
    return seriesPeriodsUpTo(s, limit)
      .filter((p) => !existing.has(p))
      .map((p) => ({
        userId,
        seriesId: s.id,
        description: s.description,
        amountCents: s.amountCents,
        category: s.category,
        type: s.type,
        essential: s.essential,
        status: "PENDING" as const,
        dueDate: dueDateFor(p, s.dueDay),
        installmentNumber: installmentNumberFor(s, p),
      }));
  });

  if (rows.length) await db.expense.createMany({ data: rows });
  return rows.length;
}
