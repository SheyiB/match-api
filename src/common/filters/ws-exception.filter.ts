import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ErrorCode } from '../constants/error-codes';
import { wsEvents } from '../constants/ws-events';

@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();
    const error = exception instanceof WsException ? exception.getError() : exception;

    if (typeof error === 'object' && error !== null) {
      client.emit(wsEvents.server.error, error);
      return;
    }

    client.emit(wsEvents.server.error, {
      code: ErrorCode.INTERNAL_ERROR,
      message: String(error ?? 'Unexpected websocket error'),
    });
  }
}
