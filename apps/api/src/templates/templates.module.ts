import { Module } from '@nestjs/common';

import { WorkflowsModule } from '../workflows/workflows.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [WorkflowsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
