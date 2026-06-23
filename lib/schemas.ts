/**
 * Zod schemas for structured LLM outputs (Research Manager, Trader, Portfolio Manager).
 * Mirrors TradingAgents' Pydantic schemas: ResearchPlan, TraderProposal, PortfolioDecision.
 */

import { z } from 'zod';

export const RatingEnum = z.enum(['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell']);
export type Rating = z.infer<typeof RatingEnum>;

export const ResearchPlanSchema = z.object({
  recommendation: RatingEnum,
  rationale: z.string().describe('1-2 paragraph synthesis of bull vs bear arguments'),
  strategic_actions: z.string().describe('Concrete next steps the trader should consider'),
});

export const TraderProposalSchema = z.object({
  action: z.enum(['Buy', 'Hold', 'Sell']),
  reasoning: z.string(),
  entry_price: z.number().optional(),
  stop_loss: z.number().optional(),
  position_sizing: z.string().optional().describe('e.g., "5% of portfolio"'),
});

export const PortfolioDecisionSchema = z.object({
  rating: RatingEnum,
  executive_summary: z.string().describe('One-paragraph executive summary'),
  investment_thesis: z.string().describe('Detailed thesis grounding the rating'),
  user_position_guidance: z.string().optional().describe('Personalized guidance based on whether the requester already holds the stock and their average cost'),
  short_term_guidance: z.string().describe('Short-term guidance, normally 0-4 weeks'),
  medium_term_guidance: z.string().describe('Medium-term guidance, normally 1-3 months'),
  long_term_guidance: z.string().describe('Long-term guidance, normally 6-12 months'),
  price_target: z.number().optional(),
  time_horizon: z.string().optional().describe('e.g., "3 months", "6-12 months"'),
});

export const LessonSchema = z.object({
  run_id: z.string(),
  date: z.string(),
  ticker: z.string(),
  decision: RatingEnum,
  outcome_5d: z.string().optional(),
  outcome_20d: z.string().optional(),
  lesson: z.string(),
  severity: z.enum(['low', 'moderate', 'high']),
});

export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;
export type TraderProposal = z.infer<typeof TraderProposalSchema>;
export type PortfolioDecision = z.infer<typeof PortfolioDecisionSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
