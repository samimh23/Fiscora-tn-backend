import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, finalize, throwError } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;
    const route = this.routeLabel(request);
    if (route === '/metrics') return next.handle();

    const startedAt = process.hrtime.bigint();
    let errorStatus: number | null = null;
    this.metrics.startRequest(method, route);

    return next.handle().pipe(
      catchError((error: unknown) => {
        errorStatus = error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
        this.metrics.finishRequest(
          method,
          route,
          errorStatus ?? response.statusCode,
          Number(elapsedNanoseconds) / 1_000_000_000,
        );
      }),
    );
  }

  private routeLabel(request: Request) {
    const route = request.route as { path?: string } | undefined;
    const configuredPath = route?.path;
    if (configuredPath) return configuredPath;

    return request.path
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
        '/:id',
      )
      .replace(/\/\d+(?=\/|$)/g, '/:number')
      .replace(/\/[A-Za-z0-9_-]{32,}(?=\/|$)/g, '/:token');
  }
}
