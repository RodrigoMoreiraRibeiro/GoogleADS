import { Injectable } from '@nestjs/common';

import type {
  GoogleAdsSyncErrorContext,
  GoogleAdsSyncFailureClass,
} from '../domain/google-ads-sync.types';

export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly failureClass: GoogleAdsSyncFailureClass;
  readonly nextDelayMs?: number;
}

@Injectable()
export class GoogleAdsSyncRetryPolicyService {
  public decide(
    attemptNumber: number,
    maxAttempts: number,
    error: GoogleAdsSyncErrorContext,
  ): RetryDecision {
    const failureClass = this.classifyFailure(error);
    const retryable = this.isRetryable(error, failureClass);

    if (!retryable || attemptNumber >= maxAttempts) {
      return {
        shouldRetry: false,
        failureClass:
          retryable && attemptNumber >= maxAttempts
            ? 'retry_exhausted'
            : failureClass,
      };
    }

    return {
      shouldRetry: true,
      failureClass,
      nextDelayMs: this.calculateBackoffMs(attemptNumber, error),
    };
  }

  private classifyFailure(
    error: GoogleAdsSyncErrorContext,
  ): GoogleAdsSyncFailureClass {
    const code = error.code ?? error.grpcStatusCode ?? '';

    if (
      code.includes('OAUTH') ||
      code.includes('UNAUTHENTICATED') ||
      code.includes('AUTH')
    ) {
      return 'auth';
    }

    if (
      code.includes('RESOURCE_EXHAUSTED') ||
      code.includes('QUOTA') ||
      code.includes('RATE')
    ) {
      return 'quota';
    }

    if (
      code.includes('INVALID') ||
      code.includes('FAILED_PRECONDITION') ||
      code.includes('PERMISSION_DENIED')
    ) {
      return 'validation';
    }

    if (code.includes('TIMEOUT') || code.includes('UNAVAILABLE')) {
      return 'sync';
    }

    return 'unknown';
  }

  private isRetryable(
    error: GoogleAdsSyncErrorContext,
    failureClass: GoogleAdsSyncFailureClass,
  ): boolean {
    if (typeof error.isRetryable === 'boolean') {
      return error.isRetryable;
    }

    if (failureClass === 'auth' || failureClass === 'validation') {
      return false;
    }

    const code = error.code ?? error.grpcStatusCode ?? '';

    return [
      'UNAVAILABLE',
      'DEADLINE_EXCEEDED',
      'INTERNAL',
      'RESOURCE_EXHAUSTED',
      'TIMEOUT',
      'ECONNRESET',
    ].some((retryableCode) => code.includes(retryableCode));
  }

  private calculateBackoffMs(
    attemptNumber: number,
    error: GoogleAdsSyncErrorContext,
  ): number {
    const code = error.code ?? error.grpcStatusCode ?? '';

    if (code.includes('RESOURCE_EXHAUSTED')) {
      const quotaDelays = [5 * 60_000, 15 * 60_000, 60 * 60_000];
      const quotaDelay =
        quotaDelays[Math.min(attemptNumber - 1, quotaDelays.length - 1)];

      return quotaDelay ?? 60 * 60_000;
    }

    const baseDelayMs = 30_000;
    const exponentialDelayMs = baseDelayMs * Math.pow(2, attemptNumber - 1);
    const cappedDelayMs = Math.min(exponentialDelayMs, 30 * 60_000);
    const jitterMs = Math.floor(cappedDelayMs * 0.25);

    return cappedDelayMs + jitterMs;
  }
}
