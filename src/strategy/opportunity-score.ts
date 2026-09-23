import type { Confidence, ScoreBreakdown } from "@/shared/types";

export interface OpportunityInput {
  absolute: ScoreBreakdown;
  relativeStrength: number;
  liquidityQuality: number;
  triggerQuality: number;
  softRiskPenalty: number;
}

export interface OpportunityResult {
  absoluteScore: number;
  opportunityScore: number;
  confidence: Confidence;
}

const SCORE_MAX = 100;

function confidenceFrom(gap: number, absolute: number, penalty: number, trigger: number): Confidence {
  let points = 0;
  points += gap >= 5 ? 2 : gap >= 2 ? 1 : 0;
  points += absolute >= 80 ? 2 : absolute >= 65 ? 1 : 0;
  points += penalty <= 3 ? 1 : penalty <= 8 ? 0 : -2;
  points += trigger >= 70 ? 1 : trigger >= 45 ? 0 : -1;
  if (points >= 4) return "HIGH";
  if (points >= 1) return "MEDIUM";
  return "LOW";
}

export function opportunityScore(input: OpportunityInput): OpportunityResult {
  const grossAbsolute = input.absolute.total + input.absolute.penalty;
  const absoluteScore = Math.round(Math.min(SCORE_MAX, Math.max(0, grossAbsolute)) * 100) / 100;
  const raw =
    absoluteScore * 0.68 +
    input.relativeStrength * 0.18 +
    input.liquidityQuality * 0.08 +
    input.triggerQuality * 0.06 -
    input.softRiskPenalty * 0.4;
  const opportunityScore = Math.round(Math.min(SCORE_MAX, Math.max(0, raw)) * 100) / 100;

  return {
    absoluteScore,
    opportunityScore,
    confidence: confidenceFrom(0, absoluteScore, input.softRiskPenalty, input.triggerQuality),
  };
}

export function confidenceFromRanking(
  input: OpportunityInput,
  nextOpportunityScore: number | null,
): OpportunityResult {
  const result = opportunityScore(input);
  const gap = nextOpportunityScore === null ? 100 : result.opportunityScore - nextOpportunityScore;
  return {
    ...result,
    confidence: confidenceFrom(gap, result.absoluteScore, input.softRiskPenalty, input.triggerQuality),
  };
}
