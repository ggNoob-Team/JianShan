import { z } from "zod";

export const TeamMetricBucketSchema = z.object({
  key: z.string(),
  label: z.string(),
  seconds: z.number(),
  share: z.number(),
});

export const TeamHeatmapDaySchema = z.object({
  date: z.string(),
  slots: z.array(z.number()),
});

export const TeamMemberInsightsSchema = z.object({
  id: z.string(),
  name: z.string(),
  seconds: z.number(),
  sessions: z.number(),
  projects: z.array(TeamMetricBucketSchema),
  timeComponents: z.array(TeamMetricBucketSchema),
  sessionDistribution: z.array(TeamMetricBucketSchema),
  questionCount: z.number(),
  acceptedQuestionCount: z.number(),
  completedTurns: z.number(),
  tokenDataAvailable: z.boolean(),
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  totalCostUsd: z.number(),
  lastActiveAt: z.string().nullable(),
  heatmap: z.array(TeamHeatmapDaySchema),
});

export const TeamInsightsSummarySchema = z.object({
  totalSeconds: z.number(),
  sessions: z.number(),
  questions: z.number(),
  completedTurns: z.number(),
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  totalCostUsd: z.number(),
});

export const TeamInsightsSchema = z.object({
  generatedAt: z.string(),
  start: z.string(),
  end: z.string(),
  timeZone: z.string(),
  members: z.array(TeamMemberInsightsSchema),
  unassigned: TeamMemberInsightsSchema,
  summary: TeamInsightsSummarySchema,
});

export type TeamMetricBucket = z.infer<typeof TeamMetricBucketSchema>;
export type TeamHeatmapDay = z.infer<typeof TeamHeatmapDaySchema>;
export type TeamMemberInsights = z.infer<typeof TeamMemberInsightsSchema>;
export type TeamInsightsSummary = z.infer<typeof TeamInsightsSummarySchema>;
export type TeamInsights = z.infer<typeof TeamInsightsSchema>;
