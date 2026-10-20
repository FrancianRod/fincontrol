"use client";

import { useState, useTransition } from "react";
import { CircleCheck, History, Loader2, Plus, Undo2 } from "lucide-react";
import { ActionForm, CheckField, DeleteButton, Dialog, MoneyField, TextField } from "@/components/form";
import { Meter } from "@/components/ui";
import { formatBRL } from "@/lib/finance";
import { centsToInput } from "@/lib/form-state";
import { createCreditLetter, deleteCreditLetter, setCreditLetterInstallmentPaid, updateCreditLetter } from "./actions";

/** Valores do consórcio vigentes no mês/ano selecionado. */
export interface CreditLetterSnapshotView {
  /** Mês do retrato em vigor (pode ser anterior ao selecionado). */
  periodLabel: string;
  /** O retrato é exatamente do mês selecionado. */
  exact: boolean;
  correctedCreditCents: number | null;
  paidCents: number;
  outstandingCents: number;
  installmentCents: number;
  paidInstallments: number;
  installmentPaid: boolean;
  /** Parcela do mês registrada depois do dia selecionado (dd/mm/aaaa). */
  installmentPaidLaterLabel: string | null;
}

export interface CreditLetterItem {
  id: string;
  name: string;
  administrator: string | null;
  creditValueCents: number;
  totalInstallments: number | null;
  dueDay: number;
  contemplated: boolean;
  snapshot: CreditLetterSnapshotView | null;
  firstPeriodLabel: string | null;
}

