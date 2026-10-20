import { CalendarClock, CircleAlert, CircleCheck, Crown, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import type { RuleBucket } from "@/lib/analytics";
import type { DashboardAnalytics } from "@/lib/dashboard-analytics";
import { formatBRL, formatPct } from "@/lib/finance";

const ruleCopy: Record<RuleBucket["key"], { title: string; hint: string }> = {
  needs: { title: "Essenciais", hint: "moradia, contas, mercado… (ideal até 50%)" },
  wants: { title: "Estilo de vida", hint: "gastos não essenciais (ideal até 30%)" },
  savings: { title: "Investimentos & consórcio", hint: "aportes líquidos + parcela (meta de 20%+)" },
};

function statusOf(b: RuleBucket) {
  if (b.status === "none") return { tone: "text-fg-3", bar: "bg-fg-3", Icon: CircleAlert, text: "Sem renda no mês" };
  if (b.status === "ok") return { tone: "text-good", bar: "bg-good", Icon: CircleCheck, text: b.kind === "max" ? "Dentro do ideal" : "Meta atingida" };
  if (b.status === "over") return { tone: "text-critical", bar: "bg-critical", Icon: TriangleAlert, text: `Acima de ${formatPct(b.target)}` };
  return { tone: "text-warning", bar: "bg-warning", Icon: TriangleAlert, text: `Abaixo de ${formatPct(b.target)}` };
}

/** Comprometimento da renda: três barras com o marcador do ideal (status com ícone + texto). */
export function RulePanel({ rule, plannedSavingsCents }: { rule: RuleBucket[]; plannedSavingsCents: number }) {
  return (
    <ul className="grid gap-5">
      {rule.map((b) => {
        const s = statusOf(b);
        const pct = Math.min((b.share ?? 0) * 100, 100);
        return (
          <li key={b.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{ruleCopy[b.key].title}</span>
                <span className="block truncate text-xs text-fg-3">{ruleCopy[b.key].hint}</span>
              </span>
              <span className="num shrink-0 text-right">
                <span className="block text-sm font-semibold">{b.share != null ? formatPct(b.share) : "—"}</span>
                <span className="block text-xs text-fg-3">{formatBRL(b.cents)}</span>
              </span>
            </div>
            <div
              role="meter"
              aria-label={`${ruleCopy[b.key].title}: ${b.share != null ? formatPct(b.share) : "sem renda"} da renda; ${b.kind === "max" ? "ideal até" : "meta de"} ${formatPct(b.target)}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              className="relative h-2.5 rounded-full bg-surface-2"
            >
              <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${pct}%` }} />
              {/* Marcador do ideal */}
              <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-fg" style={{ left: `calc(${b.target * 100}% - 1px)` }} aria-hidden />
            </div>
            <p className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${s.tone}`}>
              <s.Icon className="size-3.5" aria-hidden />
              {s.text}
              {b.key === "savings" && plannedSavingsCents > 0 && (
                <span className="font-normal text-fg-3"> · planejado {formatBRL(plannedSavingsCents)}/mês</span>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Destaques do mês: maior categoria, variações e orçamento diário. */
export function InsightsPanel({ insights, periodLabel }: { insights: DashboardAnalytics["insights"]; periodLabel: string }) {
  const { top, up, down, previousLabel, costsChange, daysLeft, dailyCents, availableCents, availableBasis } = insights;
  const rows: { Icon: typeof Crown; tone: string; title: string; body: React.ReactNode }[] = [];

  rows.push({
    Icon: Crown,
    tone: "bg-surface-2 text-fg-2",
    title: "Maior categoria de gasto",
    body: top ? (
      <>
        <strong className="font-semibold">{top.category}</strong> · <span className="num">{formatBRL(top.cents)}</span>{" "}
        <span className="text-fg-3">({formatPct(top.share)} dos gastos de {periodLabel})</span>
      </>
    ) : (
      <span className="text-fg-3">Nenhum gasto lançado em {periodLabel}.</span>
    ),
  });

  if (previousLabel) {
    rows.push({
      Icon: up ? TrendingUp : TrendingDown,
      tone: up ? "bg-critical-soft text-critical" : "bg-good-soft text-good",
      title: `Em relação a ${previousLabel}`,
      body: (
        <span className="grid gap-0.5">
          {up && (
            <span>
              <strong className="font-semibold">{up.category}</strong>{" "}
              {up.pct != null ? (
                <>
                  subiu <span className="num">{formatPct(up.pct)}</span>
                </>
              ) : (
                "apareceu"
              )}{" "}
              <span className="num text-fg-3">(+{formatBRL(up.delta)})</span>
            </span>
          )}
          {down && (
            <span>
              <strong className="font-semibold">{down.category}</strong> caiu{" "}
              {down.pct != null && <span className="num">{formatPct(Math.abs(down.pct))}</span>}{" "}
              <span className="num text-fg-3">(−{formatBRL(Math.abs(down.delta))})</span>
            </span>
          )}
          {!up && !down && <span className="text-fg-3">Sem mudanças relevantes por categoria.</span>}
          {costsChange != null && (
            <span className="text-xs text-fg-3">
              Custos totais {costsChange >= 0 ? "subiram" : "caíram"} <span className="num">{formatPct(Math.abs(costsChange))}</span>
            </span>
          )}
        </span>
      ),
    });
  }

  rows.push({
    Icon: CalendarClock,
    tone: "bg-surface-2 text-accent",
    title: daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} até o fim do mês` : "Mês encerrado",
    body:
      daysLeft > 0 ? (
        <>
          Dá para gastar <strong className="num font-semibold">{formatBRL(dailyCents)}/dia</strong>{" "}
          <span className="text-fg-3">
            ({formatBRL(availableCents)} {availableBasis === "variable" ? "livres no orçamento de variáveis" : "de sobra prevista"})
          </span>
        </>
      ) : (
        <span className="text-fg-3">Escolha o mês atual ou um futuro para ver o orçamento diário.</span>
      ),
  });

  return (
    <ul className="grid gap-4">
      {rows.map((r) => (
        <li key={r.title} className="flex gap-3">
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${r.tone}`} aria-hidden>
            <r.Icon className="size-4" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="text-xs font-medium text-fg-3">{r.title}</p>
            <p className="mt-0.5">{r.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
