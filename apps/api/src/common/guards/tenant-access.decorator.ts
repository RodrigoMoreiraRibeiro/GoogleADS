import { SetMetadata } from '@nestjs/common';

export interface TenantAccessOptions {
  readonly allowSuperadmin?: boolean;
  readonly requireMfa?: boolean;
  readonly tenantIdParam?: string;
  readonly clientIdParam?: string;
}

export const TENANT_ACCESS_OPTIONS = Symbol('tenant-access-options');

export const RequireTenantAccess = (
  options: TenantAccessOptions = {},
): MethodDecorator & ClassDecorator =>
  SetMetadata(TENANT_ACCESS_OPTIONS, options);
