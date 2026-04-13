import { webEnvironment } from '../config/env';

type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface HttpRequestOptions<TBody> {
  readonly method?: HttpMethod;
  readonly body?: TBody;
  readonly csrfToken?: string;
  readonly signal?: AbortSignal;
  readonly headers?: HeadersInit;
}

const SAFE_HTTP_METHODS = new Set<HttpMethod>(['GET', 'HEAD']);

export async function httpGet<T>(
  path: string,
  options: Omit<HttpRequestOptions<never>, 'method' | 'body' | 'csrfToken'> = {},
): Promise<T> {
  return httpRequest<T>(path, {
    ...options,
    method: 'GET',
  });
}

export async function httpRequest<TResponse, TBody = unknown>(
  path: string,
  options: HttpRequestOptions<TBody> = {},
): Promise<TResponse> {
  const method = options.method ?? 'GET';

  assertRelativeApiPath(path);

  if (!SAFE_HTTP_METHODS.has(method) && options.csrfToken === undefined) {
    throw new Error('CSRF token is required for state-changing requests.');
  }

  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.csrfToken !== undefined) {
    headers.set('X-CSRF-Token', options.csrfToken);
  }

  const requestInit: RequestInit = {
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
  };

  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  if (options.signal !== undefined) {
    requestInit.signal = options.signal;
  }

  const response = await fetch(buildApiUrl(path), requestInit);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

function buildApiUrl(path: string): string {
  return `${webEnvironment.VITE_API_BASE_URL}${path}`;
}

function assertRelativeApiPath(path: string): void {
  if (!path.startsWith('/')) {
    throw new Error('API path must start with "/".');
  }
}
