/**
 * CPU manager AI — ported from the NFL Bruball draft-engine spec. Pure
 * valuation + sampling logic, no knowledge of draft state persistence, so
 * it's easy to unit test and reuse from the local practice-draft mode.
 */
import type { TeamValuation } from './valuation';

export type CpuStrategy = 'chalk' | 'scarcity' | 'blocker';

export interface CpuProfile {
  strategy: CpuStrategy;
  /** Softmax temperature — the difficulty slider. ~0.3 sharp, 1.0 competent, 2.0 chaotic. */
  tau: number;
  /** This manager's one recurring quirk: +2.5 points to this team, in their valuation only. */
  homerTeamId?: string;
}

export const TAU_PRESETS = {
  sharp: 0.3,
  competent: 1.0,
  chaotic: 2.0,
} as const;

export const STRATEGIES: CpuStrategy[] = ['chalk', 'scarcity', 'blocker'];

export function randomStrategy(rand: () => number = Math.random): CpuStrategy {
  return STRATEGIES[Math.floor(rand() * STRATEGIES.length)];
}

/** The homer bonus only ever applies inside this manager's own valuation. */
export function homerAdjustedPoints(team: TeamValuation, profile: CpuProfile): number {
  return team.points + (profile.homerTeamId === team.teamId ? 2.5 : 0);
}

/**
 * Score a candidate team under one of the three strategies.
 * `divisionMates` is every currently-available team in `team.division`
 * (including `team` itself); `isLegalForNextDrafter` is whether the next
 * pick in snake order could also legally take this team if left on the board.
 */
export function strategyScore(
  team: TeamValuation,
  profile: CpuProfile,
  divisionMates: TeamValuation[],
  isLegalForNextDrafter: boolean,
): number {
  const value = homerAdjustedPoints(team, profile);
  switch (profile.strategy) {
    case 'chalk':
      return value;
    case 'scarcity': {
      const values = divisionMates.map((t) => homerAdjustedPoints(t, profile));
      const min = Math.min(value, ...values);
      return value + 0.8 * (value - min);
    }
    case 'blocker':
      return isLegalForNextDrafter ? value * 1.5 : value;
    default:
      return value;
  }
}

export interface ScoredCandidate {
  teamId: string;
  value: number;
}

/**
 * Sample from a softmax over the manager's own scores rather than argmax'ing.
 * TAU=1.0 self-scales: a team 2 points below the top draws ~14% relative
 * weight, 5 points below draws under 1%.
 */
export function softmaxSample(
  candidates: ScoredCandidate[],
  tau: number,
  rand: () => number = Math.random,
): string {
  if (!candidates.length) {
    throw new Error('softmaxSample: no candidates');
  }
  const maxValue = Math.max(...candidates.map((c) => c.value));
  const weights = candidates.map((c) => Math.exp((c.value - maxValue) / tau));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i].teamId;
  }
  return candidates[candidates.length - 1].teamId;
}
