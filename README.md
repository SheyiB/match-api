# ProFootball Real-Time Match API

**Live API:** https://match-api-0oaf.onrender.com — interactive Swagger docs
at [`/api/docs`](https://match-api-0oaf.onrender.com/api/docs), WebSocket &
SSE event reference at
[`/api/events-docs`](https://match-api-0oaf.onrender.com/api/events-docs).

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
- Swagger (REST) at `/api/docs`
- AsyncAPI (WebSocket & SSE events) at `/api/events-docs`

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
testing and live connections — the live URL above is currently running on
Render's **free** tier, so the first request after a period of inactivity can
take up to a minute to respond. `render.yaml` sets `plan: starter` for anyone
who wants to deploy their own always-on instance instead.

## REST

- `GET /health`
- `GET /api/matches`
- `GET /api/matches/:id`
- `GET /api/matches/:id/chat/presence`
- `GET /api/docs` — interactive REST documentation (Swagger)
- `GET /api/events-docs` — interactive WebSocket & SSE event reference (AsyncAPI)
- `GET /api/events-docs/spec` — raw AsyncAPI JSON spec

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

## Action Flows

The event list above shows what gets emitted; this shows what actually
happens end-to-end for each action. Every WebSocket action follows the same
shape: validate the payload, apply the change, then (sometimes) broadcast.

**Subscribe to a match** — `match:subscribe`

```text
client emits match:subscribe {matchId}
  -> validate payload is a UUID
  -> MatchesService.exists(matchId), else WsException MATCH_NOT_FOUND
  -> client.join(`match:{id}`)
  -> first subscriber for this match? subscribe the gateway's Redis client to
     `match:{id}:events` (ref-counted, so N clients on one match share a
     single Redis subscription)
  -> ack { ok: true }
```

`match:unsubscribe` mirrors this: `client.leave`, then unsubscribe the Redis
channel once the ref count reaches zero.

**Join a chat room** — `chat:join`

```text
client emits chat:join {matchId, userId, username}
  -> ChatService.join: HINCRBY chat:{id}:presence[userId]  (per-tab counter)
  -> client.join(`chat:{id}`)
  -> counter went 0 -> 1 (first open tab for this user)?
       broadcast chat:user_joined with the new userCount
     counter already > 0 (another tab)?
       join silently, no broadcast
  -> ack { ok: true }
```

That per-user counter is the duplicate-tab handling the brief asks for: a
second tab from the same user increments the count without re-announcing
them. `chat:leave` mirrors this in reverse, only broadcasting
`chat:user_left` once the counter hits zero (their last tab closed).

**Send a chat message** — `chat:message`

```text
client emits chat:message {matchId, text}
  -> gateway requires an active chat:join for this matchId first,
     else WsException NOT_SUBSCRIBED
  -> ChatService.message: trim, reject empty/over-length
  -> INCR chat:{id}:ratelimit:{userId}  (fixed window, EXPIRE set on first hit)
  -> over CHAT_RATE_LIMIT_MAX? WsException RATE_LIMITED
  -> persist ChatMessage row in Postgres
  -> broadcast chat:message to the chat:{id} room
```

**Typing indicators** — `chat:typing:start` / `chat:typing:stop`

```text
start -> SET chat:{id}:typing:{userId} EX 4  -> relay { isTyping: true }
stop  -> DEL chat:{id}:typing:{userId}       -> relay { isTyping: false }
```

If a client disconnects mid-type without sending `stop`, the 4-second Redis
TTL is what clears the indicator client-side (see Known Limitations).

**Match events — driven by the simulator, not a client**

```text
SimulatorService.tick() (every TICK_INTERVAL_MS)
  -> advance each active match's clock; fire scheduled or paced events
  -> EventsService.recordAndBroadcast()
       -> Postgres transaction: insert MatchEvent, update Match + MatchStat
       -> write Redis hot-state hash `match:{id}:state`
       -> PUBLISH the full payload on `match:{id}:events`
  -> two independent consumers read that one publish:
       - AppGateway relays it into the match:{id} Socket.io room as
         match:event, plus match:score_update / match:stats_update /
         match:status_change depending on event type
       - StreamController's dedicated per-connection Redis subscriber
         relays it into any open SSE stream for that match
```

Socket.io and SSE never talk to the simulator or to each other directly —
Redis pub/sub is the only fan-out point, which is why REST, WebSocket, and
SSE stay in sync (see Architecture Notes above).

**SSE connect / reconnect** — `GET /api/matches/:id/events/stream`

```text
client connects, optionally with a Last-Event-ID header
  -> validate matchId is a UUID, 404 if the match doesn't exist
  -> Last-Event-ID present? look up that event's createdAt, replay every
     MatchEvent for this match created after it, oldest first, as backlog
  -> open a dedicated Redis connection, subscribe to `match:{id}:events`,
     forward each publish as an SSE frame
  -> emit a heartbeat frame every 15s so proxies don't close the connection
  -> on req 'close': clear the heartbeat, unsubscribe, quit the Redis
     connection
```

## Assessment Coverage

- REST match list/detail with validation, 404s, CORS, and consistent response
  envelopes.
- Real-time match subscriptions with room-based delivery.
- Heartbeat/ping-pong for connection health: Socket.io's built-in
  `pingInterval`/`pingTimeout` plus an app-level `ping`/`pong` event pair
  clients can use for their own liveness checks.
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
- No test coverage