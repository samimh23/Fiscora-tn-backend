import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable, from, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { AuditLog } from '../database/entities';

interface AuditedRequest extends Request {
  user?: { userId?: string };
}

@Injectable()
export class UniversalAuditInterceptor implements NestInterceptor {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method))
      return next.handle();

    const startedAt = Date.now();
    return next
      .handle()
      .pipe(
        mergeMap((value) =>
          from(this.write(request, response, startedAt)).pipe(
            mergeMap(() => of(value)),
          ),
        ),
      );
  }

  private async write(
    request: AuditedRequest,
    response: Response,
    startedAt: number,
  ) {
    const organizationId = this.uuidOrNull(request.params?.organizationId);
    const actorUserId = this.uuidOrNull(request.user?.userId);
    const entityId =
      Object.entries(request.params ?? {}).find(
        ([key]) => key !== 'organizationId' && key !== 'dossierId',
      )?.[1] ??
      request.params?.dossierId ??
      'request';
    const repository = this.dataSource.getRepository(AuditLog);
    try {
      await repository.save(
        repository.create({
          organizationId,
          actorUserId,
          action: `http.${request.method.toLowerCase()}`,
          entityType: 'HttpMutation',
          entityId: String(entityId).slice(0, 100),
          detailsJson: {
            method: request.method,
            path: request.originalUrl.split('?')[0],
            dossierId: request.params?.dossierId ?? null,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
            payload: this.sanitize(request.body),
          },
        }),
      );
    } catch {
      // Une panne du journal ne doit pas transformer une opération métier réussie en erreur HTTP.
    }
  }

  private sanitize(body: unknown): unknown {
    if (!body || typeof body !== 'object') return null;
    const sensitive =
      /password|token|secret|authorization|file|content|signature|certificate/i;
    const visit = (value: unknown, depth: number): unknown => {
      if (depth > 3) return '[TRONQUÉ]';
      if (Array.isArray(value))
        return value.slice(0, 30).map((item) => visit(item, depth + 1));
      if (!value || typeof value !== 'object')
        return typeof value === 'string' && value.length > 500
          ? `${value.slice(0, 500)}…`
          : value;
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          sensitive.test(key) ? '[MASQUÉ]' : visit(item, depth + 1),
        ]),
      );
    };
    return visit(body, 0);
  }

  private uuidOrNull(value?: unknown) {
    return typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
      ? value
      : null;
  }
}
