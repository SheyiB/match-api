import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode } from '../constants/error-codes';

type ErrorResponse = {
  code?: ErrorCode | string;
  message?: string | string[];
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as ErrorResponse)
        : {};

    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message ??
        (exception instanceof Error ? exception.message : 'Unexpected server error');

    response.status(status).json({
      success: false,
      error: {
        code: body.code ?? ErrorCode.INTERNAL_ERROR,
        message,
      },
    });
  }
}
