export const assetTypeLabels = {
  EMERGENCY_RESERVE: "Reserva de emergência",
  FIXED_INCOME: "Renda fixa",
  STOCKS: "Ações",
  REITS: "FIIs",
} as const;

export type AssetTypeKey = keyof typeof assetTypeLabels;

/** Ordem fixa: define também a cor (série 1..4) de cada tipo. */
export const assetTypeOrder: AssetTypeKey[] = ["EMERGENCY_RESERVE", "FIXED_INCOME", "STOCKS", "REITS"];

export const assetTypeColor = (t: AssetTypeKey) => `var(--series-${assetTypeOrder.indexOf(t) + 1})`;
