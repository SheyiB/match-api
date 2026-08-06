import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { redisKeys } from '../../common/constants/redis-keys';
import { ErrorCode } from '../../common/constants/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { MatchesService } from '../matches/matches.service';

export type PresenceChange = {
  userId: string;
  username: string;
  userCount: number;
  shouldBroadcast: boolean;
};

@Injectable()
export class ChatService {
  private readonly maxMessageLength = Number(
    process.env.CHAT_MAX_MESSAGE_LENGTH ?? 500,
  );
  private readonly rateLimitMax = Number(process.env.CHAT_RATE_LIMIT_MAX ?? 5);
  private readonly rateLimitWindowSec = Number(
    process.env.CHAT_RATE_LIMIT_WINDOW_SEC ?? 10,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly matchesService: MatchesService,
  ) {}

  async join(
    matchId: string,
    userId: string,
    username: string,
  ): Promise<PresenceChange> {
    await this.assertMatch(matchId);
    const count = await this.redis.command.hincrby(
      redisKeys.chatPresence(matchId),
      userId,
      1,
    );
    await this.redis.command.hset(redisKeys.chatUsers(matchId), userId, username);

    return {
      userId,
      username,
      userCount: await this.userCount(matchId),
      shouldBroadcast: count === 1,
    };
  }

  async leave(
    matchId: string,
    userId: string,
    username: string,
  ): Promise<PresenceChange> {
    const count = await this.redis.command.hincrby(
      redisKeys.chatPresence(matchId),
      userId,
      -1,
    );

    if (count <= 0) {
      await this.redis.command.hdel(redisKeys.chatPresence(matchId), userId);
      await this.redis.command.hdel(redisKeys.chatUsers(matchId), userId);
    }

    return {
      userId,
      username,
      userCount: await this.userCount(matchId),
      shouldBroadcast: count <= 0,
    };
  }

  async message(matchId: string, userId: string, username: string, text: string) {
    await this.assertMatch(matchId);
    const trimmed = text.trim();

    if (!trimmed) {
      throw new WsException({
        code: ErrorCode.EMPTY_MESSAGE,
        message: 'Message text cannot be empty',
      });
    }

    if (trimmed.length > this.maxMessageLength) {
      throw new WsException({
        code: ErrorCode.MESSAGE_TOO_LONG,
        message: `Message text must be ${this.maxMessageLength} characters or fewer`,
      });
    }

    await this.assertWithinRateLimit(matchId, userId);

    const message = await this.prisma.chatMessage.create({
      data: {
        matchId,
        userId,
        username,
        text: trimmed,
      },
    });

    return {
      id: message.id,
      userId: message.userId,
      username: message.username,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async typingStart(matchId: string, userId: string) {
    await this.redis.command.set(
      redisKeys.chatTyping(matchId, userId),
      '1',
      'EX',
      4,
    );
  }

  async typingStop(matchId: string, userId: string) {
    await this.redis.command.del(redisKeys.chatTyping(matchId, userId));
  }

  async presence(matchId: string) {
    await this.assertMatch(matchId);
    const users = await this.redis.command.hgetall(redisKeys.chatUsers(matchId));

    return {
      count: Object.keys(users).length,
      users: Object.entries(users).map(([userId, username]) => ({
        userId,
        username,
      })),
    };
  }

  private async assertWithinRateLimit(matchId: string, userId: string) {
    const key = redisKeys.chatRateLimit(matchId, userId);
    const count = await this.redis.command.incr(key);

    if (count === 1) {
      await this.redis.command.expire(key, this.rateLimitWindowSec);
    }

    if (count > this.rateLimitMax) {
      throw new WsException({
        code: ErrorCode.RATE_LIMITED,
        message: `Rate limit exceeded: ${this.rateLimitMax} messages per ${this.rateLimitWindowSec}s`,
      });
    }
  }

  private async assertMatch(matchId: string) {
    if (!(await this.matchesService.exists(matchId))) {
      throw new WsException({
        code: ErrorCode.MATCH_NOT_FOUND,
        message: `Match ${matchId} was not found`,
      });
    }
  }

  private async userCount(matchId: string) {
    return this.redis.command.hlen(redisKeys.chatPresence(matchId));
  }
}
