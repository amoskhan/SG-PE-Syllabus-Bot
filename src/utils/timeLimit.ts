// A pupil's iPad on school Wi-Fi can wait forever on a request that has
// stalled, which looks like the app hanging (#163). Each network step a pupil
// waits on is given a time limit, after which it counts as failed: their work
// is still safe on the iPad and can be sent again.

/** A save or read of the pair's record. */
export const SAVE_TIME_LIMIT_MS = 20_000;
/** One clip upload: room for a ~10 MB clip on slow Wi-Fi. */
export const CLIP_TIME_LIMIT_MS = 120_000;

export class TimeLimitError extends Error {
  constructor(step: string, ms: number) {
    super(`${step} took longer than ${Math.round(ms / 1000)}s`);
    this.name = 'TimeLimitError';
  }
}

/** The step's result, or a TimeLimitError if it hasn't finished within `ms`. */
export const withinTimeLimit = <T>(step: string, ms: number, work: PromiseLike<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeLimitError(step, ms)), ms);
  });
  return Promise.race([Promise.resolve(work), timedOut]).finally(() => clearTimeout(timer));
};
