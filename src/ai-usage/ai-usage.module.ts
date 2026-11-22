import { Global, Module } from '@nestjs/common';
import { AiUsageRecorder } from './ai-usage.recorder';

/** Global so every AI client can record its calls without import chains. */
@Global()
@Module({
  providers: [AiUsageRecorder],
  exports: [AiUsageRecorder],
})
export class AiUsageModule {}
