import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { UseFilters } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsUUID, validateSync } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { ErrorCode } from '../../common/constants/error-codes';
import { redisKeys, roomNames } from '../../common/constants/redis-keys';
import { resolveCorsOrigin } from '../../common/cors';
import { wsEvents } from '../../common/constants/ws-events';
import { WsExceptionFilter } from '../../common/filters/ws-exception.filter';
import { BroadcastPayload } from '../events/events.service';
import { ChatService } from '../chat/chat.service';
import { ChatJoinDto, ChatLeaveDto, ChatMessageDto } from '../chat/dto/chat-message.dto';
import { MatchesService } from '../matches/matches.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EventType } from '@prisma/client';

type SocketChatMembership = { userId: string; username: string };

@UseFilters(WsExceptionFilter)
@WebSocketGateway({
  cors: {
    origin: resolveCorsOrigin(),
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
})
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;

  private readonly matchChannelCounts = new Map<string, number>();

  constructor(
    private readonly redis: RedisService,
    private readonly matchesService: MatchesService,
    private readonly chatService: ChatService,
  ) {}

  afterInit() {
    this.redis.pubSub.on('message', (_channel, message) => {
      this.relayMatchEvent(message);
    });
  }

  handleConnection(client: Socket) {
    client.data.matchSubscriptions = new Set<string>();
    client.data.chatMemberships = new Map<string, SocketChatMembership>();
  }

  async handleDisconnect(client: Socket) {
    const matchSubscriptions = this.matchSubscriptions(client);
    await Promise.all(
      [...matchSubscriptions].map((matchId) =>
        this.decrementMatchSubscription(matchId),
      ),
    );

    const chatMemberships = this.chatMemberships(client);
    for (const [matchId, membership] of chatMemberships.entries()) {
      const change = await this.chatService.leave(
        matchId,
        membership.userId,
        membership.username,
      );
      if (change.shouldBroadcast) {
        this.server.to(roomNames.chat(matchId)).emit(wsEvents.server.chatUserLeft, {
          matchId,
          userId: change.userId,
          username: change.username,
          userCount: change.userCount,
        });
      }
    }
  }

  @SubscribeMessage(wsEvents.client.matchSubscribe)
  async subscribeMatch(client: Socket, rawPayload: unknown) {
    const payload = validatePayload(MatchSubscribePayload, rawPayload);
    await this.assertMatch(payload.matchId);

    const subscriptions = this.matchSubscriptions(client);
    if (!subscriptions.has(payload.matchId)) {
      subscriptions.add(payload.matchId);
      await client.join(roomNames.match(payload.matchId));
      await this.incrementMatchSubscription(payload.matchId);
    }

    return { ok: true };
  }

  @SubscribeMessage(wsEvents.client.matchUnsubscribe)
  async unsubscribeMatch(client: Socket, rawPayload: unknown) {
    const payload = validatePayload(MatchSubscribePayload, rawPayload);
    const subscriptions = this.matchSubscriptions(client);

    if (subscriptions.delete(payload.matchId)) {
      await client.leave(roomNames.match(payload.matchId));
      await this.decrementMatchSubscription(payload.matchId);
    }

    return { ok: true };
  }

  @SubscribeMessage(wsEvents.client.chatJoin)
  async joinChat(client: Socket, rawPayload: unknown) {
    const payload = validatePayload(ChatJoinDto, rawPayload);
    const memberships = this.chatMemberships(client);

    if (memberships.has(payload.matchId)) {
      return { ok: true };
    }

    const change = await this.chatService.join(
      payload.matchId,
      payload.userId,
      payload.username,
    );
    memberships.set(payload.matchId, {
      userId: payload.userId,
      username: payload.username,
    });
    await client.join(roomNames.chat(payload.matchId));

    if (change.shouldBroadcast) {
      this.server.to(roomNames.chat(payload.matchId)).emit(wsEvents.server.chatUserJoined, {
        matchId: payload.matchId,
        userId: change.userId,
        username: change.username,
        userCount: change.userCount,
      });
    }

    return { ok: true };
  }

  @SubscribeMessage(wsEvents.client.chatLeave)
  async leaveChat(client: Socket, rawPayload: unknown) {
    const payload = validatePayload(ChatLeaveDto, rawPayload);
    const memberships = this.chatMemberships(client);
    const membership = memberships.get(payload.matchId);

    if (!membership) {
      return { ok: true };
    }

    memberships.delete(payload.matchId);
    await client.leave(roomNames.chat(payload.matchId));
    const change = await this.chatService.leave(
      payload.matchId,
      membership.userId,
      membership.username,
    );

    if (change.shouldBroadcast) {
      this.server.to(roomNames.chat(payload.matchId)).emit(wsEvents.server.chatUserLeft, {
        matchId: payload.matchId,
        userId: change.userId,
        username: change.username,
        userCount: change.userCount,
      });
    }

    return { ok: true };
  }

  @SubscribeMessage(wsEvents.client.chatMessage)
  async sendChatMessage(client: Socket, rawPayload: unknown) {
    const payload = validatePayload(ChatMessageDto, rawPayload);
    const membership = this.requireChatMembership(client, payload.matchId);
    const message = await this.chatService.message(
      payload.matchId,
      membership.userId,
      membership.username,
      payload.text,
    );

    this.server.to(roomNames.chat(payload.matchId)).emit(wsEvents.server.chatMessage, {
      matchId: payload.matchId,
      message,
    });

    return { ok: true };
  }

  @SubscribeMessage(wsEvents.client.chatTypingStart)
  async startTyping(client: Socket, rawPayload: unknown) {
    const payload = validatePayload(ChatLeaveDto, rawPayload);
    const membership = this.requireChatMembership(client, payload.matchId);
    await this.chatService.typingStart(payload.matchId, membership.userId);
    client.to(roomNames.chat(payload.matchId)).emit(wsEvents.server.chatTyping, {
      matchId: payload.matchId,
      userId: membership.userId,
      isTyping: true,
    });
    return { ok: true };
  }

  @SubscribeMessage(wsEvents.client.chatTypingStop)
  async stopTyping(client: Socket, rawPayload: unknown) {
    const payload = validatePayload(ChatLeaveDto, rawPayload);
    const membership = this.requireChatMembership(client, payload.matchId);
    await this.chatService.typingStop(payload.matchId, membership.userId);
    client.to(roomNames.chat(payload.matchId)).emit(wsEvents.server.chatTyping, {
      matchId: payload.matchId,
      userId: membership.userId,
      isTyping: false,
    });
    return { ok: true };
  }

  @SubscribeMessage(wsEvents.client.ping)
  ping() {
    return { event: wsEvents.server.pong, data: { ts: Date.now() } };
  }

  private relayMatchEvent(message: string) {
    const payload = JSON.parse(message) as BroadcastPayload;
    const room = roomNames.match(payload.matchId);

    this.server.to(room).emit(wsEvents.server.matchEvent, {
      matchId: payload.matchId,
      event: payload.event,
    });

    if (payload.event.type === EventType.GOAL) {
      this.server.to(room).emit(wsEvents.server.matchScoreUpdate, {
        matchId: payload.matchId,
        homeScore: payload.state.homeScore,
        awayScore: payload.state.awayScore,
        minute: payload.state.minute,
      });
    }

    if (payload.stats) {
      this.server.to(room).emit(wsEvents.server.matchStatsUpdate, {
        matchId: payload.matchId,
        stats: payload.stats,
      });
    }

    if (isStatusEvent(payload.event.type)) {
      this.server.to(room).emit(wsEvents.server.matchStatusChange, {
        matchId: payload.matchId,
        status: payload.state.status,
        minute: payload.state.minute,
      });
    }
  }

  private async assertMatch(matchId: string) {
    if (!(await this.matchesService.exists(matchId))) {
      throw new WsException({
        code: ErrorCode.MATCH_NOT_FOUND,
        message: `Match ${matchId} was not found`,
      });
    }
  }

  private requireChatMembership(client: Socket, matchId: string) {
    const membership = this.chatMemberships(client).get(matchId);
    if (!membership) {
      throw new WsException({
        code: ErrorCode.NOT_SUBSCRIBED,
        message: `Join chat for match ${matchId} before sending chat events`,
      });
    }
    return membership;
  }

  private async incrementMatchSubscription(matchId: string) {
    const count = this.matchChannelCounts.get(matchId) ?? 0;
    if (count === 0) {
      await this.redis.pubSub.subscribe(redisKeys.matchEvents(matchId));
    }
    this.matchChannelCounts.set(matchId, count + 1);
  }

  private async decrementMatchSubscription(matchId: string) {
    const count = this.matchChannelCounts.get(matchId) ?? 0;
    if (count <= 1) {
      this.matchChannelCounts.delete(matchId);
      await this.redis.pubSub.unsubscribe(redisKeys.matchEvents(matchId));
      return;
    }
    this.matchChannelCounts.set(matchId, count - 1);
  }

  private matchSubscriptions(client: Socket): Set<string> {
    return client.data.matchSubscriptions as Set<string>;
  }

  private chatMemberships(client: Socket): Map<string, SocketChatMembership> {
    return client.data.chatMemberships as Map<string, SocketChatMembership>;
  }
}

class MatchSubscribePayload {
  @IsUUID()
  matchId: string;
}

function validatePayload<T extends object>(
  cls: new () => T,
  rawPayload: unknown,
): T {
  const payload = plainToInstance(cls, rawPayload ?? {});
  const errors = validateSync(payload, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    throw new WsException({
      code: ErrorCode.INVALID_PAYLOAD,
      message: 'Payload validation failed',
      context: errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      })),
    });
  }

  return payload;
}

function isStatusEvent(type: EventType) {
  const statusEvents: EventType[] = [
    EventType.KICKOFF,
    EventType.HALF_TIME_WHISTLE,
    EventType.SECOND_HALF_KICKOFF,
    EventType.FULL_TIME_WHISTLE,
  ];

  return statusEvents.includes(type);
}
