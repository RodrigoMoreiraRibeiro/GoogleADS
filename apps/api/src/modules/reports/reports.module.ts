import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { ExecutiveReportDeckBuilderService } from './application/executive-report-deck-builder.service';
import { LocalExecutiveReportService } from './application/local-executive-report.service';
import { LocalExecutiveReportController } from './presentation/http/local-executive-report.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [LocalExecutiveReportController],
  providers: [
    ExecutiveReportDeckBuilderService,
    LocalExecutiveReportService,
  ],
})
export class ReportsModule {}
