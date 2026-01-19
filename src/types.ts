
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
  type: 'image' | 'video';
  mimeType: string;
  data: string; // base64 encoded
  fileName: string;
  thumbnailData?: string; // for video preview
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