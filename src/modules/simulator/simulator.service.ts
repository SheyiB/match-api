import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventType, MatchStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { pickOne, randInt, simulatorConfig } from './distributions';
import { MatchSchedule, generateSchedule } from './schedule-generator';

type SimulatedMatch = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  status: MatchStatus;
  minute: number;
  schedule: MatchSchedule;
  nextFoulMinute: number;
  nextShotMinute: number;
};

@Injectable()
export class SimulatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly activeMatches = new Map<string, SimulatedMatch>();
  private interval?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async onModuleInit() {
    const matches = await this.prisma.match.findMany({
      where: { status: { not: MatchStatus.FULL_TIME } },
      take: simulatorConfig.concurrentMatches,
      orderBy: { kickoffAt: 'asc' },
    });

    for (const match of matches) {
      this.activeMatches.set(match.id, {
        id: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        status: match.status,
        minute: match.minute,
        schedule: generateSchedule(match),
        nextFoulMinute: Math.max(match.minute + randInt(2, 3), 1),
        nextShotMinute: Math.max(match.minute + randInt(3, 5), 1),
      });
      await this.eventsService.syncHotState(match.id);
    }

    if (this.activeMatches.size === 0) {
      this.logger.warn('No matches available for simulation. Run prisma seed first.');
      return;
    }

    this.interval = setInterval(
      () => void this.tick(),
      simulatorConfig.tickIntervalMs,
    );
    this.logger.log(`Simulator started with ${this.activeMatches.size} matches.`);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async tick() {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      for (const match of this.activeMatches.values()) {
        await this.tickMatch(match);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async tickMatch(match: SimulatedMatch) {
    if (match.status === MatchStatus.FULL_TIME) {
      return;
    }

    if (match.status === MatchStatus.NOT_STARTED) {
      await this.apply(match, EventType.KICKOFF, 0);
      return;
    }

    if (match.status === MatchStatus.HALF_TIME) {
      await this.apply(match, EventType.SECOND_HALF_KICKOFF, 46);
      return;
    }

    const previousMinute = match.minute;
    const nextMinute = Math.min(
      match.minute + simulatorConfig.minuteRatio,
      match.status === MatchStatus.FIRST_HALF ? 45 : 90,
    );
    match.minute = nextMinute;
    await this.eventsService.advanceClock(match.id, nextMinute);

    if (match.status === MatchStatus.FIRST_HALF && nextMinute >= 45) {
      await this.applyScheduledEvents(match, previousMinute, 45);
      await this.apply(match, EventType.HALF_TIME_WHISTLE, 45);
      return;
    }

    if (match.status === MatchStatus.SECOND_HALF && nextMinute >= 90) {
      await this.applyScheduledEvents(match, previousMinute, 90);
      await this.apply(match, EventType.FULL_TIME_WHISTLE, 90);
      this.activeMatches.delete(match.id);
      return;
    }

    await this.applyScheduledEvents(match, previousMinute, nextMinute);

    if (nextMinute >= match.nextFoulMinute) {
      await this.apply(match, EventType.FOUL, nextMinute, pickOneTeam(match));
      match.nextFoulMinute = nextMinute + randInt(2, 3);
    }

    if (nextMinute >= match.nextShotMinute) {
      await this.apply(match, EventType.SHOT, nextMinute, pickOneTeam(match));
      match.nextShotMinute = nextMinute + randInt(3, 5);
    }
  }

  private async apply(
    match: SimulatedMatch,
    type: EventType,
    minute: number,
    teamId?: string,
    playerName?: string,
    detail?: Prisma.InputJsonValue,
  ) {
    const payload = await this.eventsService.recordAndBroadcast(match.id, {
      type,
      minute,
      teamId,
      playerName,
      detail,
    });
    match.status = payload.state.status;
    match.minute = payload.state.minute;
  }

  private async applyScheduledEvents(
    match: SimulatedMatch,
    previousMinute: number,
    nextMinute: number,
  ) {
    for (let minute = previousMinute + 1; minute <= nextMinute; minute += 1) {
      const scheduledEvents = match.schedule.get(minute) ?? [];
      for (const event of scheduledEvents) {
        await this.apply(
          match,
          event.type,
          minute,
          event.teamId,
          event.playerName,
          event.detail,
        );
      }
    }
  }
}

function pickOneTeam(match: SimulatedMatch) {
  return pickOne([match.homeTeamId, match.awayTeamId]);
}
