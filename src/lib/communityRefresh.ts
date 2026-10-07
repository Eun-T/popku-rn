// Measured from gesture start, rather than adding a fixed delay after the API.
export function waitForCommunityRefresh(startedAt: number, signal: AbortSignal): Promise<void> {
  const remaining = Math.max(0, 1000 - (Date.now() - startedAt));
  if (!remaining || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, remaining);
    signal.addEventListener('abort', finish, { once: true });
  });
}
