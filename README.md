# ProFootball Real-Time Match API

Backend implementation for the ProFootball take-home assessment: REST match
data, Socket.io room-based live updates, SSE match event streams,
Prisma/Supabase Postgres persistence, Redis hot state/pub-sub, chat presence,
rate limiting, and a background match simulator.

## Stack Choices

- Node.js 20+, TypeScript, NestJS
- Socket.io via `@nestjs/websockets`
- SSE via Nest `@Sse()`
- Prisma with Postgres
- Redis via `ioredis`
- Swagger at `/api/docs`

The brief allows Node.js or Bun and leaves the real-time approach open. I chose
NestJS because validation pipes, exception filters, modules, and gateways map
cleanly to the assessment requirements. I chose Socket.io for bidirectional
match/chat interactions because it provides rooms, reconnect behavior, ping/pong,
and acknowledgements with less custom infrastructure than raw WebSockets.

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

## Deployment

This repository includes a `render.yaml` blueprint for Render.

Recommended production services:

- Render Web Service for the API
- Supabase Postgres for `DATABASE_URL`
- Upstash Redis or Render Redis for `REDIS_URL`

Render settings if configuring manually:

```text
Build Command: npm install && npm run build
Start Command: npm run start:prod
Health Check Path: /health
```

Required environment variables:

```text
DATABASE_URL=
REDIS_URL=
CORS_ORIGIN=*
TICK_INTERVAL_MS=1000
MATCH_MINUTE_RATIO=1
CONCURRENT_MATCHES=4
CHAT_MAX_MESSAGE_LENGTH=500
CHAT_RATE_LIMIT_MAX=5
CHAT_RATE_LIMIT_WINDOW_SEC=10
```

Before the first deploy, point `DATABASE_URL` at the Supabase database and run:

```bash
npx prisma db push
npm run prisma:seed
```

Render free instances can spin down when idle, which can affect automated
testing and live connections. For assessment submission, an always-on paid
instance is safer.

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

Event flow:

```text
SimulatorService
  -> EventsService.recordAndBroadcast()
  -> Postgres match_events
  -> Redis match:{id}:state
  -> Redis match:{id}:events pub/sub
  -> Socket.io rooms and SSE streams
```

This prevents REST, WebSocket, SSE, Redis, and Postgres from drifting apart.

Redis stores only ephemeral state:

- `match:{matchId}:state`
- `match:{matchId}:events`
- `chat:{matchId}:presence`
- `chat:{matchId}:users`
- `chat:{matchId}:ratelimit:{userId}`
- `chat:{matchId}:typing:{userId}`

Socket subscriptions are not persisted. Socket.io room membership is the source
of truth for live subscriptions.

## Assessment Coverage

- REST match list/detail with validation, 404s, CORS, and consistent response
  envelopes.
- Real-time match subscriptions with room-based delivery.
- Chat rooms with join/leave, active user tracking, duplicate-tab handling,
  typing indicators, validation, and per-user rate limiting.
- SSE match event stream with reconnect replay using `Last-Event-ID`.
- Background simulator for 3-5 concurrent matches with configurable clock speed
  and realistic event distribution.
- Graceful WebSocket error handling through an error envelope instead of dropped
  connections.

## Known Limitations

- No authentication; chat users self-identify with `userId` and `username`.
- Single Node process; Redis pub/sub keeps generation and delivery decoupled,
  but a multi-instance deployment should move the simulator to one worker or add
  leader election, and should add `@socket.io/redis-adapter` for cross-instance
  room delivery.
- Redis hot state is not durable. Postgres remains the durable event history.
- WebSocket reconnect replay is not implemented; clients should refresh REST
  match detail after reconnecting.
- Typing stop on abrupt disconnect relies on the 4 second Redis TTL expiring on
  the client side instead of Redis keyspace notifications.
- Chat rate limiting uses a fixed counter window.
- No load testing has been performed.
