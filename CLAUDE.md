# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
yarn install      # Install dependencies
yarn dev          # Start dev server at http://localhost:5173 (accessible on LAN via 0.0.0.0)
yarn build        # Production build → dist/
yarn preview      # Preview production build locally
```

No test or lint commands are configured in package.json.

## Architecture Overview

**SG PE Syllabus Bot** is an AI assistant for Singapore PE teachers, combining RAG-based syllabus Q&A with real-time computer vision motion analysis. It's a full-stack app hosted entirely on Vercel: React frontend + Vercel serverless/edge functions as API proxies.

### Request Flow

All LLM calls go through Vercel serverless functions (`/api/*.ts`) — these proxy requests to external services using server-side API keys. The frontend never calls LLM APIs directly.

```
React (src/) → POST /api/gemini | /api/bedrock | /api/openrouter → LLM response
React (src/) → POST /api/rag-search → Gemini embeddings + Supabase pgvector
React (src/) → POST /api/upload-pdf → pdf-parse → Gemini embeddings → Supabase
```

### LLM Providers

| Endpoint | Model | Purpose |
|---|---|---|
| `/api/gemini.ts` | Gemini 2.5 Flash | Primary Q&A + motion analysis |
| `/api/bedrock.ts` | Claude 3.5 Sonnet (AWS) | Alternative LLM |
| `/api/openrouter.ts` | qwen/qwen3.6-plus:free (text) / gemini-2.5-flash (video) | Alternative LLM |
| `/api/rag-search.ts` | Gemini embeddings + Supabase PGVector | Semantic search |
| `/api/upload-pdf.ts` | pdf-parse + Gemini embeddings | PDF ingestion pipeline |

OpenRouter model selection (`src/services/ai/openRouterService.ts` → `modelMap`):
- Text-only messages → `qwen/qwen3.6-plus:free`
- Messages with video/images → `google/gemini-2.5-flash-preview` (vision required)

### Data Persistence

Dual-write pattern: localStorage (instant UX) + Supabase (cloud sync). On page load, localStorage is loaded first, then merged with Supabase data (Supabase is source of truth for authenticated users).

- **Supabase tables**: `teacher_profiles`, `chat_sessions`, `chat_logs`, `document_chunks` (pgvector)
- **Auth**: Supabase Auth with Google OAuth, handled in `src/hooks/useAuth.ts`

### Syllabus Q&A System

Three-tier intent classification in `src/data/syllabusRouter.ts`:
- **TIER A** (vague queries): Offer level + area choices
- **TIER B** (semi-specific): Offer sub-category choices  
- **TIER C** (specific): Return full outcomes + follow-up suggestions

The entire 2024 PE Syllabus is stored as text in `src/data/syllabusData.ts`. Section routing chunks relevant sections (max 80KB) and injects via `[[SYLLABUS_CONTEXT]]` placeholder in the system instruction. The FMS database with 10 skills and proficiency rubrics is in `src/data/fundamentalMovementSkillsData.ts`.

**Special response tags** the frontend parses:
- `[[SKILL_CHOICES: Option1, Option2]]` → rendered as clickable chip buttons
- `[[DISPLAY_REFERENCE: Skill Name]]` → triggers reference image display

### Motion Analysis System

Browser-native computer vision via MediaPipe (`src/services/vision/poseDetectionService.ts`):
1. MediaPipe Pose Landmarker extracts 33 landmarks per frame from webcam/uploaded video
2. ObjectDetector tracks ball/projectile trajectory
3. Skeleton overlay rendered in `src/components/video/VideoAnalysisPlayer.tsx`
4. Pose data + video frames sent to the LLM for analysis against FMS checklist

Two-phase analysis flow:

**Phase 1 — Skill Identification** (`isVerified = false`)
- Biomechanics report auto-computed from pose landmarks and injected into the LLM prompt
- LLM must respond with `[[SKILL_CHOICES: ...]]` offering 4 skill guesses
- If user pre-filled the "Target Skill" field in `ChatInput`, it's passed as `skillName` and Phase 1 is skipped

**Phase 2 — Grading** (`isVerified = true`, triggered when user clicks a skill chip)
- LLM grades each checklist criterion as ✅/❌/⚠️ with frame evidence
- Applies the smoothness rule: all ✅ but robotic movement → downgrade to Developing
- Proficiency: Beginning (<50% criteria) / Developing (50–80%) / Competent (all criteria) / Excellent (all + exceptional quality)
- If the teacher has saved a custom rubric for the skill (`TeacherProfile.customRubrics[skillName]`), it replaces the standard checklist entirely

#### FMS Skills Reference

10 skills defined in `src/data/fundamentalMovementSkillsData.ts`. Reference images in `public/assets/reference_images/`.

| Skill | Key Biomechanical Distinguisher |
|---|---|
| Underhand Throw | Arm swings low, releases between knee and waist height |
| Underhand Roll | Same as throw but releases ball onto the ground |
| Overhand Throw | Arm swings overhead (above nose), body rotates, arm follows diagonally across body |
| Kick | Dominant leg swings through, non-dominant foot plants beside ball |
| Dribble with hands | One hand pushes down at waist level or below, finger pads |
| Dribble with feet | Short taps with inside of foot, ball stays below head |
| Chest Pass | Two-handed, thumbs on back of ball, extends arms to release |
| Catch above waist | Hands-only catch above waist, arms absorb force inward |
| Bounce pass | Two-handed, ball bounces closer to receiver than sender |
| Bounce | One-hand pushes downward, contacts ball at waist or below |

#### Biomechanics Report Fields

> For a plain-language explanation of how each field maps to physical movement and known limitations per skill, see [BIOMECHANICS.md](BIOMECHANICS.md).

Computed in `src/services/ai/openRouterService.ts` → `sendMessageToOpenRouter`, injected into the LLM prompt before Phase 1:

| Field | How it's computed | What it signals |
|---|---|---|
| Dominant Hand | Whichever wrist (landmark 15 = left, 16 = right) has higher total distance moved across all frames | Which hand is throwing/passing |
| Arm Trajectory | Highest point of dominant wrist vs nose Y (landmark 0) and hip Y (landmark 23/24) | **Primary skill classifier**: OVERHEAD → overhand family; LOW SWING → underhand family; MID-LEVEL → passes/dribble |
| Wind-up | Did dominant wrist drop below hip Y at any frame | Confirms underhand backswing (low) vs overhand backswing (high) |
| Stepping Foot | Whichever ankle (27 = left, 28 = right) moved more on X-axis | Detects coordination errors |
| Coordination | If dominant hand and stepping foot are on the same side → ipsilateral error ❌ | Common beginner mistake |
| Stance | Ankle gap vs shoulder width (landmarks 11/12 = shoulders, 27/28 = ankles) | Checks "feet shoulder-width apart" criterion |
| Knee Bend | Minimum knee angle across all frames, cited with frame number | Checks "knees slightly bent" criterion |
| Step Detection | Stride expansion ratio = maxAnkleDist / initialAnkleDist > 1.2 | Checks "step toward target" criterion |

#### MediaPipe Landmark Index Reference

Key indices used in pose analysis (0-based, from 33-point MediaPipe Pose model):

| Index | Landmark |
|---|---|
| 0 | Nose |
| 11 | Left Shoulder |
| 12 | Right Shoulder |
| 15 | Left Wrist |
| 16 | Right Wrist |
| 23 | Left Hip |
| 24 | Right Hip |
| 27 | Left Ankle |
| 28 | Right Ankle |

Y-axis convention: **0 = top of frame, 1 = bottom**. So a smaller Y value = higher on screen (important when reading arm trajectory logic).

#### Adding or Modifying FMS Skills

1. Add the skill text block to `FUNDAMENTAL_MOVEMENT_SKILLS_TEXT` in `src/data/fundamentalMovementSkillsData.ts` following the `SKILL: Name\n\nPerformance Criteria...` format
2. Add the skill name string to `ALL_FMS_SKILLS` array in the same file
3. Add a reference image path to `SKILL_REFERENCE_IMAGES` (image goes in `public/assets/reference_images/`)
4. Add few-shot grading examples to `src/data/skillExamples.ts` → `getFewShotExamples(skillName)`
5. The skill whitelist in the Phase 1 system prompt (in `openRouterService.ts` ~line 525 and `geminiService.ts`) must also be updated manually

### Key Files

| File | Role |
|---|---|
| `src/App.tsx` | Core app: session management, message routing, video upload orchestration (~900 lines) |
| `src/types.ts` | All TypeScript interfaces: `Message`, `ChatSession`, `TeacherProfile`, `MediaAttachment`, etc. |
| `src/services/ai/aiServiceRegistry.ts` | Factory — selects which LLM service to call based on `selectedModel` |
| `src/services/ai/geminiService.ts` | Gemini 2.5 Flash integration — handles both text Q&A and motion analysis |
| `src/services/ai/openRouterService.ts` | OpenRouter integration — biomechanics report generation + Phase 1/2 prompt assembly |
| `src/services/ai/bedrockService.ts` | AWS Bedrock (Claude 3.5 Sonnet) integration |
| `src/services/vision/poseDetectionService.ts` | MediaPipe wrapper — landmark extraction, pose geometry analysis, ball detection |
| `src/components/video/VideoAnalysisPlayer.tsx` | Video player with canvas overlay — draws skeleton + ball trajectory comet tail |
| `src/components/video/VideoFrameSelector.tsx` | Trim UI — lets user select start/end timestamps before submitting video |
| `src/components/video/CameraRecorder.tsx` | Webcam recording modal |
| `src/components/chat/ChatInput.tsx` | Message composer — file upload, camera, voice input, skill name field |
| `src/components/chat/ChatMessage.tsx` | Renders a single message — parses `[[SKILL_CHOICES]]` into chip buttons |
| `src/data/fundamentalMovementSkillsData.ts` | FMS skill checklists, proficiency rubric, reference image paths |
| `src/data/syllabusData.ts` | Full 2024 MOE PE Syllabus as plain text |
| `src/data/syllabusRouter.ts` | Section boundary definitions for syllabus context chunking |
| `src/data/skillExamples.ts` | Few-shot grading examples injected into Phase 2 prompts |
| `src/hooks/useAuth.ts` | Supabase Auth with Google OAuth |
| `supabase_teacher_profiles.sql` | Full DB schema including RLS policies |

#### `videoDataCacheRef` — Video Re-hydration

`App.tsx` keeps a `useRef<Map<string, string>>` called `videoDataCacheRef`. When a video is uploaded, its base64 string is stored here keyed by a generated `videoId`. When Supabase syncs sessions (which strips binary data from `data` fields), the app re-attaches the base64 from this cache using the `id` on `MediaAttachment`. Without this, videos disappear after a Supabase sync. **The cache is in-memory only and is lost on page refresh.**

#### Auth Token Refresh Caveat

Supabase fires `TOKEN_REFRESHED` on `onAuthStateChange` creating a new `user` object reference each time. The session-fetch `useEffect` in `App.tsx` depends on `user?.id` (stable string), **not** `user` (new object reference on every refresh) — changing this back to `user` will cause sessions to re-fetch and wipe in-memory video data every ~60 seconds.

### Environment Variables

**Vite (browser-visible, `VITE_` prefix):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`, `VITE_OPENROUTER_API_KEY`
- `VITE_AWS_ACCESS_KEY_ID`, `VITE_AWS_SECRET_ACCESS_KEY`, `VITE_AWS_REGION`, `VITE_AWS_BEDROCK_MODEL`

**Serverless functions (Vercel dashboard, no prefix):**
- `GEMINI_API_KEY`, `OPENROUTER_API_KEY`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BEDROCK_MODEL`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGIN` (CORS, e.g. `https://sg-pe-syllabus.vercel.app`)

### Path Aliases

`@/*` resolves to `./src/*` (configured in both `tsconfig.json` and `vite.config.ts`).
