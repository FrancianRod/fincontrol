"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayLabel, parseDayKey, shiftDay, toDayKey, withMonth } from "@/lib/finance";

const months = Array.from({ length: 12 }, (_, i) => {
  const s = new Date(2000, i, 1).toLocaleDateString("pt-BR", { month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
});

/**
 * Cabeçalho com a data selecionada: seletores de Mês/Ano e navegação dia a
 * dia (‹ Hoje ›). Grava ?data=AAAA-MM-DD; "Hoje" remove o parâmetro.
 * A data exibida muda na hora (otimista) enquanto a página recarrega.
 */
export function DayFilter({
  eyebrow,
  dayKey,
  todayKey,
  fromYear,
  toYear,
}: {
  eyebrow: string;
  dayKey: string;
  todayKey: string;
  fromYear: number;
  toYear: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [shownKey, setShownKey] = useOptimistic(dayKey);
  const date = parseDayKey(shownKey);
  const isToday = shownKey === todayKey;

  function go(next: Date) {
    const key = toDayKey(next);
    const params = new URLSearchParams(searchParams);
    params.delete("mes");
    if (key === todayKey) params.delete("data");
    else params.set("data", key);
    const qs = params.toString();
    startTransition(() => {
      setShownKey(key);
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const years: number[] = [];
  for (let y = Math.min(fromYear, date.getFullYear()); y <= Math.max(toYear, date.getFullYear()); y++) years.push(y);

  const select =
    "h-10 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent";
  const arrow = "grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface-2 hover:text-fg";

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm text-fg-3">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl" aria-live="polite">
          {dayLabel(date)}
        </h1>
      </div>

      <div className={`flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-70" : ""}`} aria-busy={pending}>
        <label className="sr-only" htmlFor="day-filter-month">
          Mês
        </label>
        <select
          id="day-filter-month"
          value={date.getMonth()}
          onChange={(e) => go(withMonth(date, date.getFullYear(), Number(e.target.value)))}
          className={select}
        >
          {months.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="day-filter-year">
          Ano
        </label>
        <select
          id="day-filter-year"
          value={date.getFullYear()}
          onChange={(e) => go(withMonth(date, Number(e.target.value), date.getMonth()))}
          className={select}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
          <button type="button" onClick={() => go(shiftDay(date, -1))} aria-label="Dia anterior" className={arrow}>
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => go(parseDayKey(todayKey))}
            aria-pressed={isToday}
            className={`rounded-lg px-3 py-1.5 text-sm ${isToday ? "bg-surface-2 font-medium" : "text-fg-2 hover:bg-surface-2"}`}
          >
            Hoje
          </button>
          <button type="button" onClick={() => go(shiftDay(date, 1))} aria-label="Próximo dia" className={arrow}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
