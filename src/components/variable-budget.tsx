"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import { clearVariableBudget, updateVariableBudget } from "@/app/actions";
import { centsToInput } from "@/lib/form-state";
import { formatBRL } from "@/lib/finance";
import { ActionForm, Dialog, MoneyField } from "./form";

/** Botão + diálogo para definir ou remover o limite mensal de variáveis. */
export function VariableBudgetControl({ budgetCents }: { budgetCents: number | null }) {
  const [open, setOpen] = useState(false);
  const [clearing, startClear] = useTransition();
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-accent hover:underline"
      >
        <Pencil className="size-3" aria-hidden />
        {budgetCents != null ? `Limite: ${formatBRL(budgetCents)}` : "Definir limite"}
      </button>

      <Dialog open={open} onClose={close} title="Limite de variáveis">
        <ActionForm
          action={updateVariableBudget}
          onSuccess={close}
          extraActions={
            budgetCents != null && (
              <button
                type="button"
                disabled={clearing}
                onClick={() =>
                  startClear(async () => {
                    await clearVariableBudget();
                    close();
                  })
                }
                className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-fg-2 hover:bg-surface-2 disabled:opacity-60"
              >
                {clearing && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Remover limite
              </button>
            )
          }
        >
          <MoneyField
            name="variableBudgetCents"
            label="Limite mensal"
            defaultValue={budgetCents != null ? centsToInput(budgetCents) : ""}
            hint="Deixe vazio para usar a média dos últimos 3 meses."
            autoFocus
          />
        </ActionForm>
      </Dialog>
    </>
  );
}
