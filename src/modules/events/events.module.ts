import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { EventsService } from './events.service';

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
