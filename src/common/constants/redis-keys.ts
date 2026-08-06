export const redisKeys = {
  matchState: (matchId: string) => `match:${matchId}:state`,
  matchEvents: (matchId: string) => `match:${matchId}:events`,
  chatPresence: (matchId: string) => `chat:${matchId}:presence`,
  chatUsers: (matchId: string) => `chat:${matchId}:users`,
  chatRateLimit: (matchId: string, userId: string) =>
    `chat:${matchId}:ratelimit:${userId}`,
  chatTyping: (matchId: string, userId: string) =>
    `chat:${matchId}:typing:${userId}`,
};

export const roomNames = {
  match: (matchId: string) => `match:${matchId}`,
  chat: (matchId: string) => `chat:${matchId}`,
};
