"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { toggleExpenseStatus } from "@/app/actions";
import { formatBRL } from "@/lib/finance";

interface Item {
  id: string;
  description: string;
  category: string;
  amountCents: number;
  status: "PAID" | "PENDING";
  dueDate: string; // ISO
}

/** `items[].status` já vem como o status no dia do filtro (`dayKey`). */
export function FixedCostList({ items, dayKey }: { items: Item[]; dayKey: string }) {
  const [optimistic, setOptimistic] = useOptimistic(items, (state, id: string) =>
    state.map((i) => (i.id === id ? { ...i, status: i.status === "PAID" ? "PENDING" : "PAID" } as Item : i)),
  );
  const [, startTransition] = useTransition();

  if (!items.length) {
    return <p className="py-6 text-center text-sm text-fg-3">Nenhum custo fixo neste mês.</p>;
  }

  // "Atrasado" é relativo ao dia do filtro.
  const [y, m, d] = dayKey.split("-").map(Number);
  const today = new Date(y, m - 1, d);

  return (
    <ul className="-mx-2 divide-y divide-border">
      {optimistic.map((item) => {
        const paid = item.status === "PAID";
        const due = new Date(item.dueDate);
        const overdue = !paid && due < today;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  setOptimistic(item.id);
                  await toggleExpenseStatus(item.id, dayKey);
                })
              }
              aria-pressed={paid}
              aria-label={`${item.description}: marcar como ${paid ? "pendente" : "pago"}`}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                  paid ? "border-good bg-good text-surface" : "border-border"
                }`}
              >
                {paid && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-medium ${paid ? "text-fg-3 line-through decoration-fg-3/40" : ""}`}>
                  {item.description}
                </span>
                <span className={`block text-xs ${overdue ? "font-medium text-critical" : "text-fg-3"}`}>
                  {overdue ? "Atrasado · " : ""}vence {due.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · {item.category}
                </span>
              </span>
              <span className="text-right">
                <span className="num block text-sm font-medium">{formatBRL(item.amountCents)}</span>
                <span className={`block text-xs ${paid ? "text-good" : "text-fg-3"}`}>{paid ? "Pago" : "Pendente"}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
