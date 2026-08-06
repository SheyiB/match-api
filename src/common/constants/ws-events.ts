export const wsEvents = {
  client: {
    matchSubscribe: 'match:subscribe',
    matchUnsubscribe: 'match:unsubscribe',
    chatJoin: 'chat:join',
    chatLeave: 'chat:leave',
    chatMessage: 'chat:message',
    chatTypingStart: 'chat:typing:start',
    chatTypingStop: 'chat:typing:stop',
    ping: 'ping',
  },
  server: {
    matchScoreUpdate: 'match:score_update',
    matchEvent: 'match:event',
    matchStatsUpdate: 'match:stats_update',
    matchStatusChange: 'match:status_change',
    chatMessage: 'chat:message',
    chatUserJoined: 'chat:user_joined',
    chatUserLeft: 'chat:user_left',
    chatTyping: 'chat:typing',
    pong: 'pong',
    error: 'error',
  },
} as const;
