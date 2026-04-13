import { AsyncLocalStorage } from 'node:async_hooks';

const REQUEST_CONTEXT_SYMBOL = Symbol('request-context');
const REQUEST_AUTH_CONTEXT_SYMBOL = Symbol('request-auth-context');

const requestContextStorage = new AsyncLocalStorage<RequestContextState>();

export interface RequestContextState {
  readonly requestId: string;
  readonly correlationId: string;
  readonly method: string;
  readonly path: string;
  readonly receivedAt: Date;
  readonly origin: string | undefined;
  readonly userAgent: string | undefined;
  readonly clientIpHash: string | undefined;
  readonly actorUserId: string | undefined;
  readonly tenantId: string | undefined;
}

export interface RequestAuthContext {
  readonly authenticatedUser?: {
    readonly id: string;
    readonly email: string;
    readonly platformRole: 'none' | 'superadmin';
  };
  readonly sessionContext?: {
    readonly userId: string;
    readonly tenantId?: string | undefined;
    readonly clientIds: string[];
    readonly mfaVerified: boolean;
  };
  readonly tenantContext?: {
    readonly tenantId: string;
    readonly tenantSlug: string;
    readonly membershipRole:
      | 'agency_owner'
      | 'agency_admin'
      | 'manager'
      | 'analyst'
      | 'client_viewer';
    readonly allowedClientIds: string[];
  };
}

export function runWithRequestContext<T>(
  state: RequestContextState,
  callback: () => T,
): T {
  return requestContextStorage.run(state, callback);
}

export function getRequestContext(): RequestContextState | undefined {
  return requestContextStorage.getStore();
}

export function assignRequestContext(
  carrier: object,
  state: RequestContextState,
): void {
  Reflect.set(carrier, REQUEST_CONTEXT_SYMBOL, state);
}

export function getRequestContextFromCarrier(
  carrier: object,
): RequestContextState | undefined {
  const directValue = Reflect.get(carrier, REQUEST_CONTEXT_SYMBOL);

  if (isRequestContextState(directValue)) {
    return directValue;
  }

  return getRequestContext();
}

export function bindAuthenticatedRequestContext(
  carrier: object,
  authContext: RequestAuthContext,
): void {
  Reflect.set(carrier, REQUEST_AUTH_CONTEXT_SYMBOL, authContext);

  const activeContext = requestContextStorage.getStore();

  if (activeContext === undefined) {
    return;
  }

  requestContextStorage.enterWith({
    ...activeContext,
    actorUserId:
      authContext.authenticatedUser?.id ??
      authContext.sessionContext?.userId ??
      activeContext.actorUserId,
    tenantId: authContext.tenantContext?.tenantId ?? activeContext.tenantId,
  });
}

export function getAuthenticatedRequestContext(
  carrier: object,
): RequestAuthContext | undefined {
  const value = Reflect.get(carrier, REQUEST_AUTH_CONTEXT_SYMBOL);

  if (isRequestAuthContext(value)) {
    return value;
  }

  return undefined;
}

function isRequestContextState(value: unknown): value is RequestContextState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    typeof Reflect.get(value, 'requestId') === 'string' &&
    typeof Reflect.get(value, 'correlationId') === 'string' &&
    typeof Reflect.get(value, 'method') === 'string' &&
    typeof Reflect.get(value, 'path') === 'string' &&
    Reflect.get(value, 'receivedAt') instanceof Date
  );
}

function isRequestAuthContext(value: unknown): value is RequestAuthContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    Reflect.has(value, 'authenticatedUser') ||
    Reflect.has(value, 'sessionContext') ||
    Reflect.has(value, 'tenantContext')
  );
}
