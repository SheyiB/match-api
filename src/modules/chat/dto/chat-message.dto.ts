import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChatJoinDto {
  @IsUUID()
  matchId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  username: string;
}

export class ChatLeaveDto {
  @IsUUID()
  matchId: string;
}

export class ChatMessageDto {
  @IsUUID()
  matchId: string;

  @IsString()
  text: string;
}

export class ChatPresenceResponseDto {
  @ApiProperty()
  count: number;

  @ApiProperty()
  users: { userId: string; username: string }[];
}
