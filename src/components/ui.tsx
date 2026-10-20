import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-border bg-surface p-5 md:p-6 ${className}`}>{children}</section>;
}

export function CardTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-sm font-medium text-fg-2">{children}</h2>
      {aside}
    </div>
  );
}

type Tone = "good" | "warning" | "critical";

const toneCls: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
};
const toneIcon = { good: CircleCheck, warning: TriangleAlert, critical: CircleAlert };

/** Status sempre com ícone + texto (nunca só cor). */
export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneCls[tone]}`}>
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** Barra de progresso simples (meter). */
export function Meter({ value, max, tone = "accent", label }: { value: number; max: number; tone?: "accent" | Tone; label: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  const color = { accent: "bg-accent", good: "bg-good", warning: "bg-warning", critical: "bg-critical" }[tone];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  colorVar: string; // ex.: "var(--series-1)"
  display: string;
}

/** Barra empilhada horizontal com gap de 2px entre segmentos + legenda com valores. */
export function StackedBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div>
      <div role="img" aria-label={label} className="flex h-3 w-full gap-[2px]">
        {total > 0 ? (
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.label}
                title={`${s.label}: ${s.display} (${Math.round((s.value / total) * 100)}%)`}
                className="h-full rounded-[4px] transition-opacity hover:opacity-80"
                style={{ width: `${(s.value / total) * 100}%`, background: s.colorVar }}
              />
            ))
        ) : (
          <div className="h-full w-full rounded-[4px] bg-surface-2" />
        )}
      </div>
      <ul className="mt-3 grid gap-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.colorVar }} aria-hidden />
            <span className="text-fg-2">{s.label}</span>
            <span className="num ml-auto font-medium">{s.display}</span>
            {total > 0 && <span className="num w-10 text-right text-xs text-fg-3">{Math.round((s.value / total) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tile de número com rótulo. */
export function Stat({
  label,
  value,
  sub,
  tone,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "critical";
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-4 md:p-5 ${className}`}>
      <p className="text-xs text-fg-3 md:text-sm">{label}</p>
      <p className={`num mt-2 truncate text-lg font-semibold tracking-tight md:text-2xl ${tone === "good" ? "text-good" : tone === "critical" ? "text-critical" : ""}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-fg-3">{sub}</p>}
    </div>
  );
}
