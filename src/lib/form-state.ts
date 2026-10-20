// Helpers sem dependências, seguros para usar em Client Components.

/** Estado retornado pelas server actions de formulário (useActionState). */
export type FormState = {
  ok: boolean;
  /** Muda a cada sucesso, para o formulário saber que deve fechar/resetar. */
  nonce?: number;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export const initialFormState: FormState = { ok: false };

/** "1.234,56" | "1.000" | "1234,56" | "1234.56" | "R$ 12" -> centavos */
export function parseMoneyToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/R\$|\s/g, "");
  if (!s) return null;
  // Vírgula = decimal pt-BR; pontos sem vírgula em grupos de 3 = milhar ("1.000")
  if (s.includes(",") || /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** centavos -> "1234,56" (valor padrão de inputs) */
export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Date -> "AAAA-MM-DD" no fuso local */
export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
