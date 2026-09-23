import { OFFICIAL_FMS_PEER_CUES } from "../../data/peerSyllabusCues";
import { claudeAccessHeaders, PupilAiRequest } from "./aiAccess";

// Matches claudeService.ts. Haiku is enough here: four short, tightly
// formatted calls over 4 frames each, not a full rubric grading.
const MODEL_HAIKU = "claude-haiku-4-5-20251001";

type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface PeerCoachingAIResult {
  studentFeedback: {
    bananaFeedback: string;
    appleFeedback: string;
  };
  teacherReport: {
    bananaAnalysis: string;
    appleAnalysis: string;
    bananaProficiency: "Beginning" | "Developing" | "Competent" | "Excellent";
    appleProficiency: "Beginning" | "Developing" | "Competent" | "Excellent";
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

const VALID_PROFICIENCIES = ["Beginning", "Developing", "Competent", "Excellent"];
const cleanProficiency = (p: string): "Beginning" | "Developing" | "Competent" | "Excellent" =>
  (VALID_PROFICIENCIES.includes(p) ? p : "Developing") as "Beginning" | "Developing" | "Competent" | "Excellent";

const parseTeacherReport = (rawText: string) => {
  try {
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      criteriaScores: Array.isArray(parsed.criteriaScores) ? parsed.criteriaScores : [],
      proficiency: parsed.proficiency || "Developing",
      teacherNotes: parsed.teacherNotes || rawText,
    };
  } catch {
    return { criteriaScores: [], proficiency: "Developing", teacherNotes: rawText || "Analysis not available." };
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
  pair?: { lessonId: string; pairNumber: number }
): Promise<PeerCoachingAIResult> {
  const access: PupilAiRequest | undefined = pair && { ...pair, performer: "pair", purpose: "peer_feedback" };
  const cues = OFFICIAL_FMS_PEER_CUES[skillName] || [];
  const criteriaList = cues.map(c => `${c.itemNumber}. ${c.syllabusCriterion}`).join("\n");

  onProgress?.("Extracting video frames...");
  const [bananaFrames, appleFrames] = await Promise.all([
    bananaVideoBlob ? extractFramesFromBlob(bananaVideoBlob, 4).catch(() => []) : Promise.resolve([]),
    appleVideoBlob ? extractFramesFromBlob(appleVideoBlob, 4).catch(() => []) : Promise.resolve([]),
  ]);

  const bananaPeerSummary = cues.map(c => `${c.syllabusCriterion}: ${bananaCues[c.id] ? "YES" : "NO"}`).join(", ");
  const applePeerSummary = cues.map(c => `${c.syllabusCriterion}: ${appleCues[c.id] ? "YES" : "NO"}`).join(", ");

  const buildStudentParts = (performer: "Apple" | "Banana", frames: string[], peerSummary: string): ClaudeBlock[] => [
    ...frames.map(frameToClaudeBlock).filter((b): b is ClaudeBlock => b !== null),
    {
      type: "text",
      text: `You are a super encouraging PE coach for Singapore primary school students (age 8-12).
Skill: ${skillName}. Peer partner said about ${performer}: ${peerSummary}
${frames.length > 0 ? `You can see ${performer}'s movement frames above.` : ""}

Give ${performer} exactly 1 PRAISE and 1 TIP. Max 2 sentences. Simple words. End with 1 emoji. No rubrics or jargon.
Format: [praise]. [tip] [emoji]`
    }
  ];

  const buildTeacherParts = (performer: "Apple" | "Banana", frames: string[], peerSummary: string): ClaudeBlock[] => [
    ...frames.map(frameToClaudeBlock).filter((b): b is ClaudeBlock => b !== null),
    {
      type: "text",
      text: `You are an expert Singapore MOE PE assessor.
Skill: ${skillName}. Performer: ${performer}. Peer observed: ${peerSummary}
${frames.length > 0 ? "Movement frames shown above." : "No frames � use peer data only."}

MOE 2024 Criteria:
${criteriaList || "Standard FMS criteria."}

Respond ONLY in raw JSON (no markdown):
{"criteriaScores":[{"criterion":"Face Target","met":true}],"proficiency":"Developing","teacherNotes":"2-3 specific teaching recommendations"}
Proficiency: Beginning(0-30%), Developing(31-60%), Competent(61-85%), Excellent(86-100%).`
    }
  ];

  onProgress?.("AI is watching your movements...");

  const [bananaStudentResult, appleStudentResult, bananaTeacherResult, appleTeacherResult] =
    await Promise.allSettled([
      callClaude(buildStudentParts("Banana", bananaFrames, bananaPeerSummary), access),
      callClaude(buildStudentParts("Apple", appleFrames, applePeerSummary), access),
      callClaude(buildTeacherParts("Banana", bananaFrames, bananaPeerSummary), access),
      callClaude(buildTeacherParts("Apple", appleFrames, applePeerSummary), access),
    ]);

  onProgress?.("Building your coaching report...");

  const bananaStudentText = extractText(bananaStudentResult) || `Great effort Banana! Keep practising your ${skillName}! ??`;
  const appleStudentText = extractText(appleStudentResult) || `Awesome work Apple! You are improving with every try! ??`;
  const bananaTeacherRaw = extractText(bananaTeacherResult);
  const appleTeacherRaw = extractText(appleTeacherResult);
  const bananaReport = parseTeacherReport(bananaTeacherRaw);
  const appleReport = parseTeacherReport(appleTeacherRaw);

  const discrepancies: PeerCoachingAIResult["teacherReport"]["discrepancies"] = [];
  cues.forEach(cue => {
    const keyword = cue.syllabusCriterion.toLowerCase().split(" ")[0];
    const peerB = bananaCues[cue.id] ?? false;
    const aiB = bananaReport.criteriaScores.find((s: any) => s.criterion?.toLowerCase().includes(keyword));
    if (aiB !== undefined && aiB.met !== peerB)
      discrepancies.push({ criterion: cue.syllabusCriterion, performer: "Banana", peerSaid: peerB, aiSaid: aiB.met });

    const peerA = appleCues[cue.id] ?? false;
    const aiA = appleReport.criteriaScores.find((s: any) => s.criterion?.toLowerCase().includes(keyword));
    if (aiA !== undefined && aiA.met !== peerA)
      discrepancies.push({ criterion: cue.syllabusCriterion, performer: "Apple", peerSaid: peerA, aiSaid: aiA.met });
  });

  const teacherRecommendations = [
    bananaReport.teacherNotes ? `?? Banana: ${bananaReport.teacherNotes}` : null,
    appleReport.teacherNotes ? `?? Apple: ${appleReport.teacherNotes}` : null,
  ].filter(Boolean).join("\n\n") || "Continue practising with guided peer feedback.";

  return {
    studentFeedback: { bananaFeedback: bananaStudentText, appleFeedback: appleStudentText },
    teacherReport: {
      bananaAnalysis: bananaTeacherRaw,
      appleAnalysis: appleTeacherRaw,
      bananaProficiency: cleanProficiency(bananaReport.proficiency),
      appleProficiency: cleanProficiency(appleReport.proficiency),
      teacherRecommendations,
      discrepancies,
    },
  };
}
