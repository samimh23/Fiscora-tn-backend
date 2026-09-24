import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import type { JwtUser } from '../common/auth.types';
import { OrganizationMembership, User } from '../database/entities';
import { PermissionNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';

const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ??
  'http://127.0.0.1:5173,http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export interface ClientPortalRealtimeMessage {
  id: string;
  dossierId: string;
  senderUserId: string;
  senderName: string;
  senderRole: string;
  body: string;
  clientReadAtUtc: Date | null;
  cabinetReadAtUtc: Date | null;
  createdAtUtc: Date;
}

export interface ClientPortalMessageCreatedEvent {
  organizationId: string;
  dossierId: string;
  message: ClientPortalRealtimeMessage;
}

interface SubscribePayload {
  organizationId?: unknown;
  dossierId?: unknown;
}

interface AccessTokenPayload {
  sub?: string;
  email?: string;
  name?: string;
}

interface ClientToServerEvents {
  'client_portal.subscribe': (payload: SubscribePayload) => void;
  'client_portal.unsubscribe': (payload: SubscribePayload) => void;
}

interface ServerToClientEvents {
  'client_portal.message.created': (
    event: ClientPortalMessageCreatedEvent,
  ) => void;
}

interface InterServerEvents {
  'client_portal.noop': () => void;
}

interface ClientPortalSocketData {
  user?: JwtUser;
}

type ClientPortalSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  ClientPortalSocketData
>;

@WebSocketGateway({
  namespace: '/client-portal',
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
})
export class ClientPortalGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ClientPortalGateway.name);

  @WebSocketServer()
  private server!: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    ClientPortalSocketData
  >;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly dossiers: DossiersService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
  ) {}

  async handleConnection(client: ClientPortalSocket) {
    try {
      const token = this.accessToken(client);
      if (!token) throw new Error('Missing access token');
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.config.getOrThrow<string>('JWT_SIGNING_KEY'),
          issuer: this.config.get('JWT_ISSUER', 'accounting-platform'),
          audience: this.config.get('JWT_AUDIENCE', 'accounting-platform-api'),
        },
      );
      if (!payload.sub) throw new Error('Missing user identifier');
      const user = await this.users.findOneBy({
        id: payload.sub,
        isActive: true,
      });
      if (!user) throw new Error('Inactive user');
      const authenticatedUser: JwtUser = {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        isPlatformAdmin: user.isPlatformAdmin,
      };
      client.data.user = authenticatedUser;
      await client.join(this.userRoom(user.id));
    } catch {
      this.logger.warn(`Rejected realtime connection ${client.id}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('client_portal.subscribe')
  async subscribe(
    @ConnectedSocket() client: ClientPortalSocket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const user = client.data.user;
    if (!user) throw new WsException('Authentification requise.');
    const organizationId = this.requiredUuid(
      payload?.organizationId,
      'organizationId',
    );
    const dossierId = this.requiredUuid(payload?.dossierId, 'dossierId');
    await this.assertMessageAccess(organizationId, dossierId, user.userId);
    await client.join(this.dossierRoom(organizationId, dossierId));
    return { ok: true };
  }

  @SubscribeMessage('client_portal.unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: ClientPortalSocket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const organizationId = this.requiredUuid(
      payload?.organizationId,
      'organizationId',
    );
    const dossierId = this.requiredUuid(payload?.dossierId, 'dossierId');
    await client.leave(this.dossierRoom(organizationId, dossierId));
    return { ok: true };
  }

  publishMessage(
    event: ClientPortalMessageCreatedEvent,
    recipientUserIds: string[],
  ) {
    let target = this.server.to(
      this.dossierRoom(event.organizationId, event.dossierId),
    );
    for (const userId of recipientUserIds) {
      target = target.to(this.userRoom(userId));
    }
    target.emit('client_portal.message.created', event);
  }

  private async assertMessageAccess(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const membership = await this.memberships.findOne({
      where: {
        organizationId,
        userId,
        isActive: true,
        organization: { isActive: true },
      },
      relations: { organization: true, role: { rolePermissions: true } },
    });
    const canViewMessages = membership?.role.rolePermissions.some(
      (permission) =>
        permission.permissionName === PermissionNames.ClientPortalView,
    );
    if (!canViewMessages) {
      throw new WsException(
        'Vous ne disposez pas de la permission nécessaire.',
      );
    }
  }

  private accessToken(client: ClientPortalSocket) {
    const handshakeAuth: unknown = client.handshake.auth;
    const authToken =
      typeof handshakeAuth === 'object' &&
      handshakeAuth !== null &&
      'token' in handshakeAuth
        ? (handshakeAuth as { token?: unknown }).token
        : null;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }
    const authorization = client.handshake.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }
    return null;
  }

  private requiredUuid(value: unknown, field: string) {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new WsException(`${field} invalide.`);
    }
    return value;
  }

  private dossierRoom(organizationId: string, dossierId: string) {
    return `client-portal:${organizationId}:${dossierId}`;
  }

  private userRoom(userId: string) {
    return `client-portal:user:${userId}`;
  }
}
