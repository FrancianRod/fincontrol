"use client";

import { useMemo, useRef, useState } from "react";
import { categorySlices, type CategoryExpense, type CategoryView } from "@/lib/analytics";
import { formatBRL, formatPct } from "@/lib/finance";

const views: { key: CategoryView; label: string }[] = [
  { key: "ALL", label: "Todos" },
  { key: "FIXED", label: "Fixos" },
  { key: "VARIABLE", label: "Variáveis" },
];

const colorOf = (slot: number | null) => (slot == null ? "var(--series-other)" : `var(--series-${slot})`);

// Geometria do anel (coordenadas do viewBox)
const SIZE = 200;
const RADIUS = 78;
const THICKNESS = 26;
const CIRC = 2 * Math.PI * RADIUS;
const GAP = 2; // espaço de superfície entre fatias

/** Posição do tooltip em px relativa à caixa do gráfico; `w` = largura da caixa no momento do evento. */
type Tip = { category: string; x: number; y: number; w: number };

/**
 * Rosca de gastos por categoria. As cores vêm de `slots` (definidas pelo
 * ranking de todos os gastos), então alternar Todos/Fixos/Variáveis não
 * repinta as categorias. Valores e % aparecem só no tooltip (hover, toque ou
 * foco); o centro mostra o total ou o valor da categoria em foco.
 */
