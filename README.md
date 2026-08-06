# ProFootball Real-Time Match API

NestJS implementation of the take-home spec: REST match data, Socket.io rooms,
SSE match streams, Prisma/Postgres persistence, Redis hot state/pub-sub, chat
presence, rate limiting, and a background simulator.

## Stack

- Node.js 20+, TypeScript, NestJS
- Socket.io via `@nestjs/websockets`
- SSE via Nest `@Sse()`
- Prisma with Postgres
- Redis via `ioredis`
- Swagger at `/api/docs`

## Setup

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npm run prisma:seed
npm run start:dev
```

The API listens on `PORT`, defaulting to `3000`.

## REST

- `GET /health`
- `GET /api/matches`
- `GET /api/matches/:id`
- `GET /api/matches/:id/chat/presence`
- `GET /api/docs`

REST responses use the global envelope:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{ "success": false, "error": { "code": "MATCH_NOT_FOUND", "message": "..." } }
```

## WebSocket Events

Client to server:

```text
match:subscribe        { matchId }
match:unsubscribe      { matchId }
chat:join              { matchId, userId, username }
chat:leave             { matchId }
chat:message           { matchId, text }
chat:typing:start      { matchId }
chat:typing:stop       { matchId }
ping                   {}
```

Server to client:

```text
match:score_update
match:event
match:stats_update
match:status_change
chat:message
chat:user_joined
chat:user_left
chat:typing
pong
error
```

Two rooms are used per match:

- `match:{id}` for score, event, stat, and status updates
- `chat:{id}` for chat messages, presence, and typing

Joining chat does not subscribe a client to match updates, and subscribing to a
match does not join chat.

## SSE

`GET /api/matches/:id/events/stream` streams match events with event IDs:

```text
event: match_event
id: <match_event_id>
data: {"matchId":"...","type":"GOAL","minute":54}
```

When `Last-Event-ID` is present, missed events for the same match are replayed
from Postgres before the live Redis stream resumes. The controller tears down
its dedicated Redis subscription when the HTTP request closes. Heartbeats are
emitted as lightweight `heartbeat` SSE events every 15 seconds.

## Simulator

The simulator starts on module init and runs one global interval. It selects
`CONCURRENT_MATCHES` non-finished matches, advances their clocks by
`MATCH_MINUTE_RATIO` per `TICK_INTERVAL_MS`, and drives the lifecycle:

`NOT_STARTED -> FIRST_HALF -> HALF_TIME -> SECOND_HALF -> FULL_TIME`

Goals, cards, and substitutions are pre-generated at kickoff. Fouls and shots
are rescheduled live after each occurrence so the pacing feels less mechanical.
Lifecycle events also go through `EventsService.recordAndBroadcast()`.

## Architecture Notes

`EventsService.recordAndBroadcast()` is the single writer for durable match
events, match hot state, and Redis match pub/sub. The simulator produces events,
but it does not know whether Socket.io, SSE, both, or neither are listening.

Redis stores only ephemeral state:

- `match:{matchId}:state`
- `match:{matchId}:events`
- `chat:{matchId}:presence`
- `chat:{matchId}:users`
- `chat:{matchId}:ratelimit:{userId}`
- `chat:{matchId}:typing:{userId}`

Socket subscriptions are not persisted. Socket.io room membership is the source
of truth for live subscriptions.

## Known Limitations

- No authentication; chat users self-identify with `userId` and `username`.
- Single Node process; Redis pub/sub keeps generation and delivery decoupled,
  but a multi-instance deployment should add `@socket.io/redis-adapter`.
- Redis hot state is not durable. Postgres remains the durable event history.
- WebSocket reconnect replay is not implemented; clients should refresh REST
  match detail after reconnecting.
- Typing stop on abrupt disconnect relies on the 4 second Redis TTL expiring on
  the client side instead of Redis keyspace notifications.
- Chat rate limiting uses a fixed counter window.
- No load testing has been performed.
