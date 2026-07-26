import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/auth.types';
import { AuthService } from './auth.service';
import {
  AcceptInvitationDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RevokeTokenDto,
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

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  me(@CurrentUser() user: JwtUser) {
    return this.authService.me(user.userId);
  }
}
