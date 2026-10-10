import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDB } from 'idb';
import { getActivePairSession, getPeerDraft, putPeerDraft, saveActivePairSession } from './offlineStorage';
import { PeerDraft } from '../../utils/peerDraft';

// Another tab of the site, left open on older code, holds the device database
// open and never lets go. The app must still read and write (it hung, silently,
// when a release raised the database's version).

const withinASecond = <T,>(work: Promise<T>): Promise<T | 'HUNG'> =>
    Promise.race([work, new Promise<'HUNG'>(resolve => setTimeout(() => resolve('HUNG'), 1000))]);

describe('with an old tab holding the device database open', () => {
    it('still saves and reads the pair, and a draft', async () => {
        const oldTab = await openDB('sg_pe_partner_coach_db', 2, {
            upgrade(db) {
                db.createObjectStore('pair_session');
                db.createObjectStore('submissions', { keyPath: 'id' });
                db.createObjectStore('lesson_cache');
            },
        });

        const pair = { pairNumber: 12, lessonId: 'L1', pairPhoto: '', checkedInAt: '2026-10-11T00:00:00Z', needsHelp: false };
        expect(await withinASecond(saveActivePairSession(pair).then(() => 'saved'))).toBe('saved');
        expect(await withinASecond(getActivePairSession())).toEqual(pair);

        const draft: PeerDraft = {
            id: 'draft-1', lessonId: 'L1', pairNumber: 12, skillName: 'Shoulder Stand', step: 'APPLE_REVIEW',
            bananaVideoBlob: new Blob(['clip'], { type: 'video/mp4' }),
            bananaCues: {}, bananaPoseFrames: [], appleCues: {}, applePoseFrames: [], savedAt: new Date().toISOString(),
        };
        expect(await withinASecond(putPeerDraft(draft).then(() => 'saved'))).toBe('saved');
        const back = await withinASecond(getPeerDraft('draft-1'));
        expect(back).not.toBe('HUNG');
        expect((back as PeerDraft).step).toBe('APPLE_REVIEW');

        oldTab.close();
    });
});
