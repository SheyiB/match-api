import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { MatchesModule } from '../matches/matches.module';
import { StreamController } from './stream.controller';

@Module({
  imports: [MatchesModule, RedisModule],
  controllers: [StreamController],
})
export class StreamModule {}
