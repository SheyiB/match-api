import { EventType } from '@prisma/client';
import { EventInput } from '../events/events.service';
import { pickOne, poisson, randInt, simulatorConfig } from './distributions';

type MatchForSchedule = {
  homeTeamId: string;
  awayTeamId: string;
};

const players = [
  'Alex Morgan',
  'Jamie Silva',
  'Noah King',
  'Leo Santos',
  'Mateo Reed',
  'Kai Johnson',
  'Theo Brooks',
  'Andre Costa',
  'Mason Clarke',
  'Eli Turner',
];

export type MatchSchedule = Map<number, EventInput[]>;

export function generateSchedule(match: MatchForSchedule): MatchSchedule {
  const schedule: MatchSchedule = new Map();
  const teams = [match.homeTeamId, match.awayTeamId];

  addMany(
    schedule,
    poisson(simulatorConfig.averageGoals),
    () => ({
      type: EventType.GOAL,
      minute: randInt(1, 90),
      teamId: pickOne(teams),
      playerName: pickOne(players),
    }),
  );

  addMany(
    schedule,
    poisson(simulatorConfig.averageYellowCards),
    () => ({
      type: EventType.YELLOW_CARD,
      minute: randInt(1, 90),
      teamId: pickOne(teams),
      playerName: pickOne(players),
    }),
  );

  if (Math.random() < simulatorConfig.redCardChance) {
    add(schedule, {
      type: EventType.RED_CARD,
      minute: randInt(1, 90),
      teamId: pickOne(teams),
      playerName: pickOne(players),
    });
  }

  for (const teamId of teams) {
    addMany(
      schedule,
      randInt(
        simulatorConfig.minSubstitutionsPerTeam,
        simulatorConfig.maxSubstitutionsPerTeam,
      ),
      () => ({
        type: EventType.SUBSTITUTION,
        minute: randInt(60, 90),
        teamId,
        detail: {
          playerOut: pickOne(players),
          playerIn: pickOne(players),
        },
      }),
    );
  }

  return schedule;
}

function addMany(
  schedule: MatchSchedule,
  count: number,
  createEvent: () => EventInput,
) {
  for (let index = 0; index < count; index += 1) {
    add(schedule, createEvent());
  }
}

function add(schedule: MatchSchedule, event: EventInput) {
  const events = schedule.get(event.minute) ?? [];
  events.push(event);
  schedule.set(event.minute, events);
}
