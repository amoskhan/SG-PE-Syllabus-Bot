<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://i.postimg.cc/YCjv3Lpn/Screenshot-2025-12-11-183551.png" />
</div>

# SG PE Syllabus Bot

**AI co-pilot for Physical Education teachers in Singapore**

Combines RAG-based syllabus Q&A, browser-based computer vision motion analysis and a classroom workflow for pupils working in pairs — hosted entirely on Vercel as a React frontend + serverless API proxies.

---

## Features

### Syllabus Q&A
Ask natural-language questions about the 2024 MOE PE Syllabus:
- *"What are the learning outcomes for Primary 4 Gymnastics?"*
- *"Give me a lesson plan for teaching the overhand throw."*
- *"What are the safety guidelines for outdoor education?"*

Three-tier intent classification routes vague queries to clickable choices and specific queries to full outcomes, grounded in the syllabus text. Semantic search over uploaded documents is powered by Gemini embeddings + Supabase pgvector.

### FMS Motion Analysis
Upload a video or record from your camera to get graded feedback on Fundamental Movement Skills.

1. **Pose extraction** — MediaPipe Pose Landmarker tracks 33 landmarks per frame and builds a biomechanics report: camera orientation, throwing arm, arm trajectory, wind-up, backswing height (underhand roll/throw), stepping foot, arm–foot coordination, stance width, knee bend and step detection. See [BIOMECHANICS.md](BIOMECHANICS.md) for how each measure maps to the movement.
2. **Skill identification** — the AI suggests the most likely skills as clickable chips (skip this step by typing the skill name).
3. **Grading** — each checklist criterion is graded ✅ / ❌ / ⚠️ with frame-level evidence. Proficiency is reported as Beginning / Developing / Competent / Excellent.

10 skills supported: Underhand Throw, Underhand Roll, Overhand Throw, Kick, Dribble with Hands, Dribble with Feet, Chest Pass, Catch Above Waist, Bounce Pass, Bounce.

Teachers can save a custom rubric per skill; it replaces the standard checklist.

### Classroom: Lessons, Pairs & Practice Station
- **Lesson planning** — plan each lesson ahead (date, class, level, objective, skill, pairs). Each lesson gets its own class QR code.
- **Pair check-in** — pupils scan the QR on a shared device and work in Apple/Banana pairs. They don't sign in.
- **Peer coaching** — pupils film each other and tick syllabus cues, with automatic AI feedback.
- **Practice Station** — pupils ask for a full AI grading of their clip and send it to the teacher; teacher feedback shows up in the same chat.
- **Classroom Board & Review Tray** — the teacher sees submissions live, names the pupil in each pair, and reviews the AI's grading.
- **Student Dashboard** — each Practice Station analysis is filed under the named pupil, so the dashboard and Review Tray share one record and one teacher review. A nightly job summarises each pupil's progress.

### AI Models & Access

| Endpoint | Model | Who can use it |
|---|---|---|
| `/api/gemini` | Gemini 2.5 Flash | Anyone (server fixes the model and caps output) |
| `/api/claude` | Claude Sonnet / Haiku | Signed-in teachers, or pupils holding today's lesson pass (usage-capped per pair/pupil) |

The server always picks the model and token limits; the browser never calls an LLM API directly.

### Privacy & Pupil Data
- Pupil devices have no direct table access — all pupil writes go through checked Supabase functions and need the lesson pass for a lesson dated **today (Singapore time)**.
- Teachers only see rows they own. Pupil videos are in a private bucket and played through signed URLs.
- Pupil devices never see pupil names.

### Teacher Profiles & Cloud Sync
- Google sign-in via Supabase Auth
- Sessions and chat history saved locally for instant loading, then synced to Supabase (the source of truth when signed in)
- Nightly archive of chat history gives the AI short-term memory of recent conversations
- PDF upload pipeline for adding your own documents to search

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS |
| Computer Vision | Google MediaPipe Tasks Vision (Pose Landmarker, Object Detector) |
| LLMs | Gemini 2.5 Flash, Claude Sonnet / Haiku |
| Vector Search | Supabase pgvector + Gemini embeddings |
| Auth & DB | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Offline | IndexedDB (`idb`) for pupil submissions |
| Tests | Vitest |
| Deployment | Vercel (frontend, serverless/edge API routes, cron jobs) |

---

## Local Development

```bash
yarn install        # Install dependencies
yarn dev            # Dev server at http://localhost:5173 (also on your LAN)
yarn build          # Production build → dist/
yarn preview        # Preview production build
yarn test           # Run unit tests (Vitest)
yarn typecheck:api  # Type-check the api/ functions
```

CI runs the tests on every pull request to `main`. Before merging anything big, also run the manual checks in [SMOKE_TEST.md](SMOKE_TEST.md).

### Environment Variables

**Browser (`VITE_` prefix):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`

**Server (Vercel dashboard):** `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (cron jobs only — never prefix with `VITE_`), `CRON_SECRET`, `ALLOWED_ORIGIN`

### Database

The Supabase schema lives in the `supabase_*.sql` files at the repo root (tables, RLS policies, pupil functions, lesson pass, AI usage limits).

---

## Project Structure

```
src/
├── App.tsx                        # Core app — sessions, message routing, video upload
├── types.ts                       # Shared TypeScript interfaces
├── pages/
│   ├── Dashboard.tsx              # Student Dashboard
│   └── TeacherClassroomBoard.tsx  # Lessons, QR, live submissions, Review Tray
├── components/
│   ├── chat/                      # ChatInput, ChatMessage (skill chips), Markdown
│   ├── video/                     # VideoAnalysisPlayer, VideoFrameSelector, CameraRecorder
│   ├── classroom/                 # LessonPlanner, PairAssignment, QR scanner, check-in
│   ├── peer/                      # PeerCoachingSession
│   ├── dashboard/                 # Student progress, TeacherReviewPanel
│   └── admin/                     # PDF uploader, rubric builder
├── services/
│   ├── ai/                        # geminiService, claudeService, peerCoachingAI, aiAccess
│   ├── vision/                    # poseDetectionService (+ tests)
│   ├── offline/                   # IndexedDB storage for pupil work
│   ├── cloudSyncService.ts        # Supabase sync + pupil_* functions
│   └── lessonService.ts, pairService.ts, studentService.ts, …
├── data/                          # Syllabus text, router, FMS checklists, few-shot examples
└── hooks/                         # useAuth, useSpeechRecognition
api/
├── gemini.ts                      # Gemini proxy
├── claude.ts                      # Claude proxy (teacher sign-in or lesson pass)
├── rag-search.ts                  # Semantic search
├── upload-pdf.ts                  # PDF ingestion
├── get-memory.ts                  # Recent-conversation memory for the AI
├── daily-chat-archive.ts          # Nightly cron: summarise chats
└── summarise-progress.ts          # Nightly cron: summarise pupil progress
```

---

## Resources

- [MOE PE Syllabus (2024)](https://www.moe.gov.sg/primary/curriculum/syllabus)
- [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
- [BIOMECHANICS.md](BIOMECHANICS.md) — how the pose measures work
- [SMOKE_TEST.md](SMOKE_TEST.md) — manual release checks

<div align="center">
  <sub>Created by Amos Khan</sub>
</div>
