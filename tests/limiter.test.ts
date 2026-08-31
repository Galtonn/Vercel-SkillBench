import { describe, expect, it } from "vitest";

import { createLimiter, mapWithConcurrency } from "@/lib/eval/limiter";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createLimiter", () => {
  it("never exceeds the limit", async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 10 }, () =>
        run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
        }),
      ),
    );

    expect(peak).toBe(2);
  });

  it("treats a limit below one as one, rather than deadlocking", async () => {
    const run = createLimiter(0);
    const results = await Promise.all([run(async () => 1), run(async () => 2)]);

    expect(results).toEqual([1, 2]);
  });

  it("releases its slot when a task throws, so the queue keeps draining", async () => {
    const run = createLimiter(1);

    await expect(run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(run(async () => "next ran")).resolves.toBe("next ran");
  });

  it("admits a queued task as soon as one finishes", async () => {
    const run = createLimiter(1);
    const first = deferred();
    const order: string[] = [];

    const a = run(async () => {
      order.push("a:start");
      await first.promise;
      order.push("a:end");
    });
    const b = run(async () => {
      order.push("b:start");
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(order).toEqual(["a:start"]);

    first.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(["a:start", "a:end", "b:start"]);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const results = await mapWithConcurrency([30, 10, 20, 0], 4, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return `${index}:${delay}`;
    });

    expect(results).toEqual(["0:30", "1:10", "2:20", "3:0"]);
  });

  it("passes the index to the worker", async () => {
    expect(await mapWithConcurrency(["a", "b"], 1, async (item, index) => `${index}${item}`)).toEqual(
      ["0a", "1b"],
    );
  });

  it("returns an empty array for no items", async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it("rejects if any worker rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error("failed on 2");
        return value;
      }),
    ).rejects.toThrow("failed on 2");
  });
});
