// Some phones (iPhone Safari) refuse to store Blob objects in IndexedDB but
// accept the same data as raw bytes. Saved records therefore keep each clip as
// { bytes, type } and turn it back into a Blob when read.

interface StoredBlob {
  __storedBlob: true;
  type: string;
  bytes: ArrayBuffer;
}

const isStoredBlob = (v: unknown): v is StoredBlob =>
  !!v && typeof v === 'object' && (v as StoredBlob).__storedBlob === true;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !(v instanceof Blob) && !(v instanceof ArrayBuffer) && !ArrayBuffer.isView(v);

const mapDeep = async (v: unknown, leaf: (v: unknown) => Promise<unknown> | unknown): Promise<unknown> => {
  const replaced = await leaf(v);
  if (replaced !== v) return replaced;
  if (Array.isArray(v)) return Promise.all(v.map(x => mapDeep(x, leaf)));
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = await mapDeep(x, leaf);
    return out;
  }
  return v;
};

/** Every Blob in the record becomes raw bytes plus its type. */
export const encodeBlobs = async <T>(record: T): Promise<T> =>
  (await mapDeep(record, async v =>
    v instanceof Blob ? ({ __storedBlob: true, type: v.type, bytes: await v.arrayBuffer() } satisfies StoredBlob) : v,
  )) as T;

/** Turns stored bytes back into Blobs. Records saved with real Blobs pass through. */
export const decodeBlobs = async <T>(record: T): Promise<T> =>
  (await mapDeep(record, v => (isStoredBlob(v) ? new Blob([v.bytes], { type: v.type }) : v))) as T;

/** The record without any clips: used when the device can't store them at all. */
export const stripBlobs = <T>(record: T): T => {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        if (x instanceof Blob || isStoredBlob(x)) continue;
        out[k] = strip(x);
      }
      return out;
    }
    return v;
  };
  return strip(record) as T;
};
