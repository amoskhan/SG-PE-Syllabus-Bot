

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

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  isError?: boolean;
  groundingChunks?: GroundingChunk[];
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
}

export const PE_TOPICS = [
  "Primary 4 Learning Outcomes",
  "Secondary Outdoor Education",
  "Pre-U Physical Health Goals",
  "Game-Based Approach",
  "Core Values & CCE",
  "Assessment Framework",
  "Badminton Skills (Sec Level)"
];