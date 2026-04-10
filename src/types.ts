
export enum Sender {
  USER = 'user',
  BOT = 'bot'
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface MediaAttachment {
  id: string;
  type: 'image' | 'video' | 'document';
  mimeType: string;
  data: string; // base64 encoded
  fileName: string;
  thumbnailData?: string; // for video preview
  textContent?: string; // extracted text for documents
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  isError?: boolean;
  groundingChunks?: GroundingChunk[];
  media?: MediaAttachment[];
  poseData?: any[]; // Store pose data for conversation context
  predictedSkill?: string; // Store predicted skill for video overlay
  analysisFrames?: string[]; // Visual proof of analysis (images with skeletons)
  referenceImageURI?: string; // URI of the textbook reference image used
  isAmbiguous?: boolean; // Flag if AI is unsure and needs teacher review
  tokenUsage?: number; // Estimated tokens used for this response
  modelId?: string; // ID of the AI model that generated this message
  hasMedia?: boolean; // Flag if the message/conversation context includes media
  isCached?: boolean; // True if response came from video analysis cache
  studentId?: string; // Student this analysis belongs to
}

export interface Student {
  id: string;
  teacherId: string;
  indexNumber: string;
  name: string;
  class?: string;
  progressSummary: Record<string, string>; // { skillName: summaryText }
  createdAt: Date;
}

export interface SkillAnalysis {
  id: string;
  studentId: string;
  skillName: string;
  videoHash?: string;
  videoUrl?: string;   // Supabase Storage path (not a URL — generate signed URL on demand)
  proficiencyLevel?: string;
  analysisText: string;
  sessionId?: string;
  modelId?: string;
  tokenUsage?: number;
  summarised: boolean;
  createdAt: Date;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export const PE_TOPICS = [
  "Primary 4 Learning Outcomes",
  "Games Concept Approach",
  "Fundamental Movement Skills",
];

export interface CustomRubricLevel {
  id: string; // unique ID for DND
  label: string; // Custom arbitrary label, e.g., "Pray", "Setup", etc.
  originalCriteriaIndices: number[]; // e.g. [0, 1, 2] corresponding to the standard criteria lines in fundamentalMovementSkillsData
}

export interface CustomSkillRubric {
  beginning?: CustomRubricLevel[];
  developing: CustomRubricLevel[];
  competent: CustomRubricLevel[];
  accomplished: CustomRubricLevel[];
}

export interface TeacherProfile {
  id: string;      // maps to Supabase user.id
  email?: string;  
  name?: string;
  avatar_url?: string;
  customRubrics?: Record<string, CustomSkillRubric>; // skillName -> custom rubric
}