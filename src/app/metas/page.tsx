import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { CircleAlert, CircleCheck, Clock, Flag, PieChart, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dashboard";
import { endOfDay, formatBRL, formatPct, monthRange, parseDayKey, shortDate, toDayKey } from "@/lib/finance";
import { periodLabel, toPeriod } from "@/lib/credit-letters";
import { ensureSeriesRows } from "@/lib/expense-data";
import { balanceAt } from "@/lib/investments";
import {
  accumulateGoal,
  BASE_INCOME_CENTS,
  ceilingGoal,
  emergencyTargetCents,
  GOALS,
  independenceTargetCents,
  monthsToReach,
  splitTargets,
  type GoalProgress,
} from "@/lib/goals";
import { Card } from "@/components/ui";
import { DayFilter } from "@/components/day-filter";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata: Metadata = { title: "Metas · Fincontrol" };

export default function MetasPage({ searchParams }: PageProps<"/metas">) {
  return (
    <Suspense fallback={<PageSkeleton label="Carregando metas" />}>
      <Metas searchParams={searchParams} />
    </Suspense>
  );
}

async function Metas({ searchParams }: Pick<PageProps<"/metas">, "searchParams">) {
  await connection();
  const { data } = await searchParams;
  const today = new Date();
  const day = parseDayKey(typeof data === "string" ? data : undefined, today);
  const until = endOfDay(day);
  const period = toPeriod(day.getFullYear(), day.getMonth());
  const { start, end } = monthRange(day.getFullYear(), day.getMonth());

  const user = await getCurrentUser();
  await ensureSeriesRows(user.id, period);
  const [investments, expenses] = await Promise.all([
    db.investment.findMany({
      where: { userId: user.id },
      include: { transactions: { select: { type: true, amountCents: true, date: true, note: true } } },
    }),
    db.expense.findMany({
      where: { userId: user.id, dueDate: { gte: start, lt: end } },
      select: { amountCents: true, type: true, essential: true },
    }),
  ]);

  // ─── Patrimônio em investimentos (até o dia filtrado) ─────────────────────
  const holdings = investments.map((i) => ({ ...i, balance: balanceAt(i.transactions, until) }));
  const investedTotal = holdings.reduce((a, i) => a + i.balance, 0);
  const fixedIncome = holdings.filter((i) => i.assetType === "EMERGENCY_RESERVE" || i.assetType === "FIXED_INCOME");
  const fixedIncomeTotal = fixedIncome.reduce((a, i) => a + i.balance, 0);

  // ─── Distribuição do mês (tudo o que está lançado no mês) ─────────────────
  const essentialCents = expenses.filter((e) => e.essential).reduce((a, e) => a + e.amountCents, 0);
  const fixedPartCents = expenses.filter((e) => e.essential && e.type === "FIXED").reduce((a, e) => a + e.amountCents, 0);
  const lifestyleCents = expenses.filter((e) => !e.essential).reduce((a, e) => a + e.amountCents, 0);
  // Aportes líquidos do mês; "Saldo inicial" é saldo pré-existente, não aporte.
  const monthInvestedCents = investments
    .flatMap((i) => i.transactions)
    .filter((t) => t.date >= start && t.date < end && t.note !== "Saldo inicial" && t.type !== "RENDIMENTO")
    .reduce((a, t) => a + (t.type === "RESGATE" ? -t.amountCents : t.amountCents), 0);

  const targets = splitTargets();
  const independence = accumulateGoal(investedTotal, independenceTargetCents());
  const emergency = accumulateGoal(fixedIncomeTotal, emergencyTargetCents());
  const fixed = ceilingGoal(essentialCents, targets.fixedCeilingCents);
  const lifestyle = ceilingGoal(lifestyleCents, targets.lifestyleCeilingCents);
  const invest = accumulateGoal(Math.max(monthInvestedCents, 0), targets.investGoalCents);

  const monthsLeft = monthsToReach(independence.remainingCents, targets.investGoalCents);
  const onDay = shortDate(day);
  const monthLabel = periodLabel(period);

  return (
    <div className="space-y-6">
      <DayFilter eyebrow="Metas" dayKey={toDayKey(day)} todayKey={toDayKey(today)} fromYear={today.getFullYear() - 3} toYear={today.getFullYear() + 3} />

      <p className="text-sm text-fg-2">
        Todas as metas partem da renda-base de <strong className="num font-semibold text-fg">{formatBRL(BASE_INCOME_CENTS)}/mês</strong>.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card 1 — Independência financeira */}
        <GoalCard
          icon={<Flag className="size-4" aria-hidden />}
          title="Independência financeira"
          formula={`${formatBRL(BASE_INCOME_CENTS)} × ${GOALS.independenceMultiplier}`}
          goal={independence}
          currentLabel={`Patrimônio investido em ${onDay}`}
          footer={
            independence.status === "done" ? (
              "Meta atingida."
            ) : (
              <>
                Faltam <strong className="num font-semibold text-fg">{formatBRL(independence.remainingCents)}</strong>
                {monthsLeft != null && (
                  <>
                    {" "}
                    · no ritmo da meta de aporte ({formatBRL(targets.investGoalCents)}/mês), cerca de{" "}
                    <strong className="num font-semibold text-fg">{yearsLabel(monthsLeft)}</strong>, sem contar rendimentos
                  </>
                )}
              </>
            )
          }
        />

        {/* Card 2 — Reserva de emergência */}
        <GoalCard
          icon={<ShieldCheck className="size-4" aria-hidden />}
          title="Reserva de emergência"
          formula={`${formatBRL(BASE_INCOME_CENTS)} × ${GOALS.emergencyMonths} meses`}
          goal={emergency}
          currentLabel={`Renda fixa / caixinhas em ${onDay}`}
          footer={
            <>
              {fixedIncome.length ? (
                <ul className="mb-2 grid gap-1">
                  {fixedIncome.map((i) => (
                    <li key={i.id} className="flex min-w-0 justify-between gap-3">
                      <span className="min-w-0 truncate">{i.name}</span>
                      <span className="num shrink-0 font-medium text-fg">{formatBRL(i.balance)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-2">Nenhum investimento de renda fixa ou reserva cadastrado.</p>
              )}
              {emergency.status === "done" ? (
                "Meta atingida."
              ) : (
                <>
                  Faltam <strong className="num font-semibold text-fg">{formatBRL(emergency.remainingCents)}</strong> · cobre{" "}
                  <span className="num">{(fixedIncomeTotal / BASE_INCOME_CENTS).toFixed(1).replace(".", ",")}</span> de {GOALS.emergencyMonths} meses
                </>
              )}
            </>
          }
        />
      </div>

      {/* Card 3 — Distribuição 50/30/20 */}
      <Card>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-accent" aria-hidden>
              <PieChart className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-medium">Distribuição orçamentária 50 / 30 / 20</h2>
              <p className="text-xs text-fg-3">
                Base {formatBRL(BASE_INCOME_CENTS)} · lançamentos de {monthLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <SplitItem
            title="Custos fixos / essenciais"
            share="50%"
            kind="ceiling"
            goal={fixed}
            hint={`Contas fixas ${formatBRL(fixedPartCents)} + variáveis essenciais ${formatBRL(essentialCents - fixedPartCents)}`}
          />
          <SplitItem title="Lazer e estilo de vida" share="30%" kind="ceiling" goal={lifestyle} hint="Gastos marcados como não essenciais" />
          <SplitItem
            title="Aporte em investimentos"
            share="20%"
            kind="goal"
            goal={invest}
            hint="Aportes − resgates no mês (sem rendimentos)"
          />
        </div>
      </Card>
    </div>
  );
}

function yearsLabel(months: number) {
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} ${years === 1 ? "ano" : "anos"}${rest ? ` e ${rest} ${rest === 1 ? "mês" : "meses"}` : ""}`;
}

/** Status sempre com ícone + texto (nunca só cor). */
function StatusPill({ status, kind }: { status: GoalProgress["status"]; kind: "goal" | "ceiling" }) {
  const map = {
    done: { cls: "bg-good-soft text-good", Icon: CircleCheck, text: kind === "ceiling" ? "Dentro do teto" : "Atingido" },
    progress: { cls: "bg-surface-2 text-accent", Icon: Clock, text: "Em andamento" },
    over: { cls: "bg-critical-soft text-critical", Icon: CircleAlert, text: "Acima do teto" },
  }[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${map.cls}`}>
      <map.Icon className="size-3.5" aria-hidden />
      {map.text}
    </span>
  );
}

function ProgressBar({ goal, label, kind }: { goal: GoalProgress; label: string; kind: "goal" | "ceiling" }) {
  const pct = Math.min(goal.ratio, 1) * 100;
  const color = goal.status === "over" ? "bg-critical" : goal.status === "done" ? "bg-good" : kind === "ceiling" ? "bg-good" : "bg-accent";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(goal.ratio * 100)}
      aria-valuetext={`${formatPct(goal.ratio)} — ${formatBRL(goal.currentCents)} de ${formatBRL(goal.targetCents)}`}
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function GoalCard({
  icon,
  title,
  formula,
  goal,
  currentLabel,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  formula: string;
  goal: GoalProgress;
  currentLabel: string;
  footer: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="num text-xs text-fg-3">{formula}</p>
          </div>
        </div>
        <StatusPill status={goal.status} kind="goal" />
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="num text-3xl font-semibold tracking-tight">{formatPct(goal.ratio)}</p>
        <p className="num text-right text-sm">
          <span className="font-medium">{formatBRL(goal.currentCents)}</span>
          <span className="text-fg-3"> / {formatBRL(goal.targetCents)}</span>
        </p>
      </div>
      <ProgressBar goal={goal} label={title} kind="goal" />
      <p className="mt-1.5 text-xs text-fg-3">{currentLabel}</p>

      <div className="mt-4 border-t border-border pt-3 text-xs text-fg-2">{footer}</div>
    </Card>
  );
}

function SplitItem({ title, share, kind, goal, hint }: { title: string; share: string; kind: "goal" | "ceiling"; goal: GoalProgress; hint: string }) {
  return (
    <div>
      <p className="text-sm font-medium">
        {title} <span className="text-fg-3">({share})</span>
      </p>
      <p className="num text-xs text-fg-3">
        {kind === "ceiling" ? "Teto" : "Meta"} de {formatBRL(goal.targetCents)}/mês
      </p>
      <div className="mb-2 mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="num text-xl font-semibold tracking-tight">
          {formatBRL(goal.currentCents)} <span className="text-xs font-normal text-fg-3">{formatPct(goal.ratio)}</span>
        </span>
        <StatusPill status={goal.status} kind={kind} />
      </div>
      <ProgressBar goal={goal} label={`${title}: ${formatPct(goal.ratio)} ${kind === "ceiling" ? "do teto" : "da meta"}`} kind={kind} />
      <p className="mt-2 text-xs text-fg-3">
        {goal.status === "over"
          ? `${formatBRL(goal.currentCents - goal.targetCents)} acima do teto`
          : kind === "ceiling"
            ? `Sobram ${formatBRL(goal.remainingCents)} até o teto`
            : goal.status === "done"
              ? "Meta do mês atingida"
              : `Faltam ${formatBRL(goal.remainingCents)}`}
      </p>
      <p className="mt-1 text-xs text-fg-3">{hint}</p>
    </div>
  );
}

