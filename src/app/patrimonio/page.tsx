import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dashboard";
import { endOfDay, formatBRL, parseDayKey, shortDate, toDayKey } from "@/lib/finance";
import { fromPeriod, periodLabel, toPeriod } from "@/lib/credit-letters";
import { getCreditLettersForPeriod } from "@/lib/credit-letter-data";
import { balanceAt, withRunningBalance, yieldBetween } from "@/lib/investments";
import { assetTypeColor, assetTypeLabels, assetTypeOrder } from "@/lib/labels";
import { Card, StackedBar, Stat } from "@/components/ui";
import { PageSkeleton } from "@/components/page-skeleton";
import { DayFilter } from "@/components/day-filter";
import { InvestmentManager } from "./investment-manager";
import { CreditLetterManager } from "./credit-letter-manager";

export const metadata: Metadata = { title: "Patrimônio · Fincontrol" };

export default function PatrimonioPage({ searchParams }: PageProps<"/patrimonio">) {
  return (
    <Suspense fallback={<PageSkeleton label="Carregando patrimônio" />}>
      <Patrimonio searchParams={searchParams} />
    </Suspense>
  );
}

async function Patrimonio({ searchParams }: Pick<PageProps<"/patrimonio">, "searchParams">) {
  await connection();
  const { data } = await searchParams;
  const today = new Date();
  // Tudo é calculado "até o fim do dia selecionado", inclusive.
  const day = parseDayKey(typeof data === "string" ? data : undefined, today);
  const until = endOfDay(day);
  const dayKey = toDayKey(day);
  const period = toPeriod(day.getFullYear(), day.getMonth());
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);

  const user = await getCurrentUser();
  const [investments, letters] = await Promise.all([
    db.investment.findMany({
      where: { userId: user.id },
      include: { transactions: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } },
    }),
    getCreditLettersForPeriod(user.id, period, day),
  ]);

  const items = investments
    .map((i) => ({
      ...i,
      balanceAtDate: balanceAt(i.transactions, until),
      monthYield: yieldBetween(i.transactions, monthStart, until),
    }))
    .sort((a, b) => b.balanceAtDate - a.balanceAtDate);

  const invested = items.reduce((a, i) => a + i.balanceAtDate, 0);
  const monthYield = items.reduce((a, i) => a + i.monthYield, 0);
  const lettersPaid = letters.reduce((a, c) => a + (c.snapshot?.paidCents ?? 0), 0);
  const installments = letters.reduce((a, c) => a + c.dueThisPeriodCents, 0);
  const monthly = investments.reduce((a, i) => a + i.monthlyContributionCents, 0) + installments;

  const firstYear = Math.min(
    today.getFullYear() - 3,
    ...letters.map((c) => (c.firstPeriod ? fromPeriod(c.firstPeriod).year : today.getFullYear())),
    ...investments.flatMap((i) => i.transactions.slice(0, 1).map((t) => t.date.getFullYear())),
  );
  const onDay = `em ${shortDate(day)}`;

  return (
    <div className="space-y-6">
      <DayFilter
        eyebrow="Patrimônio & investimentos"
        dayKey={dayKey}
        todayKey={toDayKey(today)}
        fromYear={firstYear}
        toYear={today.getFullYear() + 3}
      />

      <div className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4">
        <Stat label="Patrimônio" value={formatBRL(invested + lettersPaid)} sub={`investido + consórcios ${onDay}`} className="col-span-2 xl:col-span-1" />
        <Stat
          label="Investido"
          value={formatBRL(invested)}
          sub={
            monthYield
              ? `${monthYield > 0 ? "+" : "−"} ${formatBRL(Math.abs(monthYield))} de rendimento em ${periodLabel(period)}`
              : `saldo ${onDay}`
          }
        />
        <Stat label="Pago em consórcios" value={formatBRL(lettersPaid)} sub={`acumulado ${onDay}`} />
        <Stat label="Compromisso mensal" value={formatBRL(monthly)} sub={`aportes + parcelas de ${periodLabel(period)}`} className="col-span-2 xl:col-span-1" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          {invested > 0 && (
            <div className="mb-6">
              <StackedBar
                label="Alocação por tipo de ativo"
                segments={assetTypeOrder.map((t) => {
                  const cents = items.filter((i) => i.assetType === t).reduce((a, i) => a + i.balanceAtDate, 0);
                  return { label: assetTypeLabels[t], value: cents, colorVar: assetTypeColor(t), display: formatBRL(cents) };
                })}
              />
            </div>
          )}
          <InvestmentManager
            dayKey={dayKey}
            dayLabel={shortDate(day)}
            monthLabel={periodLabel(period)}
            items={items.map((i) => ({
              id: i.id,
              name: i.name,
              assetType: i.assetType,
              institution: i.institution,
              balanceCents: i.balanceAtDate,
              totalBalanceCents: i.balanceCents,
              monthlyContributionCents: i.monthlyContributionCents,
              monthYieldCents: i.monthYield,
              history: withRunningBalance(i.transactions)
                .reverse()
                .map((t) => ({
                  id: t.id,
                  type: t.type,
                  amountCents: t.amountCents,
                  dateLabel: shortDate(t.date),
                  note: t.note,
                  balanceAfterCents: t.balanceAfter,
                  afterSelectedDay: t.date > until,
                })),
            }))}
          />
        </Card>

        <Card>
          <CreditLetterManager
            dayKey={dayKey}
            periodKey={`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`}
            periodLabel={periodLabel(period)}
            items={letters.map((c) => ({
              id: c.id,
              name: c.name,
              administrator: c.administrator,
              creditValueCents: c.creditValueCents,
              totalInstallments: c.totalInstallments,
              dueDay: c.dueDay,
              contemplated: c.contemplated,
              snapshot: c.snapshot
                ? {
                    periodLabel: periodLabel(c.snapshot.period),
                    exact: c.exactPeriod,
                    correctedCreditCents: c.snapshot.correctedCreditCents,
                    paidCents: c.snapshot.paidCents,
                    outstandingCents: c.snapshot.outstandingCents,
                    installmentCents: c.snapshot.installmentCents,
                    paidInstallments: c.snapshot.paidInstallments,
                    installmentPaid: c.installmentPaidThisPeriod,
                    installmentPaidLaterLabel: c.installmentPaidLaterAt ? shortDate(c.installmentPaidLaterAt) : null,
                  }
                : null,
              firstPeriodLabel: c.firstPeriod ? periodLabel(c.firstPeriod) : null,
            }))}
          />
        </Card>
      </div>
    </div>
  );
}
