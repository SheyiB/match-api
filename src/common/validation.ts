import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from './constants/error-codes';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(id: string, field = 'id') {
  if (!uuidRegex.test(id)) {
    throw new BadRequestException({
      code: ErrorCode.INVALID_PAYLOAD,
      message: `${field} must be a valid UUID`,
    });
  }
}

export function matchNotFound(matchId: string): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.MATCH_NOT_FOUND,
    message: `Match ${matchId} was not found`,
  });
}
