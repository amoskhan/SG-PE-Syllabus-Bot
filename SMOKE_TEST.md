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

Covers: `syllabusRouter.ts` section routing, `[[SYLLABUS_CONTEXT]]`
injection, `/api/gemini`, `[[SKILL_CHOICES]]` parsing in `ChatMessage.tsx`.

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
