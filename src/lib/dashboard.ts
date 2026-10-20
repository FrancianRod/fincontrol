import "server-only";
import { db } from "./db";
import { endOfDay, monthPhase, monthRange, summarizeMonth } from "./finance";
import { assetTypeOrder } from "./labels";
import { toPeriod } from "./credit-letters";
import { getCreditLettersForPeriod } from "./credit-letter-data";
import { ensureSeriesRows } from "./expense-data";
import { paidAsOf } from "./expense-series";
import { balanceAt } from "./investments";

/**
 * Sem autenticação por enquanto: o app é single-user e usa o primeiro
 * usuário do banco (criado automaticamente se não existir).
 */
export async function getCurrentUser() {
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  return user ?? db.user.create({ data: { name: "Você", email: "voce@exemplo.com" } });
}

/**
 * Dados do dashboard para o mês do dia `day`. O que é "até a data" (renda
 * recebida, custos pagos, variáveis gastos, saldo em conta, patrimônio) usa
 * o fim desse dia; a sobra continua sendo a projeção do fim do mês.
 */
export async function getDashboardData(day: Date) {
  const user = await getCurrentUser();
  const year = day.getFullYear();
  const month = day.getMonth();
  const until = endOfDay(day);
  const { start, end } = monthRange(year, month);
  const historyStart = new Date(year, month - 3, 1);
  // Recorrentes/parceladas do mês entram na projeção mesmo que o mês nunca tenha sido aberto.
  await ensureSeriesRows(user.id, toPeriod(year, month));

  const [incomes, expenses, variableHistory, investments, creditLetters] = await Promise.all([
    db.income.findMany({ where: { userId: user.id, date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    db.expense.findMany({ where: { userId: user.id, dueDate: { gte: start, lt: end } }, orderBy: { dueDate: "asc" } }),
    db.expense.findMany({
      where: { userId: user.id, type: "VARIABLE", dueDate: { gte: historyStart, lt: start } },
      select: { amountCents: true, dueDate: true },
    }),
    db.investment.findMany({
      where: { userId: user.id },
      include: { transactions: { select: { type: true, amountCents: true, date: true } } },
    }),
    getCreditLettersForPeriod(user.id, toPeriod(year, month), day),
  ]);

  // Situação no fim do dia: recebido só se a data já passou; pago só se pago até o dia.
  const incomesAtDay = incomes.map((i) => ({ ...i, received: i.received && i.date <= until }));
  const expensesAtDay = expenses.map((e) => ({ ...e, status: paidAsOf(e, until) ? ("PAID" as const) : ("PENDING" as const) }));
  // Variáveis com data depois do dia ainda não foram gastos: entram como previstos.
  const variableScheduled = expensesAtDay.filter((e) => e.type === "VARIABLE" && e.dueDate > until);
  const expensesForSummary = expensesAtDay.filter((e) => !(e.type === "VARIABLE" && e.dueDate > until));

  // Total de custos variáveis por mês nos 3 meses anteriores
  const byMonth = new Map<string, number>();
  for (const e of variableHistory) {
    const k = `${e.dueDate.getFullYear()}-${e.dueDate.getMonth()}`;
    byMonth.set(k, (byMonth.get(k) ?? 0) + e.amountCents);
  }


  const summary = summarizeMonth({
    phase: monthPhase(year, month),
    incomes: incomesAtDay,
    expenses: expensesForSummary,
    variableScheduledCents: variableScheduled.reduce((a, e) => a + e.amountCents, 0),
    variableBudgetCents: user.variableBudgetCents,
    variableHistoryCents: [...byMonth.values()],
    investmentContributionCents: investments.reduce((a, i) => a + i.monthlyContributionCents, 0),
    // Parcela reajustada vigente no mês consultado
    creditLetterInstallmentCents: creditLetters.reduce((a, c) => a + c.dueThisPeriodCents, 0),
  });

  const byAsset = assetTypeOrder.map((type) => ({
    type,
    cents: investments.filter((i) => i.assetType === type).reduce((a, i) => a + balanceAt(i.transactions, until), 0),
  }));
  const investedTotal = byAsset.reduce((a, b) => a + b.cents, 0);
  // Consórcios com os valores do mês (sem retrato até o mês = não aparecem)
  const lettersInPeriod = creditLetters.flatMap(({ snapshot, ...c }) =>
    snapshot
      ? [
          {
            id: c.id,
            name: c.name,
            contemplated: c.contemplated,
            creditValueCents: c.creditValueCents,
            totalInstallments: c.totalInstallments,
            correctedCreditCents: snapshot.correctedCreditCents,
            paidCents: snapshot.paidCents,
            outstandingCents: snapshot.outstandingCents,
            installmentCents: snapshot.installmentCents,
            paidInstallments: snapshot.paidInstallments,
          },
        ]
      : [],
  );
  const lettersPaid = lettersInPeriod.reduce((a, c) => a + c.paidCents, 0);

  return {
    user,
    summary,
    fixedExpenses: expensesAtDay.filter((e) => e.type === "FIXED"),
    variableExpenses: expensesAtDay.filter((e) => e.type === "VARIABLE"),
    incomes: incomesAtDay,
    wealth: {
      investedTotal,
      byAsset,
      lettersPaid,
      total: investedTotal + lettersPaid,
      creditLetters: lettersInPeriod,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
