import { Suspense } from "react";
import { connection } from "next/server";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard";
import {
  formatBRL,
  formatPct,
  monthPhase,
  parseDayKey,
  parseMonthKey,
  shortDate,
  toDayKey,
  withMonth,
} from "@/lib/finance";
import { DayFilter } from "@/components/day-filter";
import { assetTypeColor, assetTypeLabels } from "@/lib/labels";
import { Card, CardTitle, Meter, StackedBar, StatusBadge } from "@/components/ui";
import { FixedCostList } from "@/components/fixed-cost-list";
import { VariableBudgetControl } from "@/components/variable-budget";
import { getDashboardAnalytics } from "@/lib/dashboard-analytics";
import { CategoryDonut } from "@/components/charts/category-donut";
import { HistoryChart } from "@/components/charts/history-chart";
import { InsightsPanel, RulePanel } from "@/components/dashboard-panels";


export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

function DashboardSkeleton() {
  const block = "animate-pulse rounded-2xl border border-border bg-surface";
  return (
    <div className="space-y-6" aria-busy aria-label="Carregando dashboard">
      <div className="h-14 w-56 animate-pulse rounded-xl bg-surface-2" />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className={`${block} h-96 xl:col-span-3`} />
        <div className={`${block} h-96 xl:col-span-2`} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-28`} />
        ))}
      </div>
    </div>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection(); // depende da data atual -> sempre renderiza na requisição
  const { data, mes } = await searchParams;
  const today = new Date();
  // ?data=AAAA-MM-DD (padrão); ?mes=AAAA-MM antigo ainda funciona (mesmo dia de hoje naquele mês).
  const day =
    typeof data === "string"
      ? parseDayKey(data, today)
      : typeof mes === "string"
        ? (({ year, month }) => withMonth(today, year, month))(parseMonthKey(mes))
        : parseDayKey(undefined, today);
  const phase = monthPhase(day.getFullYear(), day.getMonth());
  const dayLabel = shortDate(day);
  const { user, summary: s, fixedExpenses, wealth } = await getDashboardData(day);
  const analytics = await getDashboardAnalytics(user.id, day, s);

  const surplusTone = s.projectedSurplus < 0 ? "critical" : s.projectedSurplus < s.income.total * 0.05 ? "warning" : "good";
  const surplusLabel = { good: "No azul", warning: "Margem apertada", critical: "No vermelho" }[surplusTone];

  const variableRefLabel =
    s.variable.referenceSource === "budget" ? "limite" : s.variable.referenceSource === "average" ? "média 3 meses" : "sem referência";

  const breakdown: { label: string; hint?: string; cents: number; sign: "+" | "−" }[] = [
    {
      label: "Entradas",
      hint: s.income.expected ? `${formatBRL(s.income.expected)} ainda previsto em ${dayLabel}` : undefined,
      cents: s.income.total,
      sign: "+",
    },
    { label: "Custos fixos pagos", hint: `até ${dayLabel}`, cents: s.fixed.paid, sign: "−" },
    { label: "Custos fixos a pagar", cents: s.fixed.pending, sign: "−" },
    { label: "Variáveis já gastos", hint: `até ${dayLabel}`, cents: s.variable.spent, sign: "−" },
    ...(phase !== "past" || s.variable.scheduled
      ? [
          {
            label: phase === "past" ? "Variáveis lançados depois" : "Variáveis restantes",
            hint:
              phase === "past"
                ? `após ${dayLabel}`
                : [
                    `até o ${variableRefLabel} de ${formatBRL(s.variable.reference)}`,
                    s.variable.scheduled ? `inclui ${formatBRL(s.variable.scheduled)} já lançados após ${dayLabel}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · "),
            cents: s.variable.remaining,
            sign: "−" as const,
          },
        ]
      : []),
    { label: "Aportes em investimentos", cents: s.commitments.investments, sign: "−" },
    { label: "Parcelas de consórcio", cents: s.commitments.creditLetters, sign: "−" },
  ];

  const variableOver = s.variable.reference > 0 && s.variable.spent > s.variable.reference;

  return (
    <div className="space-y-6">
      <DayFilter
        eyebrow="Visão geral"
        dayKey={toDayKey(day)}
        todayKey={toDayKey(today)}
        fromYear={today.getFullYear() - 3}
        toYear={today.getFullYear() + 3}
      />

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Projeção de sobra — o core do app */}
        <Card className="xl:col-span-3">
          <CardTitle aside={<StatusBadge tone={surplusTone}>{surplusLabel}</StatusBadge>}>
            {phase === "past" ? "Sobra no fim do mês" : "Sobra prevista no fim do mês"}
          </CardTitle>
          <p className={`num text-4xl font-semibold tracking-tight md:text-5xl ${s.projectedSurplus < 0 ? "text-critical" : ""}`}>
            {formatBRL(s.projectedSurplus)}
          </p>
          <p className="mt-2 text-sm text-fg-2">
            {s.income.total > 0 ? (
              <>
                <span className="num font-medium text-fg">{formatPct(Math.max(s.projectedSurplus, 0) / s.income.total)}</span> da renda do mês
                {" · "}saldo em conta em {dayLabel} <span className="num font-medium text-fg">{formatBRL(s.currentBalance)}</span>
              </>
            ) : (
              "Nenhuma entrada registrada neste mês."
            )}
          </p>

          <dl className="mt-6 divide-y divide-border border-t border-border text-sm">
            {breakdown.map((row) => (
              <div key={row.label} className="flex items-baseline gap-3 py-2.5">
                <dt className="min-w-0 flex-1">
                  <span className="text-fg-2">{row.label}</span>
                  {row.hint && <span className="block text-xs text-fg-3 sm:ml-2 sm:inline">{row.hint}</span>}
                </dt>
                <dd className={`num font-medium ${row.sign === "+" ? "text-good" : ""}`}>
                  {row.sign} {formatBRL(row.cents)}
                </dd>
              </div>
            ))}
            <div className="flex items-baseline gap-3 pt-3">
              <dt className="flex-1 font-medium">= Sobra {phase === "past" ? "final" : "prevista"}</dt>
              <dd className={`num font-semibold ${s.projectedSurplus < 0 ? "text-critical" : ""}`}>{formatBRL(s.projectedSurplus)}</dd>
            </div>
          </dl>
        </Card>

        {/* Custo de vida real */}
        <Card className="xl:col-span-2">
          <CardTitle>Custo de vida real</CardTitle>
          <p className="num text-3xl font-semibold tracking-tight">{formatBRL(s.costOfLiving.total)}</p>
          <p className="mt-1 text-sm text-fg-2">
            {s.costOfLiving.shareOfIncome != null ? (
              <>
                consome <span className="num font-medium text-fg">{formatPct(s.costOfLiving.shareOfIncome)}</span> da renda
              </>
            ) : (
              "fixos + variáveis essenciais"
            )}
          </p>
          {s.costOfLiving.shareOfIncome != null && (
            <div className="mt-4">
              <Meter
                label="Custo de vida em relação à renda"
                value={s.costOfLiving.total}
                max={s.income.total}
                tone={s.costOfLiving.shareOfIncome > 0.7 ? "critical" : s.costOfLiving.shareOfIncome > 0.5 ? "warning" : "good"}
              />
            </div>
          )}

          <div className="mt-6">
            <StackedBar
              label="Composição do custo de vida"
              segments={[
                { label: "Custos fixos", value: s.costOfLiving.fixed, colorVar: "var(--series-1)", display: formatBRL(s.costOfLiving.fixed) },
                {
                  label: "Variáveis essenciais",
                  value: s.costOfLiving.variableEssential,
                  colorVar: "var(--series-2)",
                  display: formatBRL(s.costOfLiving.variableEssential),
                },
              ]}
            />
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-fg-2">Variáveis até {dayLabel}</span>
              <span className="num">
                <span className="font-medium">{formatBRL(s.variable.spent)}</span>
                {s.variable.reference > 0 && <span className="text-fg-3"> / {formatBRL(s.variable.reference)}</span>}
              </span>
            </div>
            <Meter label="Gasto variável em relação à referência" value={s.variable.spent} max={s.variable.reference} tone={variableOver ? "critical" : "accent"} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-fg-3">
                {variableOver ? "Acima do " : "Referência: "}
                {variableRefLabel}
              </p>
              <VariableBudgetControl budgetCents={user.variableBudgetCents} />
            </div>
          </div>
        </Card>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-3">
        <Kpi label="Entradas" value={formatBRL(s.income.total)} sub={`${formatBRL(s.income.received)} recebido até ${dayLabel}`} icon="up" />
        <Kpi label="Custos fixos" value={formatBRL(s.fixed.total)} sub={`${formatBRL(s.fixed.paid)} pago até ${dayLabel}`} icon="down" />
        <Kpi
          label="Custos variáveis"
          value={formatBRL(s.variable.spent)}
          sub={`gasto até ${dayLabel} · previsto ${formatBRL(s.variable.spent + s.variable.remaining)}`}
          icon="down"
        />
        <Kpi
          label="Aportes & parcelas"
          value={formatBRL(s.commitments.total)}
          sub={`${formatBRL(s.commitments.investments)} invest. · ${formatBRL(s.commitments.creditLetters)} consórcio`}
        />
        <Kpi label="Saldo em conta" value={formatBRL(s.currentBalance)} sub={`recebido − pago até ${dayLabel}`} negative={s.currentBalance < 0} />
        <Kpi label="Patrimônio" value={formatBRL(wealth.total)} sub={`invest. + consórcios em ${dayLabel}`} />
      </div>

      {/* Inteligência: destaques e comprometimento da renda */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Destaques de {analytics.periodLabel}</CardTitle>
          <InsightsPanel insights={analytics.insights} periodLabel={analytics.periodLabel} />
        </Card>
        <Card>
          <CardTitle aside={<span className="text-xs text-fg-3">% da renda do mês</span>}>Comprometimento da renda · 50/30/20</CardTitle>
          <RulePanel rule={analytics.rule} plannedSavingsCents={analytics.plannedSavingsCents} />
        </Card>
      </div>

      {/* Gráficos: categorias e histórico */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardTitle aside={<span className="text-xs text-fg-3">{analytics.periodLabel}</span>}>Gastos por categoria</CardTitle>
          <CategoryDonut rows={analytics.categories.rows} slots={analytics.categories.slots} periodLabel={analytics.periodLabel} />
        </Card>
        <Card className="xl:col-span-3">
          <CardTitle>Entradas × custos × sobra</CardTitle>
          <HistoryChart history={analytics.history} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Custos fixos recorrentes */}
        <Card>
          <CardTitle
            aside={
              <span className="num text-xs text-fg-3">
                {fixedExpenses.filter((e) => e.status === "PAID").length}/{fixedExpenses.length} pagos até {dayLabel}
              </span>
            }
          >
            Custos fixos do mês
          </CardTitle>
          <FixedCostList
            dayKey={toDayKey(day)}
            items={fixedExpenses.map((e) => ({
              id: e.id,
              description: e.description,
              category: e.category,
              amountCents: e.amountCents,
              status: e.status,
              dueDate: e.dueDate.toISOString(),
            }))}
          />
        </Card>

        {/* Patrimônio */}
        <Card>
          <CardTitle>Patrimônio & investimentos</CardTitle>
          <p className="num text-3xl font-semibold tracking-tight">{formatBRL(wealth.investedTotal)}</p>
          <p className="mt-1 mb-5 text-sm text-fg-2">investidos em {dayLabel} · aporte de {formatBRL(s.commitments.investments)}/mês</p>
          <StackedBar
            label="Alocação por tipo de ativo"
            segments={wealth.byAsset.map((a) => ({
              label: assetTypeLabels[a.type],
              value: a.cents,
              colorVar: assetTypeColor(a.type),
              display: formatBRL(a.cents),
            }))}
          />

          {wealth.creditLetters.length > 0 && (
            <div className="mt-6 space-y-4 border-t border-border pt-4">
              {wealth.creditLetters.map((c) => {
                const totalDue = c.paidCents + c.outstandingCents;
                return (
                  <div key={c.id}>
                    <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">
                        {c.name}
                        {c.contemplated && <span className="ml-2 text-xs font-normal text-good">contemplada</span>}
                      </span>
                      <span className="num shrink-0 text-fg-2">
                        {c.correctedCreditCents ? `crédito ${formatBRL(c.correctedCreditCents)}` : `carta ${formatBRL(c.creditValueCents)}`}
                      </span>
                    </div>
                    <Meter label={`Progresso de pagamento: ${c.name}`} value={c.paidCents} max={totalDue} />
                    <div className="num mt-2 grid grid-cols-3 gap-2 text-xs text-fg-3">
                      <span>
                        Pago<br />
                        <span className="text-sm font-medium text-fg">{formatBRL(c.paidCents)}</span>
                      </span>
                      <span>
                        Saldo devedor<br />
                        <span className="text-sm font-medium text-fg">{formatBRL(c.outstandingCents)}</span>
                      </span>
                      <span className="text-right">
                        Parcela{c.totalInstallments ? ` ${c.paidInstallments}/${c.totalInstallments}` : ""}
                        <br />
                        <span className="text-sm font-medium text-fg">{formatBRL(c.installmentCents)}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, negative }: { label: string; value: string; sub: string; icon?: "up" | "down"; negative?: boolean }) {
  const Icon = icon === "up" ? TrendingUp : icon === "down" ? TrendingDown : null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 md:p-5">
      <div className="flex items-center justify-between text-xs text-fg-3 md:text-sm">
        {label}
        {Icon && <Icon className="size-4" aria-hidden />}
      </div>
      <p className={`num mt-2 truncate text-lg font-semibold tracking-tight md:text-2xl ${negative ? "text-critical" : ""}`}>{value}</p>
      <p className="num mt-1 text-xs text-fg-3">{sub}</p>
    </div>
  );
}
