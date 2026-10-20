"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { Check, CreditCard, Loader2, Plus, Repeat, Trash2 } from "lucide-react";
import { ActionForm, CheckField, Dialog, MoneyField, SegmentedField, SelectField, TextField } from "@/components/form";
import { formatBRL } from "@/lib/finance";
import { centsToInput } from "@/lib/form-state";
import { toggleExpenseStatus } from "@/app/actions";
import { createExpense, deleteExpense, updateExpense } from "./actions";

export interface ExpenseSeriesInfo {
  mode: "CONTINUOUS" | "INSTALLMENTS";
  installmentNumber: number | null;
  totalInstallments: number | null;
  /** Parcelas que faltam pagar (até a data do filtro) */
  remaining: number | null;
  /** Último mês, ex.: "dez/2027" (null = sem término) */
  endLabel: string | null;
  endMonthKey: string | null;
}

export interface ExpenseItem {
  id: string;
  description: string;
  amountCents: number;
  category: string;
  type: "FIXED" | "VARIABLE";
  /** Status gravado (hoje) */
  status: "PAID" | "PENDING";
  /** Pago até o fim do dia do filtro */
  paidAsOf: boolean;
  /** Paga depois do dia do filtro (dd/mm/aaaa) */
  paidLaterLabel: string | null;
  dueDate: string; // AAAA-MM-DD
  /** Vence depois do dia do filtro */
  dueAfterDay: boolean;
  essential: boolean;
  series: ExpenseSeriesInfo | null;
}

function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Parcela 3/12 · faltam 9" ou "Todo mês · até dez/2027". */
function seriesText(s: ExpenseSeriesInfo) {
  if (s.mode === "INSTALLMENTS") {
    const base = `Parcela ${s.installmentNumber ?? "?"}/${s.totalInstallments ?? "?"}`;
    return s.remaining != null ? `${base} · ${s.remaining ? `faltam ${s.remaining}` : "quitada"}` : base;
  }
  return s.endLabel ? `Todo mês · até ${s.endLabel}` : "Todo mês";
}

