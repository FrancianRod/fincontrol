"use client";

import { useEffect, useRef, useState } from "react";
import type { HistoryMonth } from "@/lib/dashboard-analytics";
import { formatBRL, formatBRLCompact } from "@/lib/finance";

// Cores validadas (verde/vermelho/azul) — aportes ficam em tinta neutra tracejada.
const C = {
  income: "var(--series-6)",
  costs: "var(--series-8)",
  surplus: "var(--series-1)",
  invested: "var(--fg-2)",
};

const HEIGHT = 240;
const PAD = { top: 16, right: 56, bottom: 28, left: 52 };
const BAR_MAX = 18;
const BAR_GAP = 2;

/** Arredonda o passo do eixo para números "limpos" (1, 2, 5 × 10^n). */
function niceStep(range: number, ticks = 4) {
  const raw = range / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Barra com topo arredondado (4px) e base reta, crescendo a partir do zero. */
function barPath(x: number, w: number, y0: number, y1: number) {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${top + h} Z`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function HistoryChart({ history }: { history: HistoryMonth[] }) {
  const [range, setRange] = useState<6 | 12>(6);
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const data = history.slice(-range);

  const values = data.flatMap((m) => [m.incomeCents, m.costsCents, m.surplusCents, m.investedCents]);
  const step = niceStep(Math.max(...values, 0) - Math.min(...values, 0) || 100000);
  const yMax = Math.ceil(Math.max(...values, 0) / step) * step || step;
  const yMin = Math.floor(Math.min(...values, 0) / step) * step;

  const innerW = Math.max(width - PAD.left - PAD.right, 0);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.min(BAR_MAX, Math.max((band - 16) / 2 - BAR_GAP / 2, 3));
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * innerH;
  const cx = (i: number) => PAD.left + band * i + band / 2;
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + 1; t += step) ticks.push(t);

  const line = (key: "surplusCents" | "investedCents") => data.map((m, i) => `${i ? "L" : "M"}${cx(i)},${y(m[key])}`).join(" ");
  const hovered = hover != null ? data[hover] : null;
  const last = data[data.length - 1];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2" aria-label="Legenda">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: C.income }} aria-hidden /> Entradas
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: C.costs }} aria-hidden /> Custos (fixos + variáveis + consórcio)
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: C.surplus }} aria-hidden /> Sobra real
          </li>
          <li className="flex items-center gap-1.5">
            <svg width="16" height="4" aria-hidden>
              <line x1="0" y1="2" x2="16" y2="2" stroke={C.invested} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Aportes líquidos
          </li>
        </ul>
        <div role="group" aria-label="Período" className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {([6, 12] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={range === n}
              onClick={() => setRange(n)}
              className={`rounded-lg px-3 py-1 text-xs ${range === n ? "bg-surface-2 font-medium" : "text-fg-2 hover:bg-surface-2"}`}
            >
              {n} meses
            </button>
          ))}
        </div>
      </div>

      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`Entradas, custos e sobra dos últimos ${range} meses`} className="block overflow-visible">
            {/* Grade e eixo Y */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1.5 : 1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-[var(--fg-3)] text-[11px]">
                  {formatBRLCompact(t)}
                </text>
              </g>
            ))}

            {/* Faixa do mês em foco */}
            {hover != null && <rect x={PAD.left + band * hover} y={PAD.top} width={band} height={innerH} fill="var(--surface-2)" />}

            {/* Barras agrupadas: entradas | custos */}
            {data.map((m, i) => {
              const x0 = cx(i) - barW - BAR_GAP / 2;
              return (
                <g key={m.period}>
                  <path d={barPath(x0, barW, y(0), y(m.incomeCents))} fill={C.income} />
                  <path d={barPath(x0 + barW + BAR_GAP, barW, y(0), y(m.costsCents))} fill={C.costs} />
                  <text x={cx(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-[var(--fg-3)] text-[11px]">
                    {m.label}
                  </text>
                </g>
              );
            })}

            {/* Linhas: aportes (tracejada, neutra) e sobra real */}
            <path d={line("investedCents")} fill="none" stroke={C.invested} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
            <path d={line("surplusCents")} fill="none" stroke={C.surplus} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((m, i) => (
              <g key={`pt-${m.period}`}>
                <circle cx={cx(i)} cy={y(m.investedCents)} r={3.5} fill="var(--surface)" stroke={C.invested} strokeWidth={2} />
                <circle cx={cx(i)} cy={y(m.surplusCents)} r={hover === i ? 5.5 : 4} fill={C.surplus} stroke="var(--surface)" strokeWidth={2} />
              </g>
            ))}
            {/* Rótulo direto só no ponto final da sobra */}
            {last && (
              <text x={cx(data.length - 1) + 10} y={y(last.surplusCents)} dy="0.32em" className="num fill-[var(--fg)] text-[11px] font-medium">
                {formatBRLCompact(last.surplusCents)}
              </text>
            )}

            {/* Áreas de hover/foco: a faixa inteira do mês */}
            {data.map((m, i) => (
              <rect
                key={`hit-${m.period}`}
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${m.label}: entradas ${formatBRL(m.incomeCents)}, custos ${formatBRL(m.costsCents)}, sobra ${formatBRL(m.surplusCents)}, aportes ${formatBRL(m.investedCents)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              />
            ))}
          </svg>
        )}

        {hovered && hover != null && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-xl border border-border bg-surface p-3 text-xs shadow-lg"
            style={{
              top: PAD.top,
              left: Math.min(Math.max(cx(hover) + 12, 0), Math.max(width - 208, 0)),
              ...(cx(hover) + 220 > width ? { left: Math.max(cx(hover) - 220, 0) } : {}),
            }}
          >
            <p className="mb-2 font-medium text-fg-2">{hovered.label}</p>
            {(
              [
                ["Entradas", hovered.incomeCents, C.income, false],
                ["Custos", hovered.costsCents, C.costs, false],
                ["Sobra real", hovered.surplusCents, C.surplus, false],
                ["Aportes líquidos", hovered.investedCents, C.invested, true],
              ] as const
            ).map(([label, v, color, dashed]) => (
              <p key={label} className="flex items-center gap-2 py-0.5">
                <svg width="12" height="4" aria-hidden>
                  <line x1="0" y1="2" x2="12" y2="2" stroke={color} strokeWidth="3" strokeDasharray={dashed ? "3 2" : undefined} />
                </svg>
                <span className={`num font-semibold ${v < 0 ? "text-critical" : "text-fg"}`}>{formatBRL(v)}</span>
                <span className="ml-auto text-fg-3">{label}</span>
              </p>
            ))}
            <p className="mt-1 border-t border-border pt-1 text-fg-3">
              Fixos {formatBRLCompact(hovered.fixedCents)} · Var. {formatBRLCompact(hovered.variableCents)} · Cons. {formatBRLCompact(hovered.creditLetterCents)}
            </p>
          </div>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-fg-2 hover:text-fg">Ver tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="num w-full min-w-[520px] text-right text-xs">
            <thead className="text-fg-3">
              <tr>
                <th className="py-1 text-left font-medium">Mês</th>
                <th className="py-1 font-medium">Entradas</th>
                <th className="py-1 font-medium">Fixos</th>
                <th className="py-1 font-medium">Variáveis</th>
                <th className="py-1 font-medium">Consórcio</th>
                <th className="py-1 font-medium">Sobra</th>
                <th className="py-1 font-medium">Aportes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((m) => (
                <tr key={m.period}>
                  <td className="py-1.5 text-left text-fg-2">{m.label}</td>
                  <td>{formatBRL(m.incomeCents)}</td>
                  <td>{formatBRL(m.fixedCents)}</td>
                  <td>{formatBRL(m.variableCents)}</td>
                  <td>{formatBRL(m.creditLetterCents)}</td>
                  <td className={m.surplusCents < 0 ? "text-critical" : ""}>{formatBRL(m.surplusCents)}</td>
                  <td>{formatBRL(m.investedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
