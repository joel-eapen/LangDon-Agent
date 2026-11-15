import {
  APIConnectionError,
  AuthenticationError,
  RateLimitError,
  SDKError,
} from '@tiny-fish/sdk';

export function describeTinyFishError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof AuthenticationError) {
    return {
      category: 'authentication',
      message: 'TinyFish authentication failed',
      detail: message,
    };
  }

  if (error instanceof RateLimitError) {
    return {
      category: 'rate_limit',
      message: 'TinyFish rate limit exceeded',
      detail: message,
    };
  }

  if (error instanceof APIConnectionError) {
    return {
      category: 'connection',
      message: 'TinyFish connection failed',
      detail: message,
    };
  }

  if (error instanceof SDKError) {
    return {
      category: 'sdk',
      message: 'TinyFish SDK request failed',
      detail: message,
    };
  }

  return {
    category: 'unknown',
    message: 'Unexpected TinyFish error',
    detail: message,
  };
}
