# Smoke Test

Ten minutes of manual checks. CI verifies that the code compiles; this
verifies that the app works. Run it against a Vercel preview URL before
merging anything non-trivial, and against production after a deploy.

There are no automated tests yet, so this is the only thing standing
between a regression and a teacher finding it in a gym.

**Before you start:** one known-good video file of an FMS skill where you
already agree with the grade, and a test Google account.

---

## 1. Loads and signs in — 1 min

- [ ] Page loads with no red errors in the browser console (F12)
- [ ] Sign in with Google completes and returns to the app
- [ ] Your name/avatar appears — confirms `teacher_profiles` was read

Covers: build output, Supabase Auth, `useAuth.ts`.

## 2. Syllabus Q&A — 2 min

- [ ] Ask something vague ("tell me about striking"). Expect **TIER A**:
      clickable chips offering level + area, not a wall of text
- [ ] Click a chip. Expect narrowing, not a restart
- [ ] Ask something specific ("what are the learning outcomes for
      Sec 1 games and sports"). Expect **TIER C**: full outcomes
- [ ] Answer cites real syllabus content, not invented content

Covers: `syllabusContext.ts` section extraction, TIER A/B/C prompt rules,
`/api/gemini`, `[[SKILL_CHOICES]]` parsing in `ChatMessage.tsx`.

## 3. Motion analysis, both phases — 4 min

The highest-risk area. Do not skip.

- [ ] Upload the known-good video. Trim UI appears; pick start/end
- [ ] Skeleton overlay tracks the body through the movement
- [ ] **Phase 1:** four skill guesses appear as chips, and the correct
      skill is among them
- [ ] **Phase 2:** click the right chip. Each criterion is graded
      ✅/❌/⚠️ with frame evidence
- [ ] Proficiency level matches what you would have given
- [ ] Reference image displays for the skill

Covers: MediaPipe landmark extraction, `resolveThrowOrientation()`,
biomechanics report, both prompt phases, `videoDataCacheRef`.

> If Phase 1 offers the wrong four skills, suspect the biomechanics
> report before the prompt — check Arm Trajectory in particular, since
> it is the primary classifier.

## 4. Persistence — 1 min

- [ ] Refresh mid-session. The chat history survives
- [ ] Session appears in the sidebar and reopens correctly
- [ ] Wait ~90s with the tab open, then refresh again

The last one matters: Supabase fires `TOKEN_REFRESHED` roughly every
60s, and a regression in the `user?.id` dependency in `App.tsx` wipes
in-memory video data on each refresh. See CLAUDE.md.

> Known limitation, not a bug: uploaded video is held in an in-memory
> cache, so it is expected to be gone after a hard refresh.

## 5. The other three modes — 2 min

Each mode only needs to open and respond; full flows are not covered here.

- [ ] `teacher_board` — Classroom Board opens, students render
- [ ] `peer_coaching` — Peer session starts, cues load
- [ ] Dashboard — student list renders, grouped by class
- [ ] Return to `home_screen` without a reload

## 5a. Glow and Grow — 8 min

Needs a lesson dated today and a second device (or window) joined as a pair.

**Lesson Planner**

- [ ] An assess step (try both assessment methods) has a Glow and Grow
      checkbox under the cue list, unticked on a new step
- [ ] Tick it. Two starter fields appear: "You did well at" and "Next, try"
- [ ] Reword one starter, clear the other, change a cue's wording, save,
      reopen the lesson. The checkbox and both starters are as you left them
- [ ] A second assess step on the same skill says Glow and Grow is on, as
      set in the first step, and has no checkbox of its own
- [ ] Change that first step's skill, then the lesson's main skill. Each
      time the cue picks and wording clear, and the checkbox and both
      starters stay
- [ ] In a new lesson on a skill you last planned with Glow and Grow on,
      tap "Use the cues from my last … lesson". The cues, the checkbox and
      both starters come across. The button also shows when that last
      lesson set only Glow and Grow

**Tick screen, Glow and Grow on**

- [ ] Before every cue is ticked: no "Tell" card, and "Next: Swap Roles"
      is disabled
- [ ] Tick the last cue. The cue list folds to "N cues ticked" with
      "change", and the "Tell Banana" card appears
- [ ] Glow buttons are the 👍 cues, grow buttons the 👎 cues then "My own
      idea", in the wording you ticked (focus cues only, your own wording,
      extra cues)
- [ ] The starters read as typed; the cleared one shows its default. A
      starter typed with a colon at the end ("You did well at:") shows
      one colon in the sentence, not two
- [ ] Tap "My own idea": a text box opens (80 characters). The next
      button stays disabled until something is typed
- [ ] On an iPad (Safari) and in Chrome, a microphone button sits beside
      the box. Tap it and allow the microphone: it turns red while it
      listens. Say a short idea: the words appear in the box and the
      button goes back to grey when you stop talking. (The app stores no
      audio, but the browser's speech-to-text service may send the audio
      to the browser vendor to transcribe it.)
- [ ] Correct the heard words by typing. Type something first, then use
      the microphone: the heard words are added after it. A long idea
      stops at 80 characters
- [ ] In a browser with no speech-to-text (e.g. Firefox) there is no
      microphone button and typing still works
- [ ] With a glow and a grow chosen, the sentence shows, starting with
      "Banana,", and the next button unlocks
