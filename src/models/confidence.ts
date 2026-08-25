/**
 * Confidence scoring for static-analysis findings.
 *
 * Bands are caps, not guarantees. Static analysis cannot observe runtime
 * database state, production traffic, or values flowing through variables.
 *
 * | Band | Range | When to use |
 * |------|-------|-------------|
 * | confirmed-syntactic | 0.85–0.95 | The AST shows the anti-pattern directly (e.g. `new MongoClient()` inside `app.get`). |
 * | potential-strong | 0.65–0.80 | Strong structural evidence, but a benign interpretation remains possible (N+1). |
 * | potential-moderate | 0.50–0.64 | Heuristic with incomplete project knowledge (in-repo indexes vs Atlas). |
 * | potential-weak | 0.35–0.49 | Weak syntactic hint; prefer omitting the finding if unsure. |
 *
 * Rules:
 * - Never assign 1.0 except for purely factual, non-issue inventory (we do not emit those).
 * - `evidence.kind` must be `confirmed` only when the syntactic facts are unambiguous.
 *   Confidence can still be < 1 because impact is estimated.
 * - Prefer omitting a finding over emitting one below 0.35.
 * - Do not raise confidence because a pattern is "common"; raise it only with evidence.
 */
export const Confidence = {
  confirmedSyntactic: 0.9,
  confirmedStrong: 0.85,
  potentialStrong: 0.72,
  potentialModerate: 0.55,
  potentialWeak: 0.42,
} as const;

export function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
