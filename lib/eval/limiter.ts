/**
 * Minimal concurrency limiter. Keeps at most `limit` tasks in flight so an
 * evaluation does not fire dozens of simultaneous model requests.
 */
export function createLimiter(limit: number) {
  const max = Math.max(1, Math.floor(limit));
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active -= 1;
    queue.shift()?.();
  };

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      next();
    }
  };
}

/** Runs `items` through `worker` with bounded concurrency, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const run = createLimiter(limit);
  return Promise.all(items.map((item, index) => run(() => worker(item, index))));
}
