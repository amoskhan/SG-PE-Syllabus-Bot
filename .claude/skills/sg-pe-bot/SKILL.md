---
name: sg-pe-bot
description: Master skill for the SG PE Syllabus Bot project. Use for any task involving adding FMS skills, updating the syllabus, deploying, debugging motion analysis, managing Supabase, or understanding the codebase.
user-invocable: true
argument-hint: [task]
---

You are an expert assistant for the **SG PE Syllabus Bot** project — an AI assistant for Singapore PE teachers combining RAG-based syllabus Q&A with real-time computer vision motion analysis. This skill covers every major workflow.

---

## 1. Adding a New FMS Skill

Follow these steps **in order**:

1. **`src/data/fundamentalMovementSkillsData.ts`** — Add a text block to `FUNDAMENTAL_MOVEMENT_SKILLS_TEXT` using the format:
   ```
   SKILL: <Name>

   Performance Criteria:
   1. ...
   2. ...
   ```
   Also add the skill name string to `ALL_FMS_SKILLS` array.

2. **`src/data/fundamentalMovementSkillsData.ts`** — Add the reference image path to `SKILL_REFERENCE_IMAGES`:
   ```ts
   '<Skill Name>': '/assets/reference_images/<skill-name>.png',
   ```
   Place the image in `public/assets/reference_images/`.

3. **`src/data/skillExamples.ts`** — Add few-shot grading examples to `getFewShotExamples(skillName)` for the new skill.

4. **`src/services/ai/openRouterService.ts`** (~line 525) — Add the skill name to the Phase 1 system prompt skill whitelist.

5. **`src/services/ai/geminiService.ts`** — Add the skill name to the same Phase 1 skill whitelist.

---

## 2. Updating the PE Syllabus

- Full syllabus text lives in **`src/data/syllabusData.ts`**.
- Section boundary definitions (for chunking/routing) are in **`src/data/syllabusRouter.ts`**.
- After editing `syllabusData.ts`, check `syllabusRouter.ts` section boundaries still map correctly — they use string offsets / keyword anchors.
- The three-tier intent router (TIER A/B/C) logic is also in `syllabusRouter.ts`; update it if new syllabus areas are added.

---

## 3. Adding or Editing LLM Prompts

| Provider | File |
|---|---|
| Gemini 2.5 Flash | `src/services/ai/geminiService.ts` |
| OpenRouter (Qwen / Gemini vision) | `src/services/ai/openRouterService.ts` |
| AWS Bedrock (Claude 3.5 Sonnet) | `src/services/ai/bedrockService.ts` |

- The `[[SYLLABUS_CONTEXT]]` placeholder in system instructions is replaced at runtime with chunked syllabus text.
- Phase 1 (skill identification) and Phase 2 (grading) prompts are assembled separately — edit each phase's prompt builder independently.
- Special response tags parsed by the frontend: `[[SKILL_CHOICES: ...]]`, `[[DISPLAY_REFERENCE: ...]]`.

---

## 4. Deploying to Vercel

```bash
yarn build          # Verify production build passes first
vercel --prod       # Deploy to production
```

- API keys for serverless functions are set in the **Vercel dashboard** (not `.env`) — never in `VITE_` prefixed vars.
- Serverless functions live in `api/*.ts`. Each is an independent Edge/Node function.
- `ALLOWED_ORIGIN` must match the deployed URL for CORS.

---

## 5. Local Development

```bash
yarn install        # Install dependencies
yarn dev            # Dev server at http://localhost:5173 (LAN-accessible)
yarn build          # Production build → dist/
yarn preview        # Preview production build
```

No test or lint commands are configured. TypeScript errors surface via `yarn build`.

---

## 6. Debugging Motion Analysis

**Data flow:**
```
Webcam/Video → MediaPipe (poseDetectionService.ts) → 33 landmarks/frame
→ Biomechanics report (openRouterService.ts) → LLM Phase 1 → [[SKILL_CHOICES]]
→ User selects skill → LLM Phase 2 → graded checklist
```

