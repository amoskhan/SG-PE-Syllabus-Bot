import { getSkillCues } from "../../data/peerSyllabusCues";
import { claudeAccessHeaders, PupilAiRequest } from "./aiAccess";
import { Level, normaliseLevel } from "../../utils/gradingReview";

// The AI Peer Check (GLOSSARY.md, #177): an automatic look at a pair's clips
// when they finish a peer assessment, for the teacher only. Pupils get their
// feedback from PE AI Buddy's analysis, never from this.
// Matches claudeService.ts. Haiku is enough here: one short, tightly
// formatted call per performer over 4 frames, not a full rubric grading.
const MODEL_HAIKU = "claude-haiku-4-5-20251001";

type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface PeerCoachingAIResult {
  teacherReport: {
    bananaAnalysis: string;
    appleAnalysis: string;
    // Only where the AI named a level: never filled in for it
    bananaProficiency?: Level;
    appleProficiency?: Level;
    teacherRecommendations: string;
    discrepancies: Array<{
      criterion: string;
      performer: "Apple" | "Banana";
      peerSaid: boolean;
      aiSaid: boolean;
    }>;
  };
}

async function extractFramesFromBlob(blob: Blob, numFrames: number = 4): Promise<string[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const frames: string[] = [];

    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    video.setAttribute("playsinline", "true");

    video.onloadedmetadata = () => {
      const MAX_DIM = 640;
      let w = video.videoWidth || 640;
      let h = video.videoHeight || 480;
      if (w > h) { if (w > MAX_DIM) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; } }
      else { if (h > MAX_DIM) { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; } }
      canvas.width = w;
      canvas.height = h;

      const duration = video.duration || 5;
      const interval = duration / (numFrames + 1);
      let currentFrame = 0;

      const captureNext = () => {
        if (currentFrame >= numFrames) { URL.revokeObjectURL(url); resolve(frames); return; }
        video.currentTime = Math.min(interval * (currentFrame + 0.5), duration - 0.1);
      };

      video.onseeked = () => {
        if (ctx && video.videoWidth > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.8));
        }
        currentFrame++;
        captureNext();
      };

      video.onerror = () => { URL.revokeObjectURL(url); resolve(frames); };
      captureNext();
    };

    video.onerror = () => { URL.revokeObjectURL(url); resolve([]); };
  });
}

function frameToClaudeBlock(dataUrl: string): ClaudeBlock | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
}

/**
 * One Claude call through the /api/claude proxy.
 *
 * This path used to call Gemini straight from the browser with
 * VITE_GEMINI_API_KEY, which ships the key in the bundle — on the student
 * flow, which has no login at all. Going through the proxy keeps the key
 * server-side, the same as every other model path in the app.
 */
async function callClaude(blocks: ClaudeBlock[], access?: PupilAiRequest): Promise<string> {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await claudeAccessHeaders(access)) },
    body: JSON.stringify({
      model: MODEL_HAIKU,
      max_tokens: 1024,
      // Peer feedback should read the same way twice for the same clip.
      temperature: 0.3,
      messages: [{ role: "user", content: blocks }],
    }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error || `Claude API error (${response.status})`);
  }

  const data = await response.json() as { text?: string };
  return data.text || "";
}


const parseTeacherReport = (rawText: string) => {
  try {
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      criteriaScores: Array.isArray(parsed.criteriaScores) ? parsed.criteriaScores : [],
      proficiency: normaliseLevel(String(parsed.proficiency ?? "")) ?? undefined,
      teacherNotes: parsed.teacherNotes || rawText,
    };
  } catch {
    // Not the JSON asked for: its words are still the AI's, but it named no level
    return { criteriaScores: [], proficiency: undefined, teacherNotes: rawText };
  }
};

const extractText = (result: PromiseSettledResult<string>): string =>
  result.status === "fulfilled" ? result.value : "";

