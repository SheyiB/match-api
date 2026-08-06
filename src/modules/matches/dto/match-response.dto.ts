import { ApiProperty } from '@nestjs/swagger';
import { MatchStatus } from '@prisma/client';

export class TeamSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  shortCode: string;

  @ApiProperty({ required: false, nullable: true })
  crestUrl?: string | null;
}

export class MatchResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: MatchStatus })
  status: MatchStatus;

  @ApiProperty()
  minute: number;

  @ApiProperty({ type: TeamSummaryDto })
  homeTeam: TeamSummaryDto;

  @ApiProperty({ type: TeamSummaryDto })
  awayTeam: TeamSummaryDto;

  @ApiProperty()
  homeScore: number;

  @ApiProperty()
  awayScore: number;
}
