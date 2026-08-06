import { Controller, Get, Module } from '@nestjs/common';
import { ChatModule } from './modules/chat/chat.module';
import { EventsModule } from './modules/events/events.module';
import { MatchesModule } from './modules/matches/matches.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SimulatorModule } from './modules/simulator/simulator.module';
import { StreamModule } from './modules/stream/stream.module';

@Controller()
class HealthController {
  @Get('/health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    MatchesModule,
    EventsModule,
    SimulatorModule,
    RealtimeModule,
    ChatModule,
    StreamModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
