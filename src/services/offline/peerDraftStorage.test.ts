import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { clearPeerDrafts, deletePeerDraft, getPeerDraft, putPeerDraft } from './offlineStorage';
import { PeerDraft, peerDraftId } from '../../utils/peerDraft';

const draft = (over: Partial<PeerDraft> = {}): PeerDraft => ({
    id: peerDraftId('L1', 2, 'Shoulder Stand'),
    lessonId: 'L1',
    pairNumber: 2,
    skillName: 'Shoulder Stand',
    step: 'APPLE_REVIEW',
    bananaVideoBlob: new Blob(['banana clip'], { type: 'video/mp4' }),
    bananaCues: { 'shoulder-stand-1': true },
    bananaPoseFrames: ['data:image/jpeg;base64,AAAA'],
    appleCues: {},
    applePoseFrames: [],
    savedAt: new Date().toISOString(),
    ...over,
});

describe('peer draft storage', () => {
    it('gives back the clip, ticks and screen that were saved', async () => {
        await putPeerDraft(draft());
        const back = await getPeerDraft(peerDraftId('L1', 2, 'Shoulder Stand'));
        expect(back?.step).toBe('APPLE_REVIEW');
        expect(back?.bananaCues).toEqual({ 'shoulder-stand-1': true });
        expect(back?.bananaVideoBlob).toBeInstanceOf(Blob);
        expect(await back!.bananaVideoBlob!.text()).toBe('banana clip');
        expect(back?.appleVideoBlob).toBeUndefined();
    });

    it('gives back the glow and grow with the clip and ticks', async () => {
        const bananaPicks = {
            glow: { source: { kind: 'cue' as const, itemNumber: 1 }, text: 'Hands hold the lower back, elbows on the mat' },
            grow: { source: { kind: 'own' as const }, text: 'Point your toes' },
        };
        await putPeerDraft(draft({ id: 'draft-picks', bananaPicks, applePicks: {} }));
        const back = await getPeerDraft('draft-picks');
        expect(back?.bananaPicks).toEqual(bananaPicks);
        expect(back?.applePicks).toEqual({});
        expect(back?.bananaCues).toEqual({ 'shoulder-stand-1': true });
        expect(await back!.bananaVideoBlob!.text()).toBe('banana clip');
    });

    it('gives back a draft saved before Glow and Grow, with no picks', async () => {
        const back = await getPeerDraft(peerDraftId('L1', 2, 'Shoulder Stand'));
        expect(back?.bananaCues).toEqual({ 'shoulder-stand-1': true });
        expect(back?.bananaPicks).toBeUndefined();
    });

    it('saves a draft that has ticks but no clip', async () => {
        await putPeerDraft(draft({ id: 'draft-ticks', bananaVideoBlob: undefined }));
        expect((await getPeerDraft('draft-ticks'))?.bananaCues).toEqual({ 'shoulder-stand-1': true });
    });

    it('has nothing for another pair', async () => {
        expect(await getPeerDraft(peerDraftId('L1', 3, 'Shoulder Stand'))).toBeUndefined();
    });

    it('drops a draft from another day', async () => {
        await putPeerDraft(draft({ id: 'draft-old', savedAt: '2020-01-01T00:00:00Z' }));
        expect(await getPeerDraft('draft-old')).toBeUndefined();
    });

    it('deletes one draft, or all of them', async () => {
        await putPeerDraft(draft({ id: 'draft-a' }));
        await putPeerDraft(draft({ id: 'draft-b' }));
        await deletePeerDraft('draft-a');
        expect(await getPeerDraft('draft-a')).toBeUndefined();
        expect(await getPeerDraft('draft-b')).toBeDefined();
        await clearPeerDrafts();
        expect(await getPeerDraft('draft-b')).toBeUndefined();
    });
});
