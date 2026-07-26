import { Module } from '@nestjs/common';
import { InvitationMailerService } from './invitation-mailer.service';

@Module({
  providers: [InvitationMailerService],
  exports: [InvitationMailerService],
})
export class EmailModule {}
