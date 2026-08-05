import { Module } from '@nestjs/common';
import { EmailDeliveryLogService } from './email-delivery-log.service';
import { InvitationMailerService } from './invitation-mailer.service';

@Module({
  providers: [InvitationMailerService, EmailDeliveryLogService],
  exports: [InvitationMailerService, EmailDeliveryLogService],
})
export class EmailModule {}
