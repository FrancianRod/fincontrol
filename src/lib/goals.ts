// Metas financeiras (regras puras). Todas derivam da renda-base mensal.
// Valores em centavos.

/** Renda-base usada nas metas: R$ 4.000,00/mês. */
export const BASE_INCOME_CENTS = 400_000;

export const GOALS = {
  /** Independência financeira: 93 × a renda-base. */
  independenceMultiplier: 93,
  /** Reserva de emergência: 6 meses da renda-base. */
  emergencyMonths: 6,
  /** Distribuição 50/30/20 da renda-base. */
  split: { fixed: 0.5, lifestyle: 0.3, invest: 0.2 },
} as const;

export const independenceTargetCents = () => BASE_INCOME_CENTS * GOALS.independenceMultiplier; // R$ 372.000
export const emergencyTargetCents = () => BASE_INCOME_CENTS * GOALS.emergencyMonths; // R$ 24.000

export type GoalStatus = "done" | "progress" | "over";

export interface GoalProgress {
  currentCents: number;
  targetCents: number;
  /** 0..1 (pode passar de 1) */
  ratio: number;
  /** Quanto falta para a meta (0 se atingida) */
  remainingCents: number;
  status: GoalStatus;
}

/** Meta de acumular (quanto mais, melhor): atingida quando atual ≥ alvo. */
export function accumulateGoal(currentCents: number, targetCents: number): GoalProgress {
  const ratio = targetCents > 0 ? currentCents / targetCents : 0;
  return {
    currentCents,
    targetCents,
    ratio,
    remainingCents: Math.max(targetCents - currentCents, 0),
    status: currentCents >= targetCents ? "done" : "progress",
  };
}

/** Teto mensal (quanto menos, melhor): ok enquanto atual ≤ teto. */
export function ceilingGoal(currentCents: number, ceilingCents: number): GoalProgress {
  const ratio = ceilingCents > 0 ? currentCents / ceilingCents : 0;
  return {
    currentCents,
    targetCents: ceilingCents,
    ratio,
    remainingCents: Math.max(ceilingCents - currentCents, 0),
    status: currentCents > ceilingCents ? "over" : "done",
  };
}

export const splitTargets = () => ({
  fixedCeilingCents: Math.round(BASE_INCOME_CENTS * GOALS.split.fixed), // R$ 2.000
  lifestyleCeilingCents: Math.round(BASE_INCOME_CENTS * GOALS.split.lifestyle), // R$ 1.200
  investGoalCents: Math.round(BASE_INCOME_CENTS * GOALS.split.invest), // R$ 800
});

/** Meses para chegar ao alvo aportando `monthlyCents` por mês (sem rendimento). */
export function monthsToReach(remainingCents: number, monthlyCents: number): number | null {
  if (remainingCents <= 0) return 0;
  if (monthlyCents <= 0) return null;
  return Math.ceil(remainingCents / monthlyCents);
}
