"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { ActionForm, CheckField, DeleteButton, Dialog, MoneyField, SelectField, TextField } from "@/components/form";
import { formatBRL } from "@/lib/finance";
import { centsToInput } from "@/lib/form-state";
import { createIncome, deleteIncome, toggleIncomeReceived, updateIncome } from "./actions";

export interface IncomeItem {
  id: string;
  description: string;
  amountCents: number;
  type: "SALARY" | "FREELANCE" | "YIELD" | "OTHER";
  date: string; // AAAA-MM-DD
  /** Confirmada como recebida */
  received: boolean;
  /** Data depois do dia do filtro (ainda não conta como recebida naquele dia) */
  afterDay: boolean;
}

export const incomeTypeLabels: Record<IncomeItem["type"], string> = {
  SALARY: "Salário",
  FREELANCE: "Freela",
  YIELD: "Rendimentos",
  OTHER: "Outros",
};

const typeOptions = Object.entries(incomeTypeLabels).map(([value, label]) => ({ value, label }));

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function IncomeManager({ items, defaultDate, dayLabel }: { items: IncomeItem[]; defaultDate: string; dayLabel: string }) {
  const [editing, setEditing] = useState<IncomeItem | "new" | null>(null);
  const [optimistic, toggleOptimistic] = useOptimistic(items, (state, id: string) =>
    state.map((i) => (i.id === id ? { ...i, received: !i.received } : i)),
  );
  const [, startTransition] = useTransition();
  const close = () => setEditing(null);
  const current = editing === "new" ? null : editing;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-fg-2">
          Entradas do mês
          <span className="block text-xs font-normal text-fg-3">Status em {dayLabel}</span>
        </h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-fg px-3 text-sm font-medium text-bg hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden /> Nova entrada
        </button>
      </div>

      {optimistic.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-3">Nenhuma entrada neste mês.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {optimistic.map((item) => {
            const receivedNow = item.received && !item.afterDay;
            return (
            <li key={item.id} className={`flex items-center gap-2 ${item.afterDay ? "opacity-80" : ""}`}>
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-surface-2"
                aria-label={`Editar ${item.description}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.description}</span>
                  <span className="block text-xs text-fg-3">
                    {item.afterDay ? "A receber · " : ""}
                    {formatDay(item.date)} · {incomeTypeLabels[item.type]}
                  </span>
                </span>
                <span className="num text-sm font-medium text-good">+ {formatBRL(item.amountCents)}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    toggleOptimistic(item.id);
                    await toggleIncomeReceived(item.id);
                  })
                }
                aria-pressed={item.received}
                aria-label={`${item.description}: marcar como ${item.received ? "prevista" : "recebida"}`}
                className={`w-24 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  receivedNow ? "bg-good-soft text-good" : "bg-surface-2 text-fg-2 hover:text-fg"
                }`}
              >
                {receivedNow ? "Recebida" : item.received ? "Agendada" : "Prevista"}
              </button>
            </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={close} title={current ? "Editar entrada" : "Nova entrada"}>
        <ActionForm
          action={current ? updateIncome.bind(null, current.id) : createIncome}
          onSuccess={close}
          submitLabel={current ? "Salvar" : "Adicionar"}
          extraActions={
            current && (
              <DeleteButton
                confirmText={`Excluir "${current.description}"?`}
                onDelete={async () => {
                  await deleteIncome(current.id);
                  close();
                }}
              />
            )
          }
        >
          <TextField name="description" label="Descrição" placeholder="Ex.: Salário líquido" defaultValue={current?.description} required autoFocus />
          <div className="grid grid-cols-2 items-start gap-3">
            <MoneyField name="amountCents" label="Valor" defaultValue={current ? centsToInput(current.amountCents) : ""} required />
            <SelectField name="type" label="Tipo" options={typeOptions} defaultValue={current?.type ?? "SALARY"} />
          </div>
          <TextField name="date" label="Data" type="date" defaultValue={current?.date ?? defaultDate} required />
          <CheckField
            name="received"
            label="Já recebida"
            hint="Desmarque se for uma renda prevista que ainda não caiu na conta."
            defaultChecked={current?.received ?? true}
          />
        </ActionForm>
      </Dialog>
    </>
  );
}
