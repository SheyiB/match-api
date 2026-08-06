import { ApiProperty } from '@nestjs/swagger';
import { EventType } from '@prisma/client';
import { MatchResponseDto } from './match-response.dto';

export class MatchEventDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: EventType })
  type: EventType;

  @ApiProperty()
  minute: number;

  @ApiProperty({ required: false, nullable: true })
  teamId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  playerName?: string | null;

  @ApiProperty({ required: false, nullable: true })
  detail?: unknown;
}

export class MatchStatDto {
  @ApiProperty()
  possessionHome: number;

  @ApiProperty()
  possessionAway: number;

  @ApiProperty()
  shotsHome: number;

  @ApiProperty()
  shotsAway: number;

  @ApiProperty()
  shotsOnTargetHome: number;

  @ApiProperty()
  shotsOnTargetAway: number;

  @ApiProperty()
  cornersHome: number;

  @ApiProperty()
  cornersAway: number;

  @ApiProperty()
  foulsHome: number;

  @ApiProperty()
  foulsAway: number;
}

export class MatchDetailResponseDto extends MatchResponseDto {
  @ApiProperty({ type: [MatchEventDto] })
  events: MatchEventDto[];

  @ApiProperty({ type: MatchStatDto, nullable: true })
  stats: MatchStatDto | null;
}
