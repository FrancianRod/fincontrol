import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dashboard";
import { endOfDay, formatBRL, monthRange, parseDayKey, shortDate, toDayKey } from "@/lib/finance";
import { toDateInput } from "@/lib/form-state";
import { periodLabel, toPeriod } from "@/lib/credit-letters";
import { Card, Stat } from "@/components/ui";
import { DayFilter } from "@/components/day-filter";
import { PageSkeleton } from "@/components/page-skeleton";
import { IncomeManager } from "./income-manager";

export const metadata: Metadata = { title: "Renda · Fincontrol" };

export default function RendaPage({ searchParams }: PageProps<"/renda">) {
  return (
    <Suspense fallback={<PageSkeleton label="Carregando renda" />}>
      <Renda searchParams={searchParams} />
    </Suspense>
  );
}

async function Renda({ searchParams }: Pick<PageProps<"/renda">, "searchParams">) {
  await connection();
  const { data } = await searchParams;
  const today = new Date();
  // Mês do dia selecionado; "recebido" conta só o que caiu até o fim desse dia.
  const day = parseDayKey(typeof data === "string" ? data : undefined, today);
  const until = endOfDay(day);
  const { start, end } = monthRange(day.getFullYear(), day.getMonth());

  const user = await getCurrentUser();
  const incomes = await db.income.findMany({
    where: { userId: user.id, date: { gte: start, lt: end } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const rows = incomes.map((i) => ({ ...i, receivedNow: i.received && i.date <= until }));
  const total = rows.reduce((a, i) => a + i.amountCents, 0);
  const received = rows.filter((i) => i.receivedNow).reduce((a, i) => a + i.amountCents, 0);
  const expected = total - received;
  const onDay = `até ${shortDate(day)}`;

  return (
    <div className="space-y-6">
      <DayFilter
        eyebrow="Renda & salários"
        dayKey={toDayKey(day)}
        todayKey={toDayKey(today)}
        fromYear={today.getFullYear() - 3}
        toYear={today.getFullYear() + 3}
      />

      <div className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-3">
        <Stat
          label={`Total de ${periodLabel(toPeriod(day.getFullYear(), day.getMonth()))}`}
          value={formatBRL(total)}
          sub={`${rows.length} ${rows.length === 1 ? "entrada" : "entradas"}`}
          className="col-span-2 xl:col-span-1"
        />
        <Stat label={`Recebido ${onDay}`} value={formatBRL(received)} tone="good" sub={total ? `${Math.round((received / total) * 100)}% do mês` : undefined} />
        <Stat label="Previsto" value={formatBRL(expected)} sub={`a receber depois de ${shortDate(day)} ou sem confirmação`} />
      </div>

      <Card>
        <IncomeManager
          key={toDayKey(day)}
          defaultDate={toDayKey(day)}
          dayLabel={shortDate(day)}
          items={rows.map((i) => ({
            id: i.id,
            description: i.description,
            amountCents: i.amountCents,
            type: i.type,
            date: toDateInput(i.date),
            received: i.received,
            afterDay: i.date > until,
          }))}
        />
      </Card>
    </div>
  );
}
