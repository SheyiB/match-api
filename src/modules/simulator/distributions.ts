export const simulatorConfig = {
  tickIntervalMs: Number(process.env.TICK_INTERVAL_MS ?? 1000),
  minuteRatio: Number(process.env.MATCH_MINUTE_RATIO ?? 1),
  concurrentMatches: Number(process.env.CONCURRENT_MATCHES ?? 4),
  averageGoals: 2.5,
  averageYellowCards: 3.5,
  redCardChance: 0.08,
  minSubstitutionsPerTeam: 3,
  maxSubstitutionsPerTeam: 5,
};

export function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function poisson(lambda: number) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;

  do {
    count += 1;
    product *= Math.random();
  } while (product > limit);

  return count - 1;
}

export function pickOne<T>(items: T[]): T {
  return items[randInt(0, items.length - 1)];
}