export function CategoryDonut({ rows, slots, periodLabel }: { rows: CategoryExpense[]; slots: Record<string, number>; periodLabel: string }) {
  const [view, setView] = useState<CategoryView>("ALL");
  const [hover, setHover] = useState<Tip | null>(null);
  // Fatia fixada por clique/toque (no celular não existe hover)
  const [pinned, setPinned] = useState<Tip | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // A fixação veio do teclado? (então sair com Tab solta; clique/toque não)
  const pinnedByKey = useRef(false);

  const slotMap = useMemo(() => new Map(Object.entries(slots)), [slots]);
  const slices = useMemo(() => categorySlices(rows, view, slotMap), [rows, view, slotMap]);
  const total = slices.reduce((a, s) => a + s.cents, 0);

  const tip = hover ?? pinned;
  const active = tip ? (slices.find((s) => s.category === tip.category) ?? null) : null;

  // Cada fatia começa onde a anterior termina (soma acumulada das frações).
  const arcs = slices.map((s, i) => {
    const start = slices.slice(0, i).reduce((a, x) => a + x.share, 0);
    return {
      ...s,
      dash: Math.max(s.share * CIRC - (slices.length > 1 ? GAP : 0), 0.5),
      offset: start * CIRC,
      mid: start + s.share / 2, // fração do círculo no meio da fatia
    };
  });

  /** Posição (px, relativa à caixa) do meio da fatia, para foco/toque. */
  function anchorOf(mid: number): { x: number; y: number; w: number } {
    const w = boxRef.current?.clientWidth ?? SIZE;
    const scale = w / SIZE;
    const angle = mid * 2 * Math.PI - Math.PI / 2; // começa no topo
    return { x: (SIZE / 2 + Math.cos(angle) * RADIUS) * scale, y: (SIZE / 2 + Math.sin(angle) * RADIUS) * scale, w };
  }

  function pointerTip(category: string, e: React.PointerEvent): Tip {
    const box = boxRef.current!.getBoundingClientRect();
    return { category, x: e.clientX - box.left, y: e.clientY - box.top, w: box.width };
  }

  return (
    <div>
      <div role="group" aria-label="Tipo de gasto" className="mb-5 flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => {
              setView(v.key);
              setHover(null);
              setPinned(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm ${view === v.key ? "bg-surface-2 font-medium" : "text-fg-2 hover:bg-surface-2"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-fg-3">Nenhum gasto {view === "FIXED" ? "fixo " : view === "VARIABLE" ? "variável " : ""}em {periodLabel}.</p>
      ) : (
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div
            ref={boxRef}
            className="relative mx-auto w-full max-w-[220px]"
            onKeyDown={(e) => e.key === "Escape" && setPinned(null)}
          >
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="block w-full"
              role="img"
              aria-label={`Gastos por categoria em ${periodLabel}, total ${formatBRL(total)}`}
              // Toque/clique fora das fatias desfaz a seleção fixada
              onClick={(e) => e.target === e.currentTarget && setPinned(null)}
            >
              <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
                {arcs.map((a) => {
                  const on = active?.category === a.category;
                  return (
                    <circle
                      key={a.category}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={colorOf(a.slot)}
                      strokeWidth={on ? THICKNESS + 6 : THICKNESS}
                      strokeDasharray={`${a.dash} ${CIRC - a.dash}`}
                      strokeDashoffset={-a.offset}
                      opacity={active && !on ? 0.35 : 1}
                      tabIndex={0}
                      role="button"
                      aria-pressed={pinned?.category === a.category}
                      aria-label={`${a.category}: ${formatBRL(a.cents)}, ${formatPct(a.share)} do total`}
                      onPointerMove={(e) => e.pointerType === "mouse" && setHover(pointerTip(a.category, e))}
                      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
                      // Clique/toque fixa a fatia; clicar de novo na mesma solta.
                      onClick={() => {
                        pinnedByKey.current = false;
                        setPinned((p) => (p?.category === a.category ? null : { category: a.category, ...anchorOf(a.mid) }));
                      }}
                      // Foco só pelo teclado (o foco de um clique não deve fixar e soltar em seguida)
                      onFocus={(e) => {
                        if (!e.currentTarget.matches(":focus-visible")) return;
                        pinnedByKey.current = true;
                        setPinned({ category: a.category, ...anchorOf(a.mid) });
                      }}
                      onBlur={() => {
                        if (pinnedByKey.current) setPinned(null);
                        pinnedByKey.current = false;
                      }}
                      className="cursor-pointer outline-none transition-[stroke-width,opacity] duration-150"
                    />
                  );
                })}
              </g>
            </svg>

            {/* Centro: total geral, ou o valor da categoria em foco */}
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center" aria-hidden>
              <span className="num text-lg font-semibold tracking-tight transition-opacity">{formatBRL(active?.cents ?? total)}</span>
              <span className="mx-auto max-w-[120px] truncate text-xs text-fg-3">{active ? active.category : "total"}</span>
            </div>

            {/* Tooltip flutuante: valor primeiro, depois a categoria e a % */}
            {active && tip && (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-10 w-max max-w-[200px] rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
                style={{
                  left: Math.min(Math.max(tip.x, 8), tip.w - 8),
                  top: tip.y,
                  // Abre para fora do anel (longe do valor central)
                  transform: `translate(${tip.x > tip.w / 2 ? "12px" : "calc(-100% - 12px)"}, ${tip.y > tip.w / 2 ? "8px" : "calc(-100% - 8px)"})`,
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="h-0.5 w-3 rounded" style={{ background: colorOf(active.slot) }} aria-hidden />
                  <span className="text-fg-2">{active.category}</span>
                </span>
                <span className="num mt-0.5 block text-sm font-semibold">{formatBRL(active.cents)}</span>
                <span className="num block text-fg-3">{formatPct(active.share)} do total</span>
              </div>
            )}
          </div>

          {/* Legenda compacta: só cor + nome (valores ficam no tooltip) */}
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm sm:flex-col sm:flex-nowrap" aria-label="Legenda">
            {slices.map((s) => (
              <li
                key={s.category}
                onPointerEnter={() => setHover({ category: s.category, ...anchorOf(arcs.find((a) => a.category === s.category)!.mid) })}
                onPointerLeave={() => setHover(null)}
                className={`flex items-center gap-2 rounded-md transition-opacity ${active && active.category !== s.category ? "opacity-50" : ""}`}
              >
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colorOf(s.slot) }} aria-hidden />
                <span className="truncate text-fg-2">{s.category}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {total > 0 && (
        // Os valores continuam acessíveis sem hover (teclado/leitor de tela/consulta rápida)
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-fg-2 hover:text-fg">Ver valores</summary>
          <table className="num mt-2 w-full text-xs">
            <tbody className="divide-y divide-border">
              {slices.map((s) => (
                <tr key={s.category}>
                  <td className="py-1.5 text-fg-2">{s.category}</td>
                  <td className="py-1.5 text-right">{formatBRL(s.cents)}</td>
                  <td className="w-12 py-1.5 text-right text-fg-3">{formatPct(s.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
