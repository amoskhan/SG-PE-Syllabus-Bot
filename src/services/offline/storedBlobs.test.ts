import { describe, it, expect } from 'vitest';
import { encodeBlobs, decodeBlobs, stripBlobs } from './storedBlobs';

const record = () => ({
    id: 'sub-1',
    appleRole: { videoBlob: new Blob(['banana clip'], { type: 'video/mp4' }), videoUrl: 'u', cues: [{ cueIndex: 1, isObserved: true }] },
    bananaRole: { cues: [] as unknown[] },
    firstAttempt: { apple: { videoBlob: new Blob(['first'], { type: 'video/webm' }), cues: [] as unknown[] } },
    createdAt: '2026-10-03T00:00:00Z',
});

describe('storedBlobs', () => {
    it('stores no Blob objects, so phones that refuse them can still save', async () => {
        const encoded = await encodeBlobs(record());
        const hasBlob = (v: unknown): boolean =>
            v instanceof Blob || (!!v && typeof v === 'object' && Object.values(v as object).some(hasBlob));
        expect(hasBlob(encoded)).toBe(false);
    });

    it('gives back the same clips, with their type, after a round trip', async () => {
        const back = await decodeBlobs(await encodeBlobs(record()));
        expect(back.appleRole.videoBlob).toBeInstanceOf(Blob);
        expect(await back.appleRole.videoBlob.text()).toBe('banana clip');
        expect(back.appleRole.videoBlob.type).toBe('video/mp4');
        expect(await back.firstAttempt.apple.videoBlob.text()).toBe('first');
        expect(back.firstAttempt.apple.videoBlob.type).toBe('video/webm');
    });

    it('leaves everything else as it was', async () => {
        const back = await decodeBlobs(await encodeBlobs(record()));
        expect(back.appleRole.cues).toEqual([{ cueIndex: 1, isObserved: true }]);
        expect(back.appleRole.videoUrl).toBe('u');
        expect(back.createdAt).toBe('2026-10-03T00:00:00Z');
    });

    it('reads records saved before, which hold real Blobs', async () => {
        const back = await decodeBlobs(record());
        expect(await back.appleRole.videoBlob.text()).toBe('banana clip');
    });

    it('can drop the clips and keep the rest, when even bytes cannot be stored', () => {
        const stripped = stripBlobs(record());
        expect(stripped.appleRole.videoBlob).toBeUndefined();
        expect(stripped.appleRole.videoUrl).toBe('u');
        expect(stripped.firstAttempt.apple.videoBlob).toBeUndefined();
    });
});
