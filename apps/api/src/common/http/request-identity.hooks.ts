import { createHash, randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { ApiEnvironment } from '../config/environment';
import {
  assignRequestContext,
  runWithRequestContext,
  type RequestContextState,
} from './request-context';

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';
const MAX_INBOUND_ID_LENGTH = 128;

export function registerSecurityRequestHooks(
  app: FastifyInstance,
  env: ApiEnvironment,
): void {
  app.addHook('onRequest', (request, reply, done) => {
    const requestId = readSafeInboundId(request, REQUEST_ID_HEADER);
    const correlationId = readSafeInboundId(request, CORRELATION_ID_HEADER);
    const requestContext = buildRequestContext(
      request,
      env,
      requestId,
      correlationId ?? requestId,
    );

    assignRequestContext(request, requestContext);
    reply.header(REQUEST_ID_HEADER, requestContext.requestId);
    reply.header(CORRELATION_ID_HEADER, requestContext.correlationId);

    runWithRequestContext(requestContext, done);
  });
}

function buildRequestContext(
  request: FastifyRequest,
  env: ApiEnvironment,
  requestId: string,
  correlationId: string,
): RequestContextState {
  return {
    requestId,
    correlationId,
    method: request.method.toUpperCase(),
    path: stripQueryString(request.url),
    receivedAt: new Date(),
    origin: readOptionalHeader(request, 'origin'),
    userAgent: trimOptionalValue(readOptionalHeader(request, 'user-agent'), 256),
    clientIpHash: hashClientIp(request.ip, env.APP_HASH_PEPPER),
    actorUserId: undefined,
    tenantId: undefined,
  };
}

function readSafeInboundId(
  request: FastifyRequest,
  headerName: string,
): string {
  const headerValue = readOptionalHeader(request, headerName);

  if (headerValue === undefined) {
    return randomUUID();
  }

  if (
    headerValue.length > MAX_INBOUND_ID_LENGTH ||
    !/^[a-zA-Z0-9._:-]+$/u.test(headerValue)
  ) {
    return randomUUID();
  }

  return headerValue;
}

function readOptionalHeader(
  request: FastifyRequest,
  headerName: string,
): string | undefined {
  const headerValue = request.headers[headerName];

  if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  if (Array.isArray(headerValue)) {
    const firstValue = headerValue.find(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );

    return typeof firstValue === 'string' ? firstValue.trim() : undefined;
  }

  return undefined;
}

function stripQueryString(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
}

function hashClientIp(
  requestIp: string | undefined,
  pepper: string,
): string | undefined {
  if (typeof requestIp !== 'string' || requestIp.trim().length === 0) {
    return undefined;
  }

  return createHash('sha256')
    .update(pepper)
    .update(':')
    .update(requestIp.trim())
    .digest('hex');
}

function trimOptionalValue(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
