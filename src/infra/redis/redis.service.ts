import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly command: Redis;
  readonly pubSub: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.command = new Redis(url, { lazyConnect: false });
    this.pubSub = new Redis(url, { lazyConnect: false });
  }

  duplicate() {
    return this.command.duplicate();
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.command.quit(), this.pubSub.quit()]);
  }
}
