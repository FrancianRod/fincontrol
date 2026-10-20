import { z } from "zod";

import { parseMoneyToCents, type FormState } from "./form-state";

export * from "./form-state";

const money = (opts: { min?: number; label: string }) =>
  z.unknown().transform((v, ctx) => {
    const cents = parseMoneyToCents(v);
    if (cents == null) {
      ctx.addIssue({ code: "custom", message: `Informe ${opts.label} válido (ex.: 1.234,56)` });
      return z.NEVER;
    }
    if (opts.min != null && cents < opts.min) {
      ctx.addIssue({ code: "custom", message: opts.min > 0 ? "Deve ser maior que zero" : "Não pode ser negativo" });
      return z.NEVER;
    }
    return cents;
  });

/** Como money(), mas vazio vira null. */
const optionalMoney = (opts: { min?: number; label: string }) =>
  z
    .preprocess((v) => (v == null || (typeof v === "string" && !v.trim()) ? undefined : v), money(opts).optional())
    .transform((v) => v ?? null);

/** "AAAA-MM-DD" -> Date ao meio-dia local (evita pular de dia por fuso). */
const dateInput = z
  .string({ error: "Informe a data" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .transform((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  });

const text = (label: string, max = 80) =>
  z.string({ error: `Informe ${label}` }).trim().min(1, `Informe ${label}`).max(max, `Máximo de ${max} caracteres`);

const optionalText = (max = 80) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

// Checkbox desmarcado não vai no FormData: a chave precisa ser opcional.
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

export const incomeSchema = z.object({
  description: text("a descrição"),
  amountCents: money({ min: 1, label: "um valor" }),
  type: z.enum(["SALARY", "FREELANCE", "YIELD", "OTHER"], { error: "Tipo inválido" }),
  date: dateInput,
  received: checkbox,
});

export const expenseSchema = z.object({
  description: text("a descrição"),
  amountCents: money({ min: 1, label: "um valor" }),
  category: text("a categoria", 40),
  type: z.enum(["FIXED", "VARIABLE"], { error: "Tipo inválido" }),
  status: z.enum(["PAID", "PENDING"], { error: "Status inválido" }),
  dueDate: dateInput,
  essential: checkbox,
  /** Dia do filtro ("AAAA-MM-DD"): vira a data de pagamento ao marcar como paga. */
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Campo inteiro opcional vindo de input (vazio = undefined). */
const optionalInt = (label: string, min: number, max: number) =>
  z.preprocess(
    (v) => (v == null || (typeof v === "string" && !v.trim()) ? undefined : v),
    z.coerce
      .number({ error: `Informe ${label}` })
      .int(`${label} deve ser um número inteiro`)
      .min(min, `Mínimo ${min}`)
      .max(max, `Máximo ${max}`)
      .optional(),
  );

/**
 * Repetição da despesa: não repete, todo mês (sem fim, por N meses ou até um
 * mês/ano) ou parcelada (N parcelas, começando na parcela atual).
 */
export const expenseRepeatSchema = z
  .object({
    repeat: z.enum(["NONE", "CONTINUOUS", "INSTALLMENTS"]).default("NONE"),
    endMode: z.enum(["NEVER", "COUNT", "UNTIL"]).default("NEVER"),
    endCount: optionalInt("o número de meses", 1, 600),
    endMonth: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido").optional()),
    installments: optionalInt("o número de parcelas", 2, 600),
    currentInstallment: optionalInt("a parcela atual", 1, 600),
    /** Edição de uma despesa de série: só esta ou esta e as próximas. */
    scope: z.enum(["THIS", "FOLLOWING"]).default("FOLLOWING"),
  })
  .superRefine((v, ctx) => {
    if (v.repeat === "CONTINUOUS" && v.endMode === "COUNT" && v.endCount == null) {
      ctx.addIssue({ code: "custom", path: ["endCount"], message: "Informe por quantos meses" });
    }
    if (v.repeat === "CONTINUOUS" && v.endMode === "UNTIL" && !v.endMonth) {
      ctx.addIssue({ code: "custom", path: ["endMonth"], message: "Informe até qual mês" });
    }
    if (v.repeat === "INSTALLMENTS") {
      if (v.installments == null) ctx.addIssue({ code: "custom", path: ["installments"], message: "Informe o número de parcelas" });
      else if ((v.currentInstallment ?? 1) > v.installments) {
        ctx.addIssue({ code: "custom", path: ["currentInstallment"], message: "Maior que o total de parcelas" });
      }
    }
  });

export const investmentSchema = z.object({
  name: text("o nome"),
  assetType: z.enum(["STOCKS", "REITS", "FIXED_INCOME", "EMERGENCY_RESERVE"], { error: "Tipo inválido" }),
  institution: optionalText(),
  monthlyContributionCents: money({ min: 0, label: "um aporte" }),
});

const txType = z.enum(["APORTE", "RESGATE"], { error: "Selecione a operação" });

/**
 * Movimentação de investimento. O formulário sempre envia valor positivo e a
 * operação; "DESVALORIZACAO" vira RENDIMENTO com valor negativo no banco.
 */
export const investmentTxSchema = z
  .object({
    type: z.enum(["APORTE", "RESGATE", "RENDIMENTO", "DESVALORIZACAO"], { error: "Selecione a operação" }),
    amountCents: money({ min: 1, label: "um valor" }),
    date: dateInput,
    note: optionalText(120),
  })
  .transform(({ type, amountCents, ...rest }) =>
    type === "DESVALORIZACAO"
      ? { ...rest, type: "RENDIMENTO" as const, amountCents: -amountCents }
      : { ...rest, type, amountCents },
  );

/** Atualização de saldo: valor de mercado numa data (vira um rendimento pela diferença). */
export const balanceUpdateSchema = z.object({
  marketValueCents: money({ min: 0, label: "o saldo de mercado" }),
  date: dateInput,
  note: optionalText(120),
});

/** Movimentação opcional ao criar um investimento (valor vazio = nenhuma). */
export const initialInvestmentTxSchema = z.object({
  type: txType,
  amountCents: optionalMoney({ min: 1, label: "um valor" }),
  date: dateInput,
});

const intField = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `Informe ${label}` })
    .int(`${label} deve ser um número inteiro`)
    .min(min, `Mínimo ${min}`)
    .max(max, `Máximo ${max}`);

export const creditLetterSchema = z
  .object({
    name: text("o nome"),
    administrator: optionalText(),
    creditValueCents: money({ min: 1, label: "o valor da carta" }),
    correctedCreditCents: optionalMoney({ min: 1, label: "o crédito corrigido" }),
    paidCents: money({ min: 0, label: "o valor pago" }),
    outstandingCents: money({ min: 0, label: "o saldo devedor" }),
    installmentCents: money({ min: 1, label: "a parcela" }),
    totalInstallments: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .pipe(z.number().int("Número inteiro").min(1, "Mínimo 1").max(600, "Máximo 600").nullable()),
    paidInstallments: intField("parcelas pagas", 0, 600),
    dueDay: intField("o dia de vencimento", 1, 31),
    contemplated: checkbox,
  })
  .refine((v) => v.totalInstallments == null || v.paidInstallments <= v.totalInstallments, {
    path: ["paidInstallments"],
    message: "Não pode passar do total de parcelas",
  });

/** Mês/ano ao qual os valores do consórcio se referem ("AAAA-MM" -> 202610). */
export const periodSchema = z.object({
  period: z
    .string({ error: "Período inválido" })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido")
    .transform((s) => Number(s.replace("-", ""))),
});

// Vazio = sem limite (a projeção usa a média dos últimos 3 meses).
export const variableBudgetSchema = z.object({
  variableBudgetCents: optionalMoney({ min: 1, label: "um limite" }),
});

/** Valida um FormData contra um schema e devolve dados ou FormState de erro. */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { data: z.output<T>; error?: undefined } | { data?: undefined; error: FormState } {
  const raw = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$ACTION")));
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: { ok: false, message: "Corrija os campos destacados.", errors: z.flattenError(result.error).fieldErrors },
    };
  }
  return { data: result.data };
}
