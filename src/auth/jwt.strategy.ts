import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import type { JwtUser } from '../common/auth.types';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SIGNING_KEY'),
      issuer: config.get('JWT_ISSUER', 'accounting-platform'),
      audience: config.get('JWT_AUDIENCE', 'accounting-platform-api'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    const user = await this.users.findOneBy({
      id: payload.sub,
      isActive: true,
    });
    if (!user)
      throw new UnauthorizedException(
        'Le compte est introuvable ou désactivé.',
      );
    return { userId: user.id, email: user.email, fullName: user.fullName };
  }
}
