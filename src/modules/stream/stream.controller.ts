import { Controller, MessageEvent, Param, Req, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventType } from '@prisma/client';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { assertUuid, matchNotFound } from '../../common/validation';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { redisKeys } from '../../common/constants/redis-keys';
import { BroadcastPayload } from '../events/events.service';
import { MatchesService } from '../matches/matches.service';

@ApiTags('stream')
@Controller('/api/matches/:id/events')
export class StreamController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly matchesService: MatchesService,
  ) {}

  @Sse('/stream')
  @SkipEnvelope()
  async stream(
    @Param('id') matchId: string,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    assertUuid(matchId);

    if (!(await this.matchesService.exists(matchId))) {
      throw matchNotFound(matchId);
    }

    const replayEvents = await this.replayEvents(
      matchId,
      req.header('last-event-id'),
    );

    return new Observable<MessageEvent>((subscriber) => {
      const redis = this.redis.duplicate();
      const heartbeat = setInterval(() => {
        subscriber.next({
          type: 'heartbeat',
          data: '',
        });
      }, 15000);

      for (const event of replayEvents) {
        subscriber.next(toMatchEventFrame(matchId, event));
      }

      redis.on('message', (_channel, message) => {
        const payload = JSON.parse(message) as BroadcastPayload;
        subscriber.next(toMatchEventFrame(matchId, payload.event));

        if (payload.event.type === EventType.GOAL) {
          subscriber.next({
            id: payload.event.id,
            type: 'score_update',
            data: {
              matchId,
              homeScore: payload.state.homeScore,
              awayScore: payload.state.awayScore,
              minute: payload.state.minute,
            },
          });
        }

        if (isStatusEvent(payload.event.type)) {
          subscriber.next({
            id: payload.event.id,
            type: 'status_change',
            data: {
              matchId,
              status: payload.state.status,
              minute: payload.state.minute,
            },
          });
        }
      });

      void redis.subscribe(redisKeys.matchEvents(matchId));

      const cleanup = () => {
        clearInterval(heartbeat);
        void redis.unsubscribe(redisKeys.matchEvents(matchId));
        void redis.quit();
        subscriber.complete();
      };

      req.on('close', cleanup);
      return cleanup;
    });
  }

  private async replayEvents(matchId: string, lastEventId?: string) {
    if (!lastEventId) {
      return [];
    }

    const anchor = await this.prisma.matchEvent.findFirst({
      where: { id: lastEventId, matchId },
      select: { createdAt: true },
    });

    if (!anchor) {
      return [];
    }

    return this.prisma.matchEvent.findMany({
      where: {
        matchId,
        createdAt: { gt: anchor.createdAt },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }
}

function toMatchEventFrame(
  matchId: string,
  event: {
    id: string;
    type: EventType;
    minute: number;
    teamId: string | null;
    playerName: string | null;
    detail: unknown;
  },
): MessageEvent {
  return {
    id: event.id,
    type: 'match_event',
    data: {
      matchId,
      type: event.type,
      minute: event.minute,
      teamId: event.teamId,
      playerName: event.playerName,
      detail: event.detail,
    },
  };
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