export function CreditLetterManager({
  items,
  dayKey,
  periodKey,
  periodLabel,
}: {
  items: CreditLetterItem[];
  /** "AAAA-MM-DD" do filtro (dia em que a parcela é registrada) */
  dayKey: string;
  /** "AAAA-MM" do mês do filtro */
  periodKey: string;
  /** ex.: "out/2026" */
  periodLabel: string;
}) {
  const [editing, setEditing] = useState<CreditLetterItem | "new" | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const close = () => setEditing(null);
  const current = editing === "new" ? null : editing;
  const snap = current?.snapshot ?? null;

  function setPaid(id: string, paid: boolean) {
    setPayingId(id);
    startTransition(async () => {
      await setCreditLetterInstallmentPaid(id, dayKey, paid);
      setPayingId(null);
    });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-fg-2">Cartas de crédito / consórcios</h2>
          <p className="text-xs text-fg-3">Valores de {periodLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          aria-label="Novo consórcio"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-fg px-3 text-sm font-medium text-bg hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden /> Novo
        </button>
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-3">Nenhum consórcio cadastrado.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((c) => {
            const s = c.snapshot;
            return (
              <li key={c.id} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-fg-3">
                      {c.administrator ?? "—"} · vence dia {c.dueDay}
                      {c.contemplated && <span className="font-medium text-good"> · contemplada</span>}
                    </p>
                  </div>
                  <div className="num shrink-0 text-right text-sm">
                    <p>
                      <span className="block text-xs text-fg-3">Carta</span>
                      <span className="font-medium">{formatBRL(c.creditValueCents)}</span>
                    </p>
                    {s?.correctedCreditCents != null && (
                      <p className="mt-1">
                        <span className="block text-xs text-fg-3">Crédito corrigido</span>
                        <span className="font-medium">{formatBRL(s.correctedCreditCents)}</span>
                      </p>
                    )}
                  </div>
                </div>

                {s ? (
                  <>
                    {!s.exact && (
                      <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs text-fg-2">
                        <History className="size-3.5" aria-hidden />
                        Sem reajuste em {periodLabel} · valores de {s.periodLabel}
                      </p>
                    )}

                    <Meter
                      label={`Progresso de pagamento: ${c.name}`}
                      value={s.paidCents}
                      max={s.paidCents + s.outstandingCents}
                      tone={s.outstandingCents <= 0 ? "good" : "accent"}
                    />

                    <dl className="num mt-3 grid grid-cols-3 gap-2 text-xs text-fg-3">
                      <div>
                        <dt>Pago</dt>
                        <dd className="text-sm font-medium text-fg">{formatBRL(s.paidCents)}</dd>
                      </div>
                      <div>
                        <dt>Saldo devedor</dt>
                        <dd className="text-sm font-medium text-fg">{formatBRL(s.outstandingCents)}</dd>
                      </div>
                      <div className="text-right">
                        <dt>Parcela{c.totalInstallments ? ` ${s.paidInstallments}/${c.totalInstallments}` : ` · ${s.paidInstallments} pagas`}</dt>
                        <dd className="text-sm font-medium text-fg">{formatBRL(s.installmentCents)}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-2">
                    Sem valores registrados até {periodLabel}
                    {c.firstPeriodLabel && <> · primeiro registro em {c.firstPeriodLabel}</>}.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="h-9 rounded-lg px-3 text-sm font-medium text-fg-2 hover:bg-surface-2 hover:text-fg"
                  >
                    {s ? "Editar" : `Registrar valores de ${periodLabel}`}
                  </button>
                  {s &&
                    (s.installmentPaidLaterLabel ? (
                      <span className="inline-flex h-9 items-center gap-1.5 px-1 text-sm text-fg-2">
                        <History className="size-4" aria-hidden /> Parcela de {periodLabel} registrada em {s.installmentPaidLaterLabel}
                      </span>
                    ) : s.installmentPaid ? (
                      <>
                        <span className="inline-flex h-9 items-center gap-1.5 px-1 text-sm font-medium text-good">
                          <CircleCheck className="size-4" aria-hidden /> Parcela de {periodLabel} paga
                        </span>
                        <button
                          type="button"
                          disabled={payingId === c.id}
                          onClick={() => setPaid(c.id, false)}
                          aria-label={`Desfazer pagamento da parcela de ${periodLabel}`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-60"
                        >
                          {payingId === c.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Undo2 className="size-4" aria-hidden />}
                          Desfazer
                        </button>
                      </>
                    ) : s.outstandingCents <= 0 ? (
                      <span className="inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium text-good">
                        <CircleCheck className="size-4" aria-hidden /> Quitado
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={payingId === c.id}
                        onClick={() => setPaid(c.id, true)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-60"
                      >
                        {payingId === c.id && <Loader2 className="size-4 animate-spin" aria-hidden />}
                        Registrar parcela de {periodLabel}
                      </button>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={close} title={current ? "Editar consórcio" : "Novo consórcio"}>
        <ActionForm
          key={`${current?.id ?? "new"}-${periodKey}`}
          action={current ? updateCreditLetter.bind(null, current.id) : createCreditLetter}
          onSuccess={close}
          submitLabel={current ? "Salvar" : "Adicionar"}
          extraActions={
            current && (
              <DeleteButton
                confirmText={`Excluir "${current.name}" e todo o histórico de reajustes?`}
                onDelete={async () => {
                  await deleteCreditLetter(current.id);
                  close();
                }}
              />
            )
          }
        >
          <input type="hidden" name="period" value={periodKey} />
          <p className="-mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2">
            Parcela, crédito corrigido, pago e saldo devedor ficam registrados para <strong className="font-medium text-fg">{periodLabel}</strong> e
            valem nos meses seguintes até o próximo reajuste.
          </p>
          <div className="grid grid-cols-2 items-start gap-3">
            <TextField name="name" label="Nome" placeholder="Ex.: Consórcio imóvel" defaultValue={current?.name} required autoFocus />
            <TextField name="administrator" label="Administradora" placeholder="Opcional" defaultValue={current?.administrator ?? ""} />
          </div>
          <div className="grid grid-cols-2 items-start gap-3">
            <MoneyField name="creditValueCents" label="Valor da carta" defaultValue={current ? centsToInput(current.creditValueCents) : ""} required />
            <MoneyField name="installmentCents" label="Parcela mensal" hint="Entra na projeção de sobra" defaultValue={snap ? centsToInput(snap.installmentCents) : ""} required />
          </div>
          <div className="grid grid-cols-2 items-start gap-3">
            <MoneyField
              name="correctedCreditCents"
              label="Crédito corrigido"
              hint="Após reajustes · opcional"
              placeholder="—"
              defaultValue={snap?.correctedCreditCents != null ? centsToInput(snap.correctedCreditCents) : ""}
            />
            <MoneyField name="outstandingCents" label="Saldo devedor" defaultValue={snap ? centsToInput(snap.outstandingCents) : ""} required />
          </div>
          <div className="grid grid-cols-2 items-start gap-3">
            <MoneyField name="paidCents" label="Pago acumulado" defaultValue={snap ? centsToInput(snap.paidCents) : "0,00"} required />
            <TextField name="paidInstallments" label="Parcelas pagas" type="number" inputMode="numeric" min={0} defaultValue={snap?.paidInstallments ?? 0} required />
          </div>
          <div className="grid grid-cols-2 items-start gap-3">
            <TextField name="totalInstallments" label="Total de parcelas" type="number" inputMode="numeric" min={1} placeholder="—" defaultValue={current?.totalInstallments ?? ""} />
            <TextField name="dueDay" label="Dia de vencimento" type="number" inputMode="numeric" min={1} max={31} defaultValue={current?.dueDay ?? 10} required />
          </div>
          <CheckField name="contemplated" label="Contemplada" defaultChecked={current?.contemplated ?? false} />
        </ActionForm>
      </Dialog>
    </>
  );
}