export async function runPeerCoachingAnalysis(
  skillName: string,
  bananaVideoBlob: Blob | null,
  appleVideoBlob: Blob | null,
  bananaCues: Record<string, boolean>,
  appleCues: Record<string, boolean>,
  onProgress?: (msg: string) => void,
  // Which lesson and pair is asking — pupils aren't signed in, so /api/claude
  // needs the lesson pass (see aiAccess.ts)
  pair?: { lessonId: string; pairNumber: number },
  // The criteria this lesson focuses on (#136); the feedback leads with them
  focus: string[] = [],
  // A gymnastics lesson's own cues (#150): graded in place of the skill's checklist
  gradeOn?: string[]
): Promise<PeerCoachingAIResult | null> {
  const access: PupilAiRequest | undefined = pair && { ...pair, performer: "pair", purpose: "peer_feedback" };
  const cues = getSkillCues(skillName);
  const criteriaList = gradeOn?.length
    ? gradeOn.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : cues.map(c => `${c.itemNumber}. ${c.syllabusCriterion}`).join("\n");

  onProgress?.("Extracting video frames...");
  const [bananaFrames, appleFrames] = await Promise.all([
    bananaVideoBlob ? extractFramesFromBlob(bananaVideoBlob, 4).catch(() => []) : Promise.resolve([]),
    appleVideoBlob ? extractFramesFromBlob(appleVideoBlob, 4).catch(() => []) : Promise.resolve([]),
  ]);

  // The AI judges from the video alone and never sees the pupils' ticks
  // (docs/adr/0001-ai-never-sees-peer-ticks.md). The ticks are compared with
  // its verdict afterwards, below, to show the teacher where they disagree.
  const buildTeacherParts = (performer: "Apple" | "Banana", frames: string[]): ClaudeBlock[] => [
    ...frames.map(frameToClaudeBlock).filter((b): b is ClaudeBlock => b !== null),
    {
      type: "text",
      text: `You are an expert Singapore MOE PE assessor.
Skill: ${skillName}. Performer: ${performer}. Judge only from the movement frames above.

MOE 2024 Criteria:
${criteriaList || "Standard FMS criteria."}

Respond ONLY in raw JSON (no markdown):
{"criteriaScores":[{"criterion":"Face Target","met":true}],"proficiency":"Developing","teacherNotes":"2-3 specific teaching recommendations"}
Proficiency: Beginning(0-30%), Developing(31-60%), Competent(61-85%), Accomplished(86-100%).`
    }
  ];

  onProgress?.("AI is watching your movements...");

  // No frames means nothing to judge, so that call is skipped and the
  // fallback text below is used.
  const ask = (frames: string[], parts: ClaudeBlock[]) =>
    frames.length > 0 ? callClaude(parts, access) : Promise.resolve("");

  const [bananaTeacherResult, appleTeacherResult] =
    await Promise.allSettled([
      ask(bananaFrames, buildTeacherParts("Banana", bananaFrames)),
      ask(appleFrames, buildTeacherParts("Apple", appleFrames)),
    ]);

  onProgress?.("Building your coaching report...");

  const bananaTeacherRaw = extractText(bananaTeacherResult).trim();
  const appleTeacherRaw = extractText(appleTeacherResult).trim();
  // The AI gave nothing (unavailable, or no frames): nothing is saved, so the
  // teacher sees no result rather than an invented one
  if (!bananaTeacherRaw && !appleTeacherRaw) return null;
  const bananaReport = parseTeacherReport(bananaTeacherRaw);
  const appleReport = parseTeacherReport(appleTeacherRaw);

  const discrepancies: PeerCoachingAIResult["teacherReport"]["discrepancies"] = [];
  cues.forEach(cue => {
    const keyword = cue.syllabusCriterion.toLowerCase().split(" ")[0];
    // A cue the lesson didn't ask pupils to tick has no answer to compare
    const peerB = bananaCues[cue.id];
    const aiB = bananaReport.criteriaScores.find((s: any) => s.criterion?.toLowerCase().includes(keyword));
    if (peerB !== undefined && aiB !== undefined && aiB.met !== peerB)
      discrepancies.push({ criterion: cue.syllabusCriterion, performer: "Banana", peerSaid: peerB, aiSaid: aiB.met });

    const peerA = appleCues[cue.id];
    const aiA = appleReport.criteriaScores.find((s: any) => s.criterion?.toLowerCase().includes(keyword));
    if (peerA !== undefined && aiA !== undefined && aiA.met !== peerA)
      discrepancies.push({ criterion: cue.syllabusCriterion, performer: "Apple", peerSaid: peerA, aiSaid: aiA.met });
  });

  const teacherRecommendations = [
    bananaReport.teacherNotes ? `🍌 Banana: ${bananaReport.teacherNotes}` : null,
    appleReport.teacherNotes ? `🍎 Apple: ${appleReport.teacherNotes}` : null,
  ].filter(Boolean).join("\n\n");

  return {
    teacherReport: {
      bananaAnalysis: bananaTeacherRaw,
      appleAnalysis: appleTeacherRaw,
      bananaProficiency: bananaReport.proficiency,
      appleProficiency: appleReport.proficiency,
      teacherRecommendations,
      discrepancies,
    },
  };
}
