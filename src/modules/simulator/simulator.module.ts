import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SimulatorService } from './simulator.service';

@Module({
  imports: [EventsModule],
  providers: [SimulatorService],
})
export class SimulatorModule {}
