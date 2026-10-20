"use client";

import { useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { ActionForm, DeleteButton, Dialog, MoneyField, SegmentedField, SelectField, TextField } from "@/components/form";
import { formatBRL } from "@/lib/finance";
import { centsToInput } from "@/lib/form-state";
import { txKindLabels, type InvestmentTxKind } from "@/lib/investments";
import { assetTypeColor, assetTypeLabels, assetTypeOrder, type AssetTypeKey } from "@/lib/labels";
import {
  addInvestmentTransaction,
  createInvestment,
  deleteInvestment,
  deleteInvestmentTransaction,
  updateInvestment,
  updateInvestmentMarketValue,
} from "./actions";

export interface InvestmentHistoryItem {
  id: string;
  type: InvestmentTxKind;
  /** Aporte/resgate: positivo. Rendimento: com sinal (negativo = desvalorização). */
  amountCents: number;
  dateLabel: string;
  note: string | null;
  balanceAfterCents: number;
  /** Lançada depois do dia selecionado no filtro (não entra no saldo exibido). */
  afterSelectedDay: boolean;
}

export interface InvestmentItem {
  id: string;
  name: string;
  assetType: AssetTypeKey;
  institution: string | null;
  /** Saldo até o dia selecionado */
  balanceCents: number;
  /** Saldo com todas as movimentações */
  totalBalanceCents: number;
  monthlyContributionCents: number;
  /** Rendimentos do mês do filtro até o dia selecionado (com sinal) */
  monthYieldCents: number;
  /** Mais recente primeiro */
  history: InvestmentHistoryItem[];
}

const typeOptions = assetTypeOrder.map((value) => ({ value, label: assetTypeLabels[value] }));

const operationOptions = [
  {
    value: "APORTE",
    label: txKindLabels.APORTE,
    icon: <ArrowUpRight className="size-4" aria-hidden />,
    checkedClass: "has-[:checked]:bg-good-soft has-[:checked]:text-good",
  },
  {
    value: "RESGATE",
    label: txKindLabels.RESGATE,
    icon: <ArrowDownLeft className="size-4" aria-hidden />,
    checkedClass: "has-[:checked]:bg-critical-soft has-[:checked]:text-critical",
  },
  {
    value: "RENDIMENTO",
    label: "Rendimento (+)",
    icon: <TrendingUp className="size-4" aria-hidden />,
    checkedClass: "has-[:checked]:bg-surface-2 has-[:checked]:text-accent",
  },
  {
    value: "DESVALORIZACAO",
    label: "Desvalorização (−)",
    icon: <TrendingDown className="size-4" aria-hidden />,
    checkedClass: "has-[:checked]:bg-warning-soft has-[:checked]:text-warning",
  },
];

/** Na criação só faz sentido entrada ou saída de dinheiro. */
const initialOperationOptions = operationOptions.slice(0, 2);

export function InvestmentManager({
  items,
  dayKey,
  dayLabel,
  monthLabel,
}: {
  items: InvestmentItem[];
  dayKey: string;
  dayLabel: string;
  /** ex.: "out/2026" */
  monthLabel: string;
}) {
  // Guarda só o id: o item é relido das props a cada render (histórico atualizado).
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [txFormKey, setTxFormKey] = useState(0);
  const [updateFormKey, setUpdateFormKey] = useState(0);
  const close = () => setEditing(null);
  const current = editing && editing !== "new" ? (items.find((i) => i.id === editing) ?? null) : null;

  const groups = assetTypeOrder
    .map((type) => ({ type, items: items.filter((i) => i.assetType === type) }))
    .filter((g) => g.items.length);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-fg-2">Investimentos</h2>
          <p className="text-xs text-fg-3">Saldos em {dayLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          aria-label="Novo investimento"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-fg px-3 text-sm font-medium text-bg hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden /> Novo
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-3">Nenhum investimento cadastrado.</p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.type}>
              <h3 className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-3">
                <span className="size-2.5 rounded-[3px]" style={{ background: assetTypeColor(g.type) }} aria-hidden />
                {assetTypeLabels[g.type]}
                <span className="num ml-auto normal-case tracking-normal">{formatBRL(g.items.reduce((a, i) => a + i.balanceCents, 0))}</span>
              </h3>
              <ul className="-mx-2 divide-y divide-border">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(item.id)}
                      aria-label={`Abrir ${item.name}`}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="block truncate text-xs text-fg-3">
                          {item.institution ?? "—"}
                          {item.monthlyContributionCents > 0 && ` · aporte ${formatBRL(item.monthlyContributionCents)}/mês`}
                        </span>
                      </span>
                      <span className="num text-sm font-medium">{formatBRL(item.balanceCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Novo investimento */}
      <Dialog open={editing === "new"} onClose={close} title="Novo investimento">
        <ActionForm action={createInvestment} onSuccess={close} submitLabel="Adicionar">
          <InvestmentFields />
          <div className="grid gap-3 border-t border-border pt-4">
            <p className="text-sm font-medium">Movimentação inicial</p>
            <SegmentedField name="type" label="Tipo de operação" options={initialOperationOptions} defaultValue="APORTE" />
            <div className="grid grid-cols-2 items-start gap-3">
              <MoneyField name="amountCents" label="Valor" placeholder="0,00" hint="Vazio = sem movimentação" />
              <TextField name="date" label="Data" type="date" defaultValue={dayKey} required />
            </div>
          </div>
        </ActionForm>
      </Dialog>

      {/* Investimento existente: lançamentos + histórico + dados */}
      <Dialog open={!!current} onClose={close} title={current?.name ?? ""}>
        {current && (
          <div className="grid grid-cols-1 gap-6">
            <div className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <span className="text-sm text-fg-2">Saldo em {dayLabel}</span>
              <span className="num text-lg font-semibold">{formatBRL(current.balanceCents)}</span>
            </div>
            {current.monthYieldCents !== 0 && (
              <p className="-mt-4 text-xs text-fg-3">
                Rendimento em {monthLabel} até {dayLabel}:{" "}
                <span className={`num font-medium ${current.monthYieldCents > 0 ? "text-accent" : "text-warning"}`}>
                  {current.monthYieldCents > 0 ? "+" : "−"} {formatBRL(Math.abs(current.monthYieldCents))}
                </span>
              </p>
            )}
            {current.totalBalanceCents !== current.balanceCents && (
              <p className="-mt-4 text-xs text-fg-3">
                Com as movimentações depois de {dayLabel}: <span className="num font-medium text-fg-2">{formatBRL(current.totalBalanceCents)}</span>
              </p>
            )}

            <section className="grid grid-cols-1 gap-3">
              <h3 className="text-sm font-medium">Nova movimentação</h3>
              <ActionForm
                key={`${current.id}-${txFormKey}`}
                action={addInvestmentTransaction.bind(null, current.id)}
                onSuccess={() => setTxFormKey((k) => k + 1)}
                submitLabel="Lançar"
              >
                <SegmentedField name="type" label="Tipo de operação" options={operationOptions} defaultValue="APORTE" />
                <div className="grid grid-cols-2 items-start gap-3">
                  <MoneyField name="amountCents" label="Valor" placeholder="0,00" required />
                  <TextField name="date" label="Data" type="date" defaultValue={dayKey} required />
                </div>
                <TextField name="note" label="Observação" placeholder="Opcional" maxLength={120} />
              </ActionForm>
            </section>

            <section className="grid grid-cols-1 gap-3">
              <div>
                <h3 className="text-sm font-medium">Atualizar saldo</h3>
                <p className="text-xs text-fg-3">Informe o valor de mercado (do extrato) numa data; a diferença entra como rendimento.</p>
              </div>
              <ActionForm
                // Remonta quando o saldo muda para o valor sugerido acompanhar.
                key={`${current.id}-update-${updateFormKey}-${current.balanceCents}`}
                action={updateInvestmentMarketValue.bind(null, current.id)}
                onSuccess={() => setUpdateFormKey((k) => k + 1)}
                submitLabel="Atualizar saldo"
              >
                <div className="grid grid-cols-2 items-start gap-3">
                  <MoneyField name="marketValueCents" label="Saldo de mercado" defaultValue={centsToInput(current.balanceCents)} required />
                  <TextField name="date" label="Data" type="date" defaultValue={dayKey} required />
                </div>
              </ActionForm>
            </section>

            <TransactionHistory history={current.history} />

            <details className="group rounded-xl border border-border">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
                Dados do investimento <span className="text-fg-3 group-open:hidden">· editar</span>
              </summary>
              <div className="border-t border-border p-4">
                <ActionForm
                  key={current.id}
                  action={updateInvestment.bind(null, current.id)}
                  onSuccess={close}
                  extraActions={
                    <DeleteButton
                      confirmText={`Excluir "${current.name}" e todo o histórico de movimentações?`}
                      onDelete={async () => {
                        await deleteInvestment(current.id);
                        close();
                      }}
                    />
                  }
                >
                  <InvestmentFields current={current} />
                </ActionForm>
              </div>
            </details>
          </div>
        )}
      </Dialog>
    </>
  );
}

function InvestmentFields({ current }: { current?: InvestmentItem }) {
  return (
    <>
      <TextField name="name" label="Nome" placeholder="Ex.: Tesouro Selic 2029" defaultValue={current?.name} required autoFocus={!current} />
      <div className="grid grid-cols-2 items-start gap-3">
        <SelectField name="assetType" label="Tipo de ativo" options={typeOptions} defaultValue={current?.assetType ?? "EMERGENCY_RESERVE"} />
        <TextField name="institution" label="Instituição" placeholder="Opcional" defaultValue={current?.institution ?? ""} />
      </div>
      <MoneyField
        name="monthlyContributionCents"
        label="Aporte mensal planejado"
        hint="Entra na projeção de sobra"
        defaultValue={current ? centsToInput(current.monthlyContributionCents) : "0,00"}
      />
    </>
  );
}

function TransactionHistory({ history }: { history: InvestmentHistoryItem[] }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(id: string) {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      const res = await deleteInvestmentTransaction(id);
      if (!res.ok) setError(res.message ?? "Não foi possível excluir.");
      setPendingId(null);
      setConfirmId(null);
    });
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">Histórico</h3>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-critical-soft px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}
      {history.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-3">Nenhuma movimentação.</p>
      ) : (
        <ul className="divide-y divide-border">
          {history.map((t) => {
            const v = txView(t);
            return (
              <li key={t.id} className={`flex items-center gap-3 py-2.5 ${t.afterSelectedDay ? "opacity-55" : ""}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${v.bubble}`} aria-hidden>
                  <v.Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {v.label}
                    {t.note && <span className="text-fg-3"> · {t.note}</span>}
                  </span>
                  <span className="block text-xs text-fg-3">
                    {t.dateLabel}
                    {t.afterSelectedDay && " · depois da data do filtro"}
                  </span>
                </span>
                <span className="num text-right">
                  <span className={`block text-sm font-medium ${v.text}`}>
                    {v.positive ? "+" : "−"} {formatBRL(Math.abs(t.amountCents))}
                  </span>
                  <span className="block text-xs text-fg-3">saldo {formatBRL(t.balanceAfterCents)}</span>
                </span>
                {confirmId === t.id ? (
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    disabled={pendingId === t.id}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-critical-soft px-2 text-xs font-medium text-critical"
                  >
                    {pendingId === t.id && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    Confirmar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(t.id)}
                    aria-label={`Excluir movimentação de ${t.dateLabel}`}
                    className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-critical"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Rótulo, sinal, ícone e cor de cada tipo de movimentação (nunca só a cor). */
function txView(t: Pick<InvestmentHistoryItem, "type" | "amountCents">) {
  if (t.type === "APORTE") return { label: "Aporte", positive: true, Icon: ArrowUpRight, bubble: "bg-good-soft text-good", text: "text-good" };
  if (t.type === "RESGATE") return { label: "Resgate", positive: false, Icon: ArrowDownLeft, bubble: "bg-critical-soft text-critical", text: "text-critical" };
  return t.amountCents >= 0
    ? { label: "Rendimento", positive: true, Icon: TrendingUp, bubble: "bg-surface-2 text-accent", text: "text-accent" }
    : { label: "Desvalorização", positive: false, Icon: TrendingDown, bubble: "bg-warning-soft text-warning", text: "text-warning" };
}
