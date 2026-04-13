import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { getAuthenticatedRequestContext } from '../http/request-context';
import {
  TENANT_ACCESS_OPTIONS,
  type TenantAccessOptions,
} from './tenant-access.decorator';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<TenantAccessOptions>(
      TENANT_ACCESS_OPTIONS,
      [context.getHandler(), context.getClass()],
    );

    if (options === undefined) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    const authContext = getAuthenticatedRequestContext(request);

    if (
      authContext?.authenticatedUser === undefined ||
      authContext.sessionContext === undefined ||
      authContext.tenantContext === undefined
    ) {
      throw new UnauthorizedException(
        'Authenticated tenant context is required.',
      );
    }

    if (options.requireMfa && !authContext.sessionContext.mfaVerified) {
      throw new ForbiddenException(
        'MFA verification is required for this action.',
      );
    }

    if (authContext.authenticatedUser.platformRole === 'superadmin') {
      if (options.allowSuperadmin === true) {
        return true;
      }

      throw new ForbiddenException(
        'Superadmin access requires explicit support-mode authorization.',
      );
    }

    const tenantIdFromRoute = readRouteParam(request, options.tenantIdParam);

    if (
      tenantIdFromRoute !== undefined &&
      tenantIdFromRoute !== authContext.tenantContext.tenantId
    ) {
      throw new ForbiddenException('Cross-tenant access is not allowed.');
    }

    const clientIdFromRoute = readRouteParam(request, options.clientIdParam);
    const allowedClientIds = authContext.tenantContext.allowedClientIds;

    if (
      authContext.tenantContext.membershipRole === 'client_viewer' &&
      allowedClientIds.length === 0
    ) {
      throw new ForbiddenException(
        'Client viewer access requires an explicit client scope.',
      );
    }

    if (
      clientIdFromRoute !== undefined &&
      allowedClientIds.length > 0 &&
      !allowedClientIds.includes(clientIdFromRoute)
    ) {
      throw new ForbiddenException(
        'The authenticated user does not have access to this client scope.',
      );
    }

    return true;
  }
}

function readRouteParam(
  request: Record<string, unknown>,
  paramName: string | undefined,
): string | undefined {
  if (paramName === undefined) {
    return undefined;
  }

  const params = request.params;

  if (typeof params !== 'object' || params === null) {
    return undefined;
  }

  const paramValue = Reflect.get(params, paramName);

  return typeof paramValue === 'string' && paramValue.length > 0
    ? paramValue
    : undefined;
}
