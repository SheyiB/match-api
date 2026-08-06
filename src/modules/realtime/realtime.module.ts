import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { ChatModule } from '../chat/chat.module';
import { MatchesModule } from '../matches/matches.module';
import { AppGateway } from './app.gateway';

@Module({
  imports: [ChatModule, MatchesModule, RedisModule],
  providers: [AppGateway],
})
export class RealtimeModule {}