**Key debug points:**
- Landmark extraction: `src/services/vision/poseDetectionService.ts`
- Biomechanics report fields (dominant hand, arm trajectory, wind-up, etc.): `openRouterService.ts` → `sendMessageToOpenRouter`
- Y-axis convention: **0 = top, 1 = bottom** (inverted from screen intuition)
- Arm trajectory classifier: compare dominant wrist Y vs nose Y (landmark 0) and hip Y (landmarks 23/24)
- Phase 1 skip condition: user pre-filled "Target Skill" → `skillName` passed directly, Phase 1 bypassed

**Skeleton overlay / video player issues:**
- Canvas overlay rendering: `src/components/video/VideoAnalysisPlayer.tsx`
- Ball trajectory comet tail also rendered there

---

## 7. Supabase / Database

**Tables:** `teacher_profiles`, `chat_sessions`, `chat_logs`, `document_chunks` (pgvector)

Full schema + RLS policies: `supabase_teacher_profiles.sql`

**Dual-write pattern:** localStorage (instant) + Supabase (cloud). On load: localStorage first, then merge with Supabase (Supabase wins for authenticated users).

**Auth:** Google OAuth via Supabase Auth — `src/hooks/useAuth.ts`

**Token refresh caveat:** The session-fetch `useEffect` in `App.tsx` must depend on `user?.id` (stable string), NOT `user` object (new reference on every `TOKEN_REFRESHED` event). Using `user` directly re-fetches sessions every ~60s and wipes in-memory video data.

**`videoDataCacheRef`:** In-memory `Map<videoId, base64>` in `App.tsx`. Supabase sync strips binary data — the cache re-attaches base64 on sync using `MediaAttachment.id`. Cache is lost on page refresh by design.

---

## 8. PDF Ingestion Pipeline

```
POST /api/upload-pdf → pdf-parse → Gemini embeddings → Supabase document_chunks (pgvector)
POST /api/rag-search → Gemini embeddings query → pgvector similarity search
```

Edit `api/upload-pdf.ts` or `api/rag-search.ts` for pipeline changes.

---

## 9. Environment Variables Reference

| Variable | Where set | Used by |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env` | Frontend Supabase client |
| `VITE_GEMINI_API_KEY` | `.env` | Direct Gemini calls (dev only) |
| `VITE_OPENROUTER_API_KEY` | `.env` | Direct OpenRouter calls (dev only) |
| `VITE_AWS_*` | `.env` | Bedrock (dev only) |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | Vercel dashboard | Serverless functions |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BEDROCK_MODEL` | Vercel dashboard | Bedrock serverless |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Vercel dashboard | Serverless Supabase |
| `ALLOWED_ORIGIN` | Vercel dashboard | CORS for API routes |

---

## 10. Key Files Quick Reference

| File | Role |
|---|---|
| `src/App.tsx` | Core app: session management, message routing, video orchestration |
| `src/types.ts` | All TypeScript interfaces |
| `src/services/ai/aiServiceRegistry.ts` | LLM service factory |
| `src/data/syllabusData.ts` | Full 2024 MOE PE Syllabus text |
| `src/data/syllabusRouter.ts` | Three-tier intent classification + section chunking |
| `src/data/fundamentalMovementSkillsData.ts` | FMS checklists, proficiency rubric, reference image paths |
| `src/data/skillExamples.ts` | Few-shot grading examples |
| `src/services/vision/poseDetectionService.ts` | MediaPipe wrapper |
| `src/components/video/VideoAnalysisPlayer.tsx` | Video player + skeleton overlay |
| `src/components/chat/ChatMessage.tsx` | Renders messages, parses `[[SKILL_CHOICES]]` chips |
| `supabase_teacher_profiles.sql` | Full DB schema + RLS |

---

When the user invokes `/sg-pe-bot [task]`, identify which section above applies and execute it step-by-step, reading the relevant files before making changes.
