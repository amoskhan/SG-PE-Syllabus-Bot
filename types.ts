
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
  "Games Concept Approach",
  "Fundamental Movement Skills",
];