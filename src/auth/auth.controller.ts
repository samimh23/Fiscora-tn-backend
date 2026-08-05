import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/auth.types';
import { AuthService } from './auth.service';
import {
  AcceptInvitationDto,
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestPasswordResetDto,
  RevokeTokenDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './dto';

@ApiTags('Authentification')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() request: Request,
  ) {
    return this.authService.requestPasswordReset(dto, request.ip);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Body() dto: RevokeTokenDto) {
    return this.authService.revoke(dto);
  }

  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(dto);
  }

  @Get('invitations/:token')
  previewInvitation(@Param('token') token: string) {
    return this.authService.previewInvitation(token);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  me(@CurrentUser() user: JwtUser) {
    return this.authService.me(user.userId);
  }

  @Put('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  updateProfile(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.userId, dto);
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }
}
