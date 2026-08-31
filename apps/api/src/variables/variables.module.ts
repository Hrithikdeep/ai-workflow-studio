import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VariablesService } from './variables.service';
import { VariablesController } from './variables.controller';

@Module({
  imports: [PrismaModule],
  providers: [VariablesService],
  controllers: [VariablesController],
})
export class VariablesModule {}
