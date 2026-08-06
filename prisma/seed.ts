import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const teams = [
  { name: 'Northbridge FC', shortCode: 'NBF' },
  { name: 'Harbor United', shortCode: 'HBU' },
  { name: 'City Rovers', shortCode: 'CRO' },
  { name: 'East Vale Athletic', shortCode: 'EVA' },
  { name: 'Kingsport Town', shortCode: 'KST' },
  { name: 'Westmoor Wanderers', shortCode: 'WMW' },
  { name: 'Lakeside Albion', shortCode: 'LSA' },
  { name: 'Metro Stars', shortCode: 'MTS' },
];

async function main() {
  await prisma.chatMessage.deleteMany();
  await prisma.matchEvent.deleteMany();
  await prisma.matchStat.deleteMany();
  await prisma.match.deleteMany();
  await prisma.team.deleteMany();

  const createdTeams = await Promise.all(
    teams.map((team) => prisma.team.create({ data: team })),
  );

  const kickoffBase = new Date();
  for (let index = 0; index < 4; index += 1) {
    const homeTeam = createdTeams[index * 2];
    const awayTeam = createdTeams[index * 2 + 1];
    const match = await prisma.match.create({
      data: {
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        kickoffAt: new Date(kickoffBase.getTime() + index * 5 * 60 * 1000),
      },
    });

    await prisma.matchStat.create({
      data: {
        matchId: match.id,
        possessionHome: 50,
        possessionAway: 50,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
