export type DifficultyAction = {
  difficultyScore?: number;
  totalTokens?: number;
};

const DEFAULT_TOKEN_THRESHOLD = 4000;

export function getUserTokenThreshold(): number {
  return Number(process.env.USER_TOKEN_THRESHOLD) || DEFAULT_TOKEN_THRESHOLD;
}

/** Average per-action difficulty score for a completed test session. */
export function computeDifficultyPercent(actions: DifficultyAction[]): number {
  const count = actions.length || 1;
  const threshold = getUserTokenThreshold();

  const avg =
    actions.reduce((sum, action) => {
      if (action.difficultyScore != null) return sum + action.difficultyScore;
      if (action.totalTokens != null) {
        return sum + (action.totalTokens / threshold) * 100;
      }
      return sum;
    }, 0) / count;

  return Math.min(999, Math.max(0, avg));
}
