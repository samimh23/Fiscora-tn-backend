import { Module } from '@nestjs/common';
import { FiscalWorkflowService } from './fiscal-workflow.service';

@Module({
  providers: [FiscalWorkflowService],
  exports: [FiscalWorkflowService],
})
export class FiscalWorkflowModule {}
