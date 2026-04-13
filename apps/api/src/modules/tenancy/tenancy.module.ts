import { Module } from '@nestjs/common';

import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';

@Module({
  providers: [TenantAccessGuard],
  exports: [TenantAccessGuard],
})
export class TenancyModule {}
