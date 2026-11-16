import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeLimitError, withinTimeLimit } from './timeLimit';

afterEach(() => {
  vi.useRealTimers();
});

describe('withinTimeLimit', () => {
  it('gives the result of a step that finishes in time', async () => {
    await expect(withinTimeLimit('save', 1000, Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('fails a step that stalls, once its time is up (#163)', async () => {
    vi.useFakeTimers();
    const stalled = withinTimeLimit('save', 20_000, new Promise(() => {}));
    const outcome = expect(stalled).rejects.toBeInstanceOf(TimeLimitError);
    await vi.advanceTimersByTimeAsync(20_000);
    await outcome;
  });

  it("passes on the step's own error", async () => {
    await expect(withinTimeLimit('save', 1000, Promise.reject(new Error('offline')))).rejects.toThrow('offline');
  });
});