- [ ] Nothing is spoken until "Hear it" is tapped; then the sentence is
      read aloud
- [ ] Tap "change", flip the tick your glow came from. The list folds
      again, that glow is no longer chosen and the next button is disabled
- [ ] Tick every cue 👎: the only glow is "You gave it a go". Tick every
      cue 👍: the only grow is "My own idea"
- [ ] After the swap, Banana gets a "Tell Apple" card, and "Save our
      videos" waits for both picks
- [ ] A re-film: "Keep this new video" waits for every tick and both picks
- [ ] With a glow and an own-idea grow chosen, refresh the page (then try
      leaving for the home screen and coming back). The pair returns to the
      same tick screen with the clip, the ticks, both picks and the typed
      idea as they left them; after the swap, the same for Banana's picks

**Tick screen, Glow and Grow off**

- [ ] A lesson without the setting (and one planned before this feature)
      shows no card, never folds the cue list, and lets the pair move on
      without ticking every cue

**Saved for the teacher (#156): before the database change**

Do these first if `supabase/supabase_glow_grow.sql` has not been run yet.

- [ ] With Glow and Grow on, a pair finishes both turns and taps "Save
      our videos". It saves with no error, and the Review Tray shows the
      clips and ticks as before, with no glow or grow
- [ ] Our progress on the pair's device shows each performer's glow and
      grow under their ticks (from the device's own copy)

**Saved for the teacher: the database change**

- [ ] Run `supabase/supabase_glow_grow.sql` in the Supabase SQL editor,
      outside a lesson. It finishes with no error
- [ ] Run it a second time. Still no error, and saved work is unchanged

**Saved for the teacher: Review Tray and Our progress**

- [ ] With Glow and Grow on, a pair picks a cue as the glow and types an
      own idea as the grow for Banana, swaps, and picks for Apple. Tap
      "Save our videos"
- [ ] On the teacher's device, with that pair already open on the Review
      Tray: Banana's glow and grow appear under Banana's ticks, and
      Apple's under Apple's, without closing and reopening the pair
- [ ] The two lines are labelled "Glow" and "Grow" and read in the wording
      the pupils saw (your own cue wording included). The own idea is
      marked "Own idea"
- [ ] Type an own idea with markup in it (`<b>bold</b> *stars*`). It shows
      as typed, on both screens
- [ ] On the pair's device, Our progress shows each performer's glow and
      grow under their ticks. Refresh, and go Home and back: still there
- [ ] Join the same pair on a device that did not record (same claim):
      Our progress still shows the glow and grow, from the teacher's copy
- [ ] Banana films again with a different glow and grow. Our progress
      shows the new ones under the ticks and the earlier ones in "First
      attempt". The Review Tray shows the same: new ones under the ticks,
      earlier ones with the first attempt
- [ ] Banana submits their final recording. On the pair's device, change
      nothing and submit Apple's: it goes through. Banana's glow and grow
      on the Review Tray are unchanged
- [ ] Tap "Send Back for Re-Do", film Banana again with new picks. The
      new glow and grow replace the old on both screens
- [ ] Open a pair from a lesson without Glow and Grow, and one saved
      before this feature: the Review Tray and Our progress look as they
      always did, with no empty section
- [ ] In the browser's network tab, the requests to `/api/claude` (the
      automatic AI feedback and a Practice Station analysis) contain no
      glow or grow text. No level changes when a glow or grow is saved

Covers: `glowGrow.ts` (rules, saved form), `GlowGrowPanel.tsx`,
`GlowGrowSaid.tsx`, `StepBuilder.tsx`, `glowGrowFor()`, `withSkill()`,
`lastCuePlan()` in `lessonFlow.ts`, `draftPicks()` in `peerDraft.ts`,
`withRefilm()`, `mapRowToSubmission()`, `practiceSessionFrom()` in
`pairWork.ts`, `supabase_glow_grow.sql`.

> The lock, checked by hand: the app never changes a glow and grow after
> a final submission, so this needs a hand-made request. Call
> `pupil_save_submission` (with the lesson pass and the pair's claim
> token) with a changed `glow_grow` entry for a performer who has
> submitted. It must come back `locked`, and the saved entry must stay.
>
> Run the SQL file outside a lesson. If it is run part-way through one in
> which a performer has already submitted, that performer's glow and grow
> (not saved before the file was run) counts as a change, so the pair's
> later saves come back `locked` until a redo request.

## 6. Cron endpoints — 1 min

Not triggered by any user action, so they fail silently. Both run at
23:55 SGT (15:55 UTC) and are guarded by `CRON_SECRET`.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/summarise-progress
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/daily-chat-archive
```

- [ ] Both return 200, not 401 or 500
- [ ] Without the header, both return 401

Or check Vercel dashboard → Logs, filtered to those paths, after 23:55.

---

## Not covered by this checklist

Be aware of the gaps rather than assuming a green run means everything
is fine:

- **Grading quality over time.** A prompt edit that fixes one skill can
  quietly degrade another. One video cannot detect this — that needs an
  eval set with teacher-assigned ground truth.
- **The other LLM providers.** This exercises whichever is selected.
  Bedrock, OpenRouter and DeepSeek paths go untested.
- **PDF upload / RAG ingestion**, offline mode, QR scanning, and rubric
  building.
- **Load and concurrency.** A full class using it at once is untested.
