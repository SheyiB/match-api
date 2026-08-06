# Action Flows

The event list in the README shows what gets emitted; this shows what actually
happens end-to-end for each action. Every WebSocket action follows the same
shape: validate the payload, apply the change, then (sometimes) broadcast.

## Subscribe to a match — `match:subscribe`

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

## Join a chat room — `chat:join`

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

## Send a chat message — `chat:message`

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

## Typing indicators — `chat:typing:start` / `chat:typing:stop`

```text
start -> SET chat:{id}:typing:{userId} EX 4  -> relay { isTyping: true }
stop  -> DEL chat:{id}:typing:{userId}       -> relay { isTyping: false }
```

If a client disconnects mid-type without sending `stop`, the 4-second Redis
TTL is what clears the indicator client-side (see Known Limitations in the
README).

## Match events — driven by the simulator, not a client

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
SSE stay in sync (see Architecture Notes in the README).

## SSE connect / reconnect — `GET /api/matches/:id/events/stream`

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
