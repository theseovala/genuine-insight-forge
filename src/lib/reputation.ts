// Reputation score algorithm — derived from real stored reviews.
// Score 0-100, weighted across rating quality, sentiment balance,
// review volume confidence and responsiveness.
import type { Review } from "@/lib/mock-data";

export const SCORE_WEIGHTS = {
  rating: 0.5,
  sentiment: 0.25,
  volume: 0.15,
  responsiveness: 0.1,
} as const;

// Reviews older than this contribute less to the score.
const RECENCY_HALF_LIFE_DAYS = 90;
const VOLUME_TARGET = 250;

export interface ScoreDriver {
  key: keyof typeof SCORE_WEIGHTS;
  label: string;
  value: number; // 0-100 sub-score
  weight: number;
  detail: string;
}

export interface ReputationSummary {
  score: number;
  band: "Excellent" | "Strong" | "Fair" | "At risk";
  headline: string;
  total: number;
  avgRating: number;
  sentiment: { positive: number; neutral: number; negative: number };
  sentimentCounts: { positive: number; neutral: number; negative: number };
  responseRate: number;
  unanswered: number;
  distribution: { stars: number; count: number }[];
  drivers: ScoreDriver[];
}

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));

function ageWeight(review: Review & { external_created_at?: string }): number {
  const iso = review.external_created_at;
  if (!iso) return 1;
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS);
}

export function computeReputation(
  reviews: (Review & { external_created_at?: string })[],
): ReputationSummary {
  const total = reviews.length;
  const empty: ReputationSummary = {
    score: 0,
    band: "Fair",
    headline: "No reviews yet",
    total: 0,
    avgRating: 0,
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
    responseRate: 0,
    unanswered: 0,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })),
    drivers: [],
  };
  if (total === 0) return empty;

  let weightSum = 0;
  let ratingWeighted = 0;
  const counts = { positive: 0, neutral: 0, negative: 0 };
  const sentimentWeighted = { positive: 0, neutral: 0, negative: 0 };
  const dist = new Map<number, number>([5, 4, 3, 2, 1].map((s) => [s, 0]));
  let replied = 0;

  for (const r of reviews) {
    const w = ageWeight(r);
    weightSum += w;
    ratingWeighted += r.rating * w;
    counts[r.sentiment] += 1;
    sentimentWeighted[r.sentiment] += w;
    dist.set(r.rating, (dist.get(r.rating) ?? 0) + 1);
    if (r.status === "replied" || r.reply) replied += 1;
  }

  const avgRating = ratingWeighted / weightSum;
  const posShare = (sentimentWeighted.positive / weightSum) * 100;
  const negShare = (sentimentWeighted.negative / weightSum) * 100;

  // Sub-scores, each normalised to 0-100.
  const ratingScore = clamp(((avgRating - 1) / 4) * 100);
  const sentimentScore = clamp((posShare - negShare + 100) / 2);
  const volumeScore = clamp((Math.log10(1 + total) / Math.log10(1 + VOLUME_TARGET)) * 100);
  const responseRate = (replied / total) * 100;
  const responsivenessScore = clamp(responseRate);

  const score = Math.round(
    ratingScore * SCORE_WEIGHTS.rating +
      sentimentScore * SCORE_WEIGHTS.sentiment +
      volumeScore * SCORE_WEIGHTS.volume +
      responsivenessScore * SCORE_WEIGHTS.responsiveness,
  );

  const band: ReputationSummary["band"] =
    score >= 85 ? "Excellent" : score >= 70 ? "Strong" : score >= 55 ? "Fair" : "At risk";

  const pct = (n: number) => Math.round((n / total) * 100);

  return {
    score,
    band,
    headline:
      band === "At risk"
        ? "Needs immediate attention"
        : band === "Fair"
          ? "Stable, with clear gaps"
          : band === "Strong"
            ? "Strong and healthy"
            : "Excellent standing",
    total,
    avgRating: Math.round(avgRating * 10) / 10,
    sentiment: {
      positive: pct(counts.positive),
      neutral: pct(counts.neutral),
      negative: pct(counts.negative),
    },
    sentimentCounts: counts,
    responseRate: Math.round(responseRate),
    unanswered: total - replied,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: dist.get(stars) ?? 0 })),
    drivers: [
      {
        key: "rating",
        label: "Rating quality",
        value: Math.round(ratingScore),
        weight: SCORE_WEIGHTS.rating,
        detail: `${(Math.round(avgRating * 10) / 10).toFixed(1)}★ recency-weighted average`,
      },
      {
        key: "sentiment",
        label: "Sentiment balance",
        value: Math.round(sentimentScore),
        weight: SCORE_WEIGHTS.sentiment,
        detail: `${Math.round(posShare)}% positive vs ${Math.round(negShare)}% negative`,
      },
      {
        key: "volume",
        label: "Review volume",
        value: Math.round(volumeScore),
        weight: SCORE_WEIGHTS.volume,
        detail: `${total} reviews tracked`,
      },
      {
        key: "responsiveness",
        label: "Responsiveness",
        value: Math.round(responsivenessScore),
        weight: SCORE_WEIGHTS.responsiveness,
        detail: `${Math.round(responseRate)}% of reviews answered`,
      },
    ],
  };
}
