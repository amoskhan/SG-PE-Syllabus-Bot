<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://i.postimg.cc/YCjv3Lpn/Screenshot-2025-12-11-183551.png" />
</div>

# SG PE Syllabus Bot

**AI co-pilot for Physical Education teachers in Singapore**

Combines RAG-based syllabus Q&A with real-time computer vision motion analysis — hosted entirely on Vercel as a React frontend + serverless API proxies.

---

## Features

### Syllabus Q&A
Ask natural-language questions about the 2024 MOE PE Syllabus:
- *"What are the learning outcomes for Primary 4 Gymnastics?"*
- *"Give me a lesson plan for teaching the overhand throw."*
- *"What are the safety guidelines for outdoor education?"*

Three-tier intent classification routes vague queries to specific outcomes without hallucination. Semantic search over the full syllabus is powered by Gemini embeddings + Supabase pgvector.

### FMS Motion Analysis
Upload a video or record from your camera to get graded feedback on Fundamental Movement Skills.

1. **Pose extraction** — MediaPipe tracks 33 landmarks per frame and computes a biomechanics report (dominant hand, arm trajectory, wind-up, step coordination, knee bend, stance width).
2. **Skill identification** — LLM identifies the most likely skill from the biomechanics report (or skip this step by typing the skill name directly).
3. **Grading** — Each checklist criterion is graded ✅ / ❌ / ⚠️ with frame-level evidence. Proficiency is reported as Beginning / Developing / Competent / Excellent.

10 skills supported: Underhand Throw, Underhand Roll, Overhand Throw, Kick, Dribble with Hands, Dribble with Feet, Chest Pass, Catch Above Waist, Bounce Pass, Bounce.

Custom rubrics per skill can be saved to a teacher profile and replace the standard checklist entirely.

### Multi-Model Support
Switch between providers per session:

| Provider | Model | Use |
|---|---|---|
| Gemini | 2.5 Flash | Primary Q&A + motion analysis |
| OpenRouter | Qwen3.6-plus / Gemini 2.5 Flash | Text + vision alternative |
| AWS Bedrock | Claude 3.5 Sonnet | Alternative LLM |

### Teacher Profiles & Cloud Sync
- Google OAuth via Supabase Auth
- Sessions and chat history sync to Supabase (source of truth for authenticated users)
- Custom rubrics saved per skill per teacher
- PDF upload pipeline for ingesting custom documents

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Computer Vision | Google MediaPipe Pose Landmarker |
| LLMs | Gemini 2.5 Flash, Claude 3.5 Sonnet, Qwen3 (OpenRouter) |
| Vector Search | Supabase pgvector + Gemini embeddings |
| Auth & DB | Supabase (PostgreSQL + Auth) |
| Deployment | Vercel (frontend + serverless API routes) |

---

## Local Development

```bash
yarn install   # Install dependencies
yarn dev       # Dev server at http://localhost:5173
yarn build     # Production build → dist/
yarn preview   # Preview production build
```

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
VITE_OPENROUTER_API_KEY=
VITE_AWS_ACCESS_KEY_ID=
VITE_AWS_SECRET_ACCESS_KEY=
VITE_AWS_REGION=
VITE_AWS_BEDROCK_MODEL=
```

For production, set the non-`VITE_` equivalents in the Vercel dashboard (serverless functions read those). Also set `ALLOWED_ORIGIN` to your deployed URL for CORS.

---

## Project Structure

```
src/
├── App.tsx                          # Core app — session management, message routing
├── types.ts                         # All TypeScript interfaces
├── services/
│   ├── ai/
│   │   ├── aiServiceRegistry.ts     # LLM service factory
│   │   ├── geminiService.ts         # Gemini integration
│   │   ├── openRouterService.ts     # OpenRouter + biomechanics report
│   │   └── bedrockService.ts        # AWS Bedrock integration
│   └── vision/
│       └── poseDetectionService.ts  # MediaPipe wrapper
├── data/
│   ├── syllabusData.ts              # Full 2024 MOE PE Syllabus text
│   ├── syllabusRouter.ts            # Three-tier intent classification
│   ├── fundamentalMovementSkillsData.ts  # FMS checklists + rubrics
│   └── skillExamples.ts             # Few-shot grading examples
└── components/
    ├── chat/
    │   ├── ChatInput.tsx            # Message composer
    │   └── ChatMessage.tsx          # Message renderer (parses skill chips)
    └── video/
        ├── VideoAnalysisPlayer.tsx  # Video player + skeleton overlay
        ├── VideoFrameSelector.tsx   # Trim UI
        └── CameraRecorder.tsx       # Webcam recording modal
api/
├── gemini.ts                        # Gemini proxy
├── bedrock.ts                       # Bedrock proxy
├── openrouter.ts                    # OpenRouter proxy
├── rag-search.ts                    # Semantic search endpoint
└── upload-pdf.ts                    # PDF ingestion pipeline
```

---

## Resources

- [MOE PE Syllabus (2024)](https://www.moe.gov.sg/primary/curriculum/syllabus)
- [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)

<div align="center">
  <sub>Created by Amos Khan</sub>
</div>
