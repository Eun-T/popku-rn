export const UPLOAD_TIMEOUT_MS = {
  local: 15_000,
  presign: 30_000,
  put: 120_000,
  commit: 60_000,
  cleanup: 10_000,
} as const;

export class RequestTimeoutError extends Error {
  constructor(public readonly stage: string, public readonly timeoutMs: number) {
    super(`${stage} request timed out`);
    this.name = 'RequestTimeoutError';
  }
}

export class RequestCancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'RequestCancelledError';
  }
}

// Do not depend on AbortSignal.throwIfAborted/reason in the native runtime.
export function throwIfRequestAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RequestCancelledError();
}

export async function withRequestTimeout<T>(
  stage: string,
  timeoutMs: number,
  operation: (signal: AbortSignal, onHttpError: (error: Error) => void) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  throwIfRequestAborted(parentSignal);
  const controller = new AbortController();
  let finished = false;
  let httpError: Error | undefined;
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = (error: Error) => {
    if (finished) return;
    finished = true;
    // Preserve a received HTTP rejection even if its diagnostic body stalls.
    rejectAbort(httpError ?? error);
    controller.abort();
  };
  const onCancel = () => abort(new RequestCancelledError());
  const timer = setTimeout(() => abort(new RequestTimeoutError(stage, timeoutMs)), timeoutMs);
  parentSignal?.addEventListener('abort', onCancel);
  try {
    const work = (async () => {
      throwIfRequestAborted(controller.signal);
      const result = await operation(controller.signal, error => { if (!finished) httpError = error; });
      throwIfRequestAborted(controller.signal);
      return result;
    })();
    // Abort the actual fetch AND settle callers when a native/mock Promise ignores abort.
    // Promise.race observes late failures; the cancelled operation cannot publish its result.
    return await Promise.race([work, aborted]);
  } finally {
    finished = true;
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onCancel);
  }
}
