import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { OpenAiAdapter } from './adapters/openai.adapter';

/**
 * Isolated AI provider layer (Step 3).
 *
 * Intentionally NOT imported by `AppModule` or `ExecutionsModule` yet — the
 * execution engine wiring (`AiNodeExecutor`, `AI_PROMPT` dispatch) is Step 4.
 * Kept as a standalone module so it compiles and unit-tests on its own.
 */
@Module({
  providers: [AiService, OpenAiAdapter],
  exports: [AiService],
})
export class AiModule {}