export function ExpenseManager({
  items,
  categories,
  defaultType,
  dayKey,
  dayLabel,
}: {
  items: ExpenseItem[];
  categories: string[];
  defaultType: "FIXED" | "VARIABLE";
  /** Dia do filtro: data padrão de novas despesas e de pagamentos marcados */
  dayKey: string;
  dayLabel: string;
}) {
  const [editing, setEditing] = useState<ExpenseItem | "new" | null>(null);
  const [optimistic, toggleOptimistic] = useOptimistic(items, (state, id: string) =>
    state.map((i) => (i.id === id ? { ...i, paidAsOf: !i.paidAsOf, paidLaterLabel: null } : i)),
  );
  const [, startTransition] = useTransition();
  const close = () => setEditing(null);
  const current = editing === "new" ? null : editing;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-fg-2">
          {optimistic.length} {optimistic.length === 1 ? "despesa" : "despesas"}
          <span className="block text-xs font-normal text-fg-3">Status em {dayLabel}</span>
        </h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-fg px-3 text-sm font-medium text-bg hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden /> Nova despesa
        </button>
      </div>

      {optimistic.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-3">Nenhuma despesa neste filtro.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {optimistic.map((item) => {
            const paid = item.paidAsOf;
            const overdue = !paid && !item.dueAfterDay && item.dueDate < dayKey;
            const SeriesIcon = item.series?.mode === "INSTALLMENTS" ? CreditCard : Repeat;
            return (
              <li key={item.id} className={`flex items-center gap-1 ${item.dueAfterDay && !paid ? "opacity-80" : ""}`}>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      toggleOptimistic(item.id);
                      await toggleExpenseStatus(item.id, dayKey);
                    })
                  }
                  aria-pressed={paid}
                  aria-label={`${item.description}: marcar como ${item.status === "PAID" ? "pendente" : `pago em ${dayLabel}`}`}
                  className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-surface-2"
                >
                  <span
                    className={`grid size-5 place-items-center rounded-md border transition-colors ${
                      paid ? "border-good bg-good text-surface" : item.paidLaterLabel ? "border-dashed border-good" : "border-border"
                    }`}
                  >
                    {paid && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  aria-label={`Editar ${item.description}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${paid ? "text-fg-3" : ""}`}>{item.description}</span>
                    {item.series && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-fg-2">
                        <SeriesIcon className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{seriesText(item.series)}</span>
                      </span>
                    )}
                    <span className={`block truncate text-xs ${overdue ? "font-medium text-critical" : "text-fg-3"}`}>
                      {overdue ? "Atrasado · " : item.dueAfterDay && !paid ? "A vencer · " : ""}
                      {parseDay(item.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · {item.category} ·{" "}
                      {item.type === "FIXED" ? "Fixo" : "Variável"}
                      {!item.essential && " · não essencial"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-sm font-medium">{formatBRL(item.amountCents)}</span>
                    <span className={`block text-xs ${paid ? "text-good" : "text-fg-3"}`}>
                      {paid ? "Pago" : item.paidLaterLabel ? `Pago em ${item.paidLaterLabel}` : "Pendente"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={close} title={current ? "Editar despesa" : "Nova despesa"}>
        <ExpenseForm
          key={current?.id ?? "new"}
          current={current}
          categories={categories}
          defaultType={defaultType}
          dayKey={dayKey}
          onDone={close}
        />
      </Dialog>
    </>
  );
}

function ExpenseForm({
  current,
  categories,
  defaultType,
  dayKey,
  onDone,
}: {
  current: ExpenseItem | null;
  categories: string[];
  defaultType: "FIXED" | "VARIABLE";
  dayKey: string;
  onDone: () => void;
}) {
  const listId = useId();
  const s = current?.series ?? null;
  // Em série, por padrão a edição vale só para este mês (mais seguro).
  const [scope, setScope] = useState<"THIS" | "FOLLOWING">("THIS");
  const showRepeat = !s || scope === "FOLLOWING";

  return (
    <ActionForm
      action={current ? updateExpense.bind(null, current.id) : createExpense}
      onSuccess={onDone}
      submitLabel={current ? "Salvar" : "Adicionar"}
      extraActions={current && <DeleteExpense item={current} onDeleted={onDone} />}
    >
      <input type="hidden" name="paidOn" value={dayKey} />
      {s && (
        <div onChange={(e) => setScope((e.target as unknown as HTMLInputElement).value as "THIS" | "FOLLOWING")}>
          <SegmentedField
            name="scope"
            label="Aplicar alterações a"
            defaultValue="THIS"
            options={[
              { value: "THIS", label: "Só este mês" },
              { value: "FOLLOWING", label: "Este e os próximos" },
            ]}
          />
        </div>
      )}
      <TextField name="description" label="Descrição" placeholder="Ex.: Aluguel" defaultValue={current?.description} required autoFocus={!current} />
      <div className="grid grid-cols-2 items-start gap-3">
        <MoneyField
          name="amountCents"
          label="Valor"
          hint={s?.mode === "INSTALLMENTS" ? "Valor de cada parcela" : undefined}
          defaultValue={current ? centsToInput(current.amountCents) : ""}
          required
        />
        <TextField name="category" label="Categoria" list={listId} placeholder="Ex.: Moradia" defaultValue={current?.category} required />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="grid grid-cols-2 items-start gap-3">
        <SelectField
          name="type"
          label="Tipo"
          defaultValue={current?.type ?? defaultType}
          options={[
            { value: "FIXED", label: "Fixo" },
            { value: "VARIABLE", label: "Variável" },
          ]}
        />
        <SelectField
          name="status"
          label="Status"
          defaultValue={current?.status ?? "PENDING"}
          options={[
            { value: "PENDING", label: "Pendente" },
            { value: "PAID", label: "Pago" },
          ]}
        />
      </div>
      <TextField name="dueDate" label="Vencimento" type="date" defaultValue={current?.dueDate ?? dayKey} required />
      <CheckField
        name="essential"
        label="Essencial"
        hint="Entra no Custo de Vida Real (moradia, contas, mercado, transporte…)."
        defaultChecked={current?.essential ?? true}
      />
      {showRepeat ? (
        <RepeatFields series={s} defaultRepeat={current ? "NONE" : defaultType === "FIXED" ? "CONTINUOUS" : "NONE"} />
      ) : (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2">
          Para mudar a repetição ou o número de parcelas, escolha “Este e os próximos”.
        </p>
      )}
    </ActionForm>
  );
}

function RepeatFields({ series, defaultRepeat }: { series: ExpenseSeriesInfo | null; defaultRepeat: "NONE" | "CONTINUOUS" }) {
  const [repeat, setRepeat] = useState<"NONE" | "CONTINUOUS" | "INSTALLMENTS">(series?.mode ?? defaultRepeat);
  const [endMode, setEndMode] = useState<"NEVER" | "COUNT" | "UNTIL">(series?.endMonthKey && series.mode === "CONTINUOUS" ? "UNTIL" : "NEVER");

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-border p-3">
      <div onChange={(e) => setRepeat((e.target as unknown as HTMLInputElement).value as typeof repeat)}>
        <SegmentedField
          name="repeat"
          label="Repetição"
          columns={3}
          defaultValue={repeat}
          options={[
            { value: "NONE", label: "Não repete" },
            { value: "CONTINUOUS", label: "Todo mês", icon: <Repeat className="size-4 shrink-0" aria-hidden /> },
            { value: "INSTALLMENTS", label: "Parcelada", icon: <CreditCard className="size-4 shrink-0" aria-hidden /> },
          ]}
        />
      </div>

      {repeat === "CONTINUOUS" && (
        <div className="grid grid-cols-2 items-start gap-3">
          <div onChange={(e) => setEndMode((e.target as unknown as HTMLSelectElement).value as typeof endMode)}>
            <SelectField
              name="endMode"
              label="Termina"
              defaultValue={endMode}
              options={[
                { value: "NEVER", label: "Sem término" },
                { value: "COUNT", label: "Após N meses" },
                { value: "UNTIL", label: "Em um mês/ano" },
              ]}
            />
          </div>
          {endMode === "COUNT" && (
            <TextField name="endCount" label="Por quantos meses" type="number" inputMode="numeric" min={1} max={600} placeholder="Ex.: 12" hint="Contando este mês" required />
          )}
          {endMode === "UNTIL" && (
            <TextField name="endMonth" label="Último mês" type="month" defaultValue={series?.endMonthKey ?? ""} hint="Inclusive" required />
          )}
        </div>
      )}

      {repeat === "INSTALLMENTS" && (
        <div className="grid grid-cols-2 items-start gap-3">
          <TextField
            name="installments"
            label="Nº de parcelas"
            type="number"
            inputMode="numeric"
            min={2}
            max={600}
            placeholder="Ex.: 12"
            defaultValue={series?.totalInstallments ?? ""}
            hint="O valor acima é o de cada parcela"
            required
          />
          <TextField
            name="currentInstallment"
            label="Parcela deste mês"
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            defaultValue={series?.installmentNumber ?? 1}
            hint="Ex.: 3 se já pagou 2"
            required
          />
        </div>
      )}
    </div>
  );
}

/** Exclusão com confirmação na tela (sem confirm() do navegador) e escopo para séries. */
function DeleteExpense({ item, onDeleted }: { item: ExpenseItem; onDeleted: () => void }) {
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(scope: "THIS" | "FOLLOWING") {
    startTransition(async () => {
      await deleteExpense(item.id, scope);
      onDeleted();
    });
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-critical hover:bg-critical-soft"
      >
        <Trash2 className="size-4" aria-hidden /> Excluir
      </button>
    );
  }

  const btn = "inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-60";
  return (
    <div role="group" aria-label="Confirmar exclusão" className="flex flex-wrap items-center gap-1">
      {pending && <Loader2 className="size-4 animate-spin text-critical" aria-hidden />}
      {item.series ? (
        <>
          <button type="button" disabled={pending} onClick={() => run("THIS")} className={`${btn} bg-critical-soft text-critical`}>
            Excluir só este mês
          </button>
          <button type="button" disabled={pending} onClick={() => run("FOLLOWING")} className={`${btn} bg-critical-soft text-critical`}>
            Este e os próximos
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => run("THIS")} className={`${btn} bg-critical-soft text-critical`}>
          Confirmar exclusão
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => setAsking(false)} className={`${btn} text-fg-2 hover:bg-surface-2`}>
        Cancelar
      </button>
    </div>
  );
}
