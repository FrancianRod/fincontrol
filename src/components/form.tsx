"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, useTransition } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { initialFormState, type FormState } from "@/lib/form-state";

// ─── Dialog (bottom sheet no mobile, modal centralizado no desktop) ─────────

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // clique no backdrop
      }}
      aria-labelledby={titleId}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl border border-border bg-surface p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-[2px] md:m-auto md:max-w-lg md:rounded-2xl"
    >
      {open && (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ─── Form ligado a uma server action ────────────────────────────────────────

const ErrorsContext = createContext<FormState["errors"]>(undefined);

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function ActionForm({
  action,
  onSuccess,
  submitLabel = "Salvar",
  extraActions,
  children,
}: {
  action: Action;
  onSuccess?: () => void;
  submitLabel?: string;
  /** Botões extras à esquerda (ex.: excluir). */
  extraActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.ok) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nonce]);

  return (
    <form
      // onSubmit manual: evita o reset automático dos campos quando há erro de validação
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      noValidate
      className="grid grid-cols-1 gap-4"
    >
      <ErrorsContext.Provider value={state.errors}>{children}</ErrorsContext.Provider>

      {!state.ok && state.message && (
        <p role="alert" className="rounded-lg bg-critical-soft px-3 py-2 text-sm text-critical">
          {state.message}
        </p>
      )}

      <div className="mt-1 flex items-center gap-2">
        {extraActions}
        <button
          type="submit"
          disabled={pending}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-fg px-4 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function useFieldError(name: string) {
  return useContext(ErrorsContext)?.[name]?.[0];
}

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent aria-invalid:border-critical";

function FieldShell({
  id,
  label,
  error,
  hint,
  className = "",
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-fg-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-critical">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-fg-3">{hint}</p>
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "name"> & {
  name: string;
  label: string;
  hint?: string;
  className?: string;
};

export function TextField({ name, label, hint, className, ...rest }: InputProps) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <input
        id={id}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={inputCls}
        {...rest}
      />
    </FieldShell>
  );
}

export function MoneyField({ name, label, hint, className, ...rest }: InputProps) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-fg-3">R$</span>
        <input
          id={id}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`${inputCls} num pl-9`}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  className,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  className?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} label={label} error={error} className={className}>
      <select id={id} name={name} defaultValue={defaultValue} aria-invalid={!!error} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** Grupo de opções lado a lado (radio), ex.: Aporte (+) / Resgate (−). */
export function SegmentedField({
  name,
  label,
  options,
  defaultValue,
  columns = 2,
  className = "",
}: {
  name: string;
  label: string;
  options: { value: string; label: string; icon?: React.ReactNode; checkedClass?: string }[];
  defaultValue?: string;
  columns?: 2 | 3;
  className?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    // min-w-0: fieldset não encolhe abaixo do conteúdo por padrão (estoura no mobile)
    <fieldset className={`grid min-w-0 gap-1.5 ${className}`} aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-fg-2">{label}</legend>
      <div className={`grid gap-2 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5 text-center text-sm leading-tight font-medium text-fg-2 transition-colors hover:text-fg has-[:checked]:border-current has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${o.checkedClass ?? "has-[:checked]:text-fg"}`}
          >
            <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="sr-only" />
            {o.icon}
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-err`} className="text-xs text-critical">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function CheckField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[var(--accent)]" />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-fg-3">{hint}</span>}
      </span>
    </label>
  );
}

/** Botão de excluir com confirmação nativa. */
export function DeleteButton({ onDelete, confirmText }: { onDelete: () => Promise<unknown>; confirmText: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(confirmText)) startTransition(async () => void (await onDelete()));
      }}
      className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-critical hover:bg-critical-soft disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
      Excluir
    </button>
  );
}
