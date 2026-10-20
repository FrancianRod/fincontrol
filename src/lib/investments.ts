// Regras puras das movimentações de investimento (sem acesso ao banco).
// Valores em centavos. APORTE/RESGATE: valor positivo, o tipo define o sinal.
// RENDIMENTO: valor com sinal (positivo = ganho, negativo = desvalorização).

export type InvestmentTxKind = "APORTE" | "RESGATE" | "RENDIMENTO";

export interface InvestmentTx {
  type: InvestmentTxKind;
  amountCents: number;
  date: Date;
}

export const txKindLabels: Record<InvestmentTxKind, string> = {
  APORTE: "Entrada / Aporte (+)",
  RESGATE: "Saída / Resgate (−)",
  RENDIMENTO: "Rendimento (±)",
};

export const signed = (tx: Pick<InvestmentTx, "type" | "amountCents">) =>
  tx.type === "RESGATE" ? -tx.amountCents : tx.amountCents;

/** Rendimento necessário para o saldo na data virar o valor de mercado informado. */
export function yieldToReach(marketValueCents: number, txs: InvestmentTx[], date: Date): number {
  return marketValueCents - balanceAt(txs, date);
}

/** Soma dos rendimentos com data entre `from` e `until` (inclusive). */
export function yieldBetween(txs: InvestmentTx[], from: Date, until: Date): number {
  return txs.reduce((acc, tx) => (tx.type === "RENDIMENTO" && tx.date >= from && tx.date <= until ? acc + tx.amountCents : acc), 0);
}

/** Saldo considerando só as movimentações até `until` (inclusive). */
export function balanceAt(txs: InvestmentTx[], until: Date): number {
  return txs.reduce((acc, tx) => (tx.date <= until ? acc + signed(tx) : acc), 0);
}

export function totalBalance(txs: Pick<InvestmentTx, "type" | "amountCents">[]): number {
  return txs.reduce((acc, tx) => acc + signed(tx), 0);
}

/**
 * Em ordem cronológica, o saldo nunca pode ficar negativo (resgate ou
 * desvalorização maior que o disponível naquela data). Devolve a primeira
 * movimentação que estoura.
 */
export function firstOverdraft<T extends InvestmentTx>(txs: T[]): { tx: T; balanceBefore: number } | null {
  // No mesmo instante, entradas antes de saídas.
  const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime() || signed(b) - signed(a));
  let balance = 0;
  for (const tx of sorted) {
    const next = balance + signed(tx);
    if (next < 0) return { tx, balanceBefore: balance };
    balance = next;
  }
  return null;
}

/** Histórico em ordem cronológica com o saldo após cada movimentação. */
export function withRunningBalance<T extends InvestmentTx>(txs: T[]): (T & { balanceAfter: number })[] {
  let balance = 0;
  return [...txs]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((tx) => {
      balance += signed(tx);
      return { ...tx, balanceAfter: balance };
    });
}
