import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  OrganizationInvitation,
  PasswordResetToken,
  RefreshToken,
  User,
} from '../database/entities';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleIdentityService } from './google-identity.service';
import { JwtStrategy } from './jwt.strategy';
import { MfaService } from './mfa.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SIGNING_KEY'),
      }),
    }),
    EmailModule,
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      OrganizationInvitation,
      PasswordResetToken,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleIdentityService, JwtStrategy, MfaService],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
