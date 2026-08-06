/**
 * AsyncAPI 2.6.0 spec for the ProFootball real-time event API.
 * Served as JSON at /api/events-docs/spec and rendered by the
 * AsyncAPI React component at /api/events-docs.
 */
export const asyncApiSpec = {
  asyncapi: '2.6.0',
  info: {
    title: 'ProFootball Real-Time Events API',
    version: '0.1.0',
    description:
      'WebSocket (Socket.io) and SSE event reference for the ProFootball Match API.\n\n' +
      '## Transports\n\n' +
      '**Socket.io** — connect to the root namespace (`/`). All client↔server events listed below use Socket.io\'s event emitter pattern.\n\n' +
      '**SSE** — `GET /api/matches/:id/events/stream` opens a server-sent event stream for a single match. ' +
      'Pass `Last-Event-ID` to replay missed events on reconnect.\n\n' +
      '## Rooms\n\n' +
      'Two Socket.io rooms exist per match:\n' +
      '- `match:{id}` — score, event, stat, and status updates\n' +
      '- `chat:{id}` — chat messages, presence, typing indicators\n\n' +
      'Joining chat does **not** subscribe to match updates, and vice versa.',
  },
  servers: {
    production: {
      url: 'https://match-api-0oaf.onrender.com',
      protocol: 'socket.io',
      description: 'Production Socket.io server (Render free tier — may cold-start)',
    },
    local: {
      url: 'http://localhost:3000',
      protocol: 'socket.io',
      description: 'Local development server',
    },
  },
  channels: {
    // ── Client → Server ──────────────────────────────────────────────
    'match:subscribe': {
      description: 'Subscribe to live updates for a match. Joins the `match:{id}` Socket.io room.',
      publish: {
        operationId: 'matchSubscribe',
        summary: 'Subscribe to a match',
        message: { $ref: '#/components/messages/MatchSubscribe' },
      },
    },
    'match:unsubscribe': {
      description: 'Unsubscribe from a match. Leaves the `match:{id}` room.',
      publish: {
        operationId: 'matchUnsubscribe',
        summary: 'Unsubscribe from a match',
        message: { $ref: '#/components/messages/MatchUnsubscribe' },
      },
    },
    'chat:join': {
      description:
        'Join a match chat room. Duplicate tabs from the same userId are ref-counted; ' +
        'only the first tab triggers a `chat:user_joined` broadcast.',
      publish: {
        operationId: 'chatJoin',
        summary: 'Join chat',
        message: { $ref: '#/components/messages/ChatJoin' },
      },
    },
    'chat:leave': {
      description:
        'Leave a match chat room. Only the last tab closing triggers `chat:user_left`.',
      publish: {
        operationId: 'chatLeave',
        summary: 'Leave chat',
        message: { $ref: '#/components/messages/ChatLeave' },
      },
    },
    'chat:message': {
      description:
        'Send a chat message. Requires a prior `chat:join` for this match. ' +
        'Rate-limited per user (default 5 messages / 10 seconds).',
      publish: {
        operationId: 'chatMessageSend',
        summary: 'Send a chat message',
        message: { $ref: '#/components/messages/ChatMessageSend' },
      },
    },
    'chat:typing:start': {
      description:
        'Signal that the user started typing. Sets a 4s TTL key in Redis; ' +
        'if the client disconnects mid-type, the indicator expires automatically.',
      publish: {
        operationId: 'chatTypingStart',
        summary: 'Start typing indicator',
        message: { $ref: '#/components/messages/ChatTypingPayload' },
      },
    },
    'chat:typing:stop': {
      description: 'Signal that the user stopped typing.',
      publish: {
        operationId: 'chatTypingStop',
        summary: 'Stop typing indicator',
        message: { $ref: '#/components/messages/ChatTypingPayload' },
      },
    },
    ping: {
      description: 'App-level ping for client-side liveness checks (in addition to Socket.io\'s built-in ping/pong).',
      publish: {
        operationId: 'ping',
        summary: 'Ping',
        message: { $ref: '#/components/messages/Ping' },
      },
    },

    // ── Server → Client ──────────────────────────────────────────────
    'match:event': {
      description: 'A match event occurred (goal, card, foul, etc.).',
      subscribe: {
        operationId: 'matchEvent',
        summary: 'Match event',
        message: { $ref: '#/components/messages/MatchEvent' },
      },
    },
    'match:score_update': {
      description: 'Emitted alongside `match:event` when a GOAL occurs.',
      subscribe: {
        operationId: 'matchScoreUpdate',
        summary: 'Score update',
        message: { $ref: '#/components/messages/MatchScoreUpdate' },
      },
    },
    'match:stats_update': {
      description: 'Updated match statistics (possession, shots, fouls, etc.).',
      subscribe: {
        operationId: 'matchStatsUpdate',
        summary: 'Stats update',
        message: { $ref: '#/components/messages/MatchStatsUpdate' },
      },
    },
    'match:status_change': {
      description: 'Match status changed (KICKOFF, HALF_TIME_WHISTLE, SECOND_HALF_KICKOFF, FULL_TIME_WHISTLE).',
      subscribe: {
        operationId: 'matchStatusChange',
        summary: 'Status change',
        message: { $ref: '#/components/messages/MatchStatusChange' },
      },
    },
    'chat:user_joined': {
      description: 'A new user joined the chat room (first tab only).',
      subscribe: {
        operationId: 'chatUserJoined',
        summary: 'User joined chat',
        message: { $ref: '#/components/messages/ChatPresenceChange' },
      },
    },
    'chat:user_left': {
      description: 'A user left the chat room (last tab closed).',
      subscribe: {
        operationId: 'chatUserLeft',
        summary: 'User left chat',
        message: { $ref: '#/components/messages/ChatPresenceChange' },
      },
    },
    'chat:message_received': {
      description: 'A chat message was broadcast to the room.',
      subscribe: {
        operationId: 'chatMessageReceived',
        summary: 'Chat message received',
        message: { $ref: '#/components/messages/ChatMessageReceived' },
      },
    },
    'chat:typing': {
      description: 'Typing indicator update for a user.',
      subscribe: {
        operationId: 'chatTyping',
        summary: 'Typing indicator',
        message: { $ref: '#/components/messages/ChatTypingIndicator' },
      },
    },
    pong: {
      description: 'Response to a client `ping`.',
      subscribe: {
        operationId: 'pong',
        summary: 'Pong',
        message: { $ref: '#/components/messages/Pong' },
      },
    },
    error: {
      description:
        'Error envelope sent when a client event fails validation or ' +
        'business rules (e.g. rate limiting, not subscribed).',
      subscribe: {
        operationId: 'error',
        summary: 'Error',
        message: { $ref: '#/components/messages/Error' },
      },
    },
  },
  components: {
    messages: {
      // ── Client payloads ────────────────────────────────────────────
      MatchSubscribe: {
        name: 'match:subscribe',
        title: 'Match Subscribe',
        payload: {
          type: 'object',
          required: ['matchId'],
          properties: {
            matchId: { type: 'string', format: 'uuid', description: 'Match ID to subscribe to' },
          },
        },
      },
      MatchUnsubscribe: {
        name: 'match:unsubscribe',
        title: 'Match Unsubscribe',
        payload: {
          type: 'object',
          required: ['matchId'],
          properties: {
            matchId: { type: 'string', format: 'uuid' },
          },
        },
      },
      ChatJoin: {
        name: 'chat:join',
        title: 'Chat Join',
        payload: {
          type: 'object',
          required: ['matchId', 'userId', 'username'],
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', description: 'Self-assigned user identifier' },
            username: { type: 'string', maxLength: 60, description: 'Display name' },
          },
        },
      },
      ChatLeave: {
        name: 'chat:leave',
        title: 'Chat Leave',
        payload: {
          type: 'object',
          required: ['matchId'],
          properties: {
            matchId: { type: 'string', format: 'uuid' },
          },
        },
      },
      ChatMessageSend: {
        name: 'chat:message',
        title: 'Chat Message (send)',
        payload: {
          type: 'object',
          required: ['matchId', 'text'],
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            text: { type: 'string', description: 'Message text (max length from CHAT_MAX_MESSAGE_LENGTH env)' },
          },
        },
      },
      ChatTypingPayload: {
        name: 'chat:typing:start / chat:typing:stop',
        title: 'Typing Start / Stop',
        payload: {
          type: 'object',
          required: ['matchId'],
          properties: {
            matchId: { type: 'string', format: 'uuid' },
          },
        },
      },
      Ping: {
        name: 'ping',
        title: 'Ping',
        payload: {
          type: 'object',
          properties: {},
          description: 'Empty payload',
        },
      },

      // ── Server payloads ────────────────────────────────────────────
      MatchEvent: {
        name: 'match:event',
        title: 'Match Event',
        payload: {
          type: 'object',
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            event: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                type: {
                  type: 'string',
                  enum: [
                    'GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION',
                    'FOUL', 'SHOT', 'KICKOFF', 'HALF_TIME_WHISTLE',
                    'SECOND_HALF_KICKOFF', 'FULL_TIME_WHISTLE',
                  ],
                },
                minute: { type: 'integer' },
                teamId: { type: 'string', format: 'uuid', nullable: true },
                playerName: { type: 'string', nullable: true },
                detail: { type: 'object', nullable: true },
              },
            },
          },
        },
      },
      MatchScoreUpdate: {
        name: 'match:score_update',
        title: 'Score Update',
        payload: {
          type: 'object',
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            homeScore: { type: 'integer' },
            awayScore: { type: 'integer' },
            minute: { type: 'integer' },
          },
        },
      },
      MatchStatsUpdate: {
        name: 'match:stats_update',
        title: 'Stats Update',
        payload: {
          type: 'object',
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            stats: {
              type: 'object',
              properties: {
                possessionHome: { type: 'integer' },
                possessionAway: { type: 'integer' },
                shotsHome: { type: 'integer' },
                shotsAway: { type: 'integer' },
                shotsOnTargetHome: { type: 'integer' },
                shotsOnTargetAway: { type: 'integer' },
                cornersHome: { type: 'integer' },
                cornersAway: { type: 'integer' },
                foulsHome: { type: 'integer' },
                foulsAway: { type: 'integer' },
              },
            },
          },
        },
      },
      MatchStatusChange: {
        name: 'match:status_change',
        title: 'Status Change',
        payload: {
          type: 'object',
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            status: {
              type: 'string',
              enum: ['NOT_STARTED', 'FIRST_HALF', 'HALF_TIME', 'SECOND_HALF', 'FULL_TIME'],
            },
            minute: { type: 'integer' },
          },
        },
      },
      ChatPresenceChange: {
        name: 'chat:user_joined / chat:user_left',
        title: 'Chat Presence Change',
        payload: {
          type: 'object',
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            username: { type: 'string' },
            userCount: { type: 'integer', description: 'Total unique users now in the room' },
          },
        },
      },
      ChatMessageReceived: {
        name: 'chat:message',
        title: 'Chat Message (received)',
        payload: {
          type: 'object',
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            message: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                userId: { type: 'string' },
                username: { type: 'string' },
                text: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      ChatTypingIndicator: {
        name: 'chat:typing',
        title: 'Typing Indicator',
        payload: {
          type: 'object',
          properties: {
            matchId: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            isTyping: { type: 'boolean' },
          },
        },
      },
      Pong: {
        name: 'pong',
        title: 'Pong',
        payload: {
          type: 'object',
          properties: {
            ts: { type: 'integer', description: 'Server timestamp in milliseconds' },
          },
        },
      },
      Error: {
        name: 'error',
        title: 'Error Envelope',
        payload: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              enum: [
                'MATCH_NOT_FOUND', 'INVALID_PAYLOAD', 'NOT_SUBSCRIBED',
                'RATE_LIMITED', 'MESSAGE_TOO_LONG', 'EMPTY_MESSAGE', 'INTERNAL_ERROR',
              ],
            },
            message: { type: 'string' },
            context: {
              type: 'array',
              nullable: true,
              description: 'Validation error details (when code is INVALID_PAYLOAD)',
              items: {
                type: 'object',
                properties: {
                  property: { type: 'string' },
                  constraints: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
  },
};
