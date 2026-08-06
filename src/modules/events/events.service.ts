import { Injectable } from '@nestjs/common';
import {
  EventType,
  Match,
  MatchStat,
  MatchStatus,
  Prisma,
} from '@prisma/client';
import { redisKeys } from '../../common/constants/redis-keys';
import { matchNotFound } from '../../common/validation';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

export type EventInput = {
  type: EventType;
  minute: number;
  teamId?: string;
  playerName?: string;
  detail?: Prisma.InputJsonValue;
};

export type BroadcastPayload = {
  matchId: string;
  event: {
    id: string;
    type: EventType;
    minute: number;
    teamId: string | null;
    playerName: string | null;
    detail: Prisma.JsonValue | null;
    createdAt: string;
  };
  state: {
    status: MatchStatus;
    minute: number;
    homeScore: number;
    awayScore: number;
  };
  stats?: {
    possessionHome: number;
    possessionAway: number;
    shotsHome: number;
    shotsAway: number;
    shotsOnTargetHome: number;
    shotsOnTargetAway: number;
    cornersHome: number;
    cornersAway: number;
    foulsHome: number;
    foulsAway: number;
  };
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async advanceClock(matchId: string, minute: number) {
    const match = await this.prisma.match.update({
      where: { id: matchId },
      data: { minute },
    });
    await this.writeHotState(match);
  }

  async recordAndBroadcast(
    matchId: string,
    input: EventInput,
  ): Promise<BroadcastPayload> {
    const payload = await this.prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { stats: true },
      });

      if (!match) {
        throw matchNotFound(matchId);
      }

      const nextState = this.nextMatchState(match, input);
      const event = await tx.matchEvent.create({
        data: {
          matchId,
          type: input.type,
          minute: input.minute,
          teamId: input.teamId,
          playerName: input.playerName,
          detail: input.detail ?? Prisma.JsonNull,
        },
      });

      const updatedMatch = await tx.match.update({
        where: { id: matchId },
        data: nextState,
      });

      const stats = await this.updateStats(tx, match, input);

      return this.toPayload(updatedMatch, event, stats);
    });

    await this.writeHotState(payload.matchId, payload.state);
    await this.redis.command.publish(
      redisKeys.matchEvents(matchId),
      JSON.stringify(payload),
    );

    return payload;
  }

  async syncHotState(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) {
      throw matchNotFound(matchId);
    }
    await this.writeHotState(match);
  }

  private nextMatchState(
    match: Match,
    input: EventInput,
  ): Pick<Match, 'status' | 'minute' | 'homeScore' | 'awayScore'> {
    let status = match.status;
    let homeScore = match.homeScore;
    let awayScore = match.awayScore;

    if (input.type === EventType.KICKOFF) {
      status = MatchStatus.FIRST_HALF;
    }

    if (input.type === EventType.HALF_TIME_WHISTLE) {
      status = MatchStatus.HALF_TIME;
    }

    if (input.type === EventType.SECOND_HALF_KICKOFF) {
      status = MatchStatus.SECOND_HALF;
    }

    if (input.type === EventType.FULL_TIME_WHISTLE) {
      status = MatchStatus.FULL_TIME;
    }

    if (input.type === EventType.GOAL && input.teamId) {
      if (input.teamId === match.homeTeamId) {
        homeScore += 1;
      }

      if (input.teamId === match.awayTeamId) {
        awayScore += 1;
      }
    }

    return {
      status,
      minute: input.minute,
      homeScore,
      awayScore,
    };
  }

  private async updateStats(
    tx: Prisma.TransactionClient,
    match: Match & { stats: MatchStat | null },
    input: EventInput,
  ) {
    const side = input.teamId === match.awayTeamId ? 'Away' : 'Home';
    const data: Prisma.MatchStatUpdateInput = {};

    if (input.type === EventType.SHOT) {
      data[`shots${side}` as 'shotsHome' | 'shotsAway'] = { increment: 1 };
      if (Math.random() < 0.38) {
        data[
          `shotsOnTarget${side}` as 'shotsOnTargetHome' | 'shotsOnTargetAway'
        ] = { increment: 1 };
      }
    }

    if (input.type === EventType.FOUL) {
      data[`fouls${side}` as 'foulsHome' | 'foulsAway'] = { increment: 1 };
    }

    if (Object.keys(data).length === 0) {
      return match.stats;
    }

    return tx.matchStat.upsert({
      where: { matchId: match.id },
      create: {
        matchId: match.id,
        possessionHome: 50,
        possessionAway: 50,
        ...(input.type === EventType.SHOT
          ? side === 'Home'
            ? { shotsHome: 1, shotsOnTargetHome: Math.random() < 0.38 ? 1 : 0 }
            : { shotsAway: 1, shotsOnTargetAway: Math.random() < 0.38 ? 1 : 0 }
          : {}),
        ...(input.type === EventType.FOUL
          ? side === 'Home'
            ? { foulsHome: 1 }
            : { foulsAway: 1 }
          : {}),
      },
      update: data,
    });
  }

  private toPayload(
    match: Match,
    event: {
      id: string;
      type: EventType;
      minute: number;
      teamId: string | null;
      playerName: string | null;
      detail: Prisma.JsonValue | null;
      createdAt: Date;
    },
    stats: MatchStat | null,
  ): BroadcastPayload {
    return {
      matchId: match.id,
      event: {
        id: event.id,
        type: event.type,
        minute: event.minute,
        teamId: event.teamId,
        playerName: event.playerName,
        detail: event.detail,
        createdAt: event.createdAt.toISOString(),
      },
      state: {
        status: match.status,
        minute: match.minute,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      },
      ...(stats
        ? {
            stats: {
              possessionHome: stats.possessionHome,
              possessionAway: stats.possessionAway,
              shotsHome: stats.shotsHome,
              shotsAway: stats.shotsAway,
              shotsOnTargetHome: stats.shotsOnTargetHome,
              shotsOnTargetAway: stats.shotsOnTargetAway,
              cornersHome: stats.cornersHome,
              cornersAway: stats.cornersAway,
              foulsHome: stats.foulsHome,
              foulsAway: stats.foulsAway,
            },
          }
        : {}),
    };
  }

  private async writeHotState(match: Match): Promise<void>;
  private async writeHotState(
    matchId: string,
    state: BroadcastPayload['state'],
  ): Promise<void>;
  private async writeHotState(
    matchOrId: Match | string,
    state?: BroadcastPayload['state'],
  ): Promise<void> {
    const matchId = typeof matchOrId === 'string' ? matchOrId : matchOrId.id;
    const hotState =
      state ??
      (typeof matchOrId === 'string'
        ? undefined
        : {
            status: matchOrId.status,
            minute: matchOrId.minute,
            homeScore: matchOrId.homeScore,
            awayScore: matchOrId.awayScore,
          });

    if (!hotState) {
      return;
    }

    await this.redis.command.hset(redisKeys.matchState(matchId), {
      status: hotState.status,
      minute: String(hotState.minute),
      homeScore: String(hotState.homeScore),
      awayScore: String(hotState.awayScore),
    });
  }
}
