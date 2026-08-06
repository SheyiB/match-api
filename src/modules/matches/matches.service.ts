import { Injectable } from '@nestjs/common';
import { Match, MatchStat, MatchStatus, Team } from '@prisma/client';
import { redisKeys } from '../../common/constants/redis-keys';
import { matchNotFound } from '../../common/validation';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { MatchDetailResponseDto } from './dto/match-detail-response.dto';
import { MatchResponseDto } from './dto/match-response.dto';

type MatchWithTeams = Match & {
  homeTeam: Team;
  awayTeam: Team;
};

type MatchDetail = MatchWithTeams & {
  stats: MatchStat | null;
  events: {
    id: string;
    type: string;
    minute: number;
    teamId: string | null;
    playerName: string | null;
    detail: unknown;
  }[];
};

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(): Promise<MatchResponseDto[]> {
    const matches = await this.prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: 'asc' },
    });

    return Promise.all(matches.map((match) => this.toListDto(match)));
  }

  async detail(id: string): Promise<MatchDetailResponseDto> {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: true,
        awayTeam: true,
        stats: true,
        events: { orderBy: [{ minute: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    if (!match) {
      throw matchNotFound(id);
    }

    const summary = await this.toListDto(match);

    return {
      ...summary,
      events: match.events.map((event) => ({
        id: event.id,
        type: event.type,
        minute: event.minute,
        teamId: event.teamId,
        playerName: event.playerName,
        detail: event.detail,
      })),
      stats: match.stats
        ? {
            possessionHome: match.stats.possessionHome,
            possessionAway: match.stats.possessionAway,
            shotsHome: match.stats.shotsHome,
            shotsAway: match.stats.shotsAway,
            shotsOnTargetHome: match.stats.shotsOnTargetHome,
            shotsOnTargetAway: match.stats.shotsOnTargetAway,
            cornersHome: match.stats.cornersHome,
            cornersAway: match.stats.cornersAway,
            foulsHome: match.stats.foulsHome,
            foulsAway: match.stats.foulsAway,
          }
        : null,
    };
  }

  async exists(id: string): Promise<boolean> {
    const match = await this.prisma.match.findUnique({
      where: { id },
      select: { id: true },
    });
    return Boolean(match);
  }

  private async toListDto(match: MatchWithTeams | MatchDetail): Promise<MatchResponseDto> {
    const hotState = await this.redis.command.hgetall(redisKeys.matchState(match.id));
    const status = (hotState.status as MatchStatus | undefined) ?? match.status;

    return {
      id: match.id,
      status,
      minute: Number(hotState.minute ?? match.minute),
      homeTeam: {
        id: match.homeTeam.id,
        name: match.homeTeam.name,
        shortCode: match.homeTeam.shortCode,
        crestUrl: match.homeTeam.crestUrl,
      },
      awayTeam: {
        id: match.awayTeam.id,
        name: match.awayTeam.name,
        shortCode: match.awayTeam.shortCode,
        crestUrl: match.awayTeam.crestUrl,
      },
      homeScore: Number(hotState.homeScore ?? match.homeScore),
      awayScore: Number(hotState.awayScore ?? match.awayScore),
    };
  }
}
