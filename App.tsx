
import React, { useState, useRef, useEffect } from 'react';
import { Content, Part } from '@google/genai';
import { Analytics } from "@vercel/analytics/react";
import Header from './components/Header';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import { Message, Sender, PE_TOPICS } from './types';
import { sendMessageToGemini } from './services/geminiService';
import { sendMessageToBedrock } from './services/bedrockService';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      text: "Hello! I am your **Singapore PE Syllabus Assistant**. I can help you with anything related to the **PE Syllabus (2024)** and **Fundamental Movement Skills** (e.g., overhand throw, kick). How can I help you today?",
      sender: Sender.BOT,
      timestamp: new Date(),
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'bedrock'>('gemini');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: Sender.USER,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setIsLoading(true);

    try {
      let response;

      if (selectedModel === 'gemini') {
        // Convert internal message format to Gemini Content format
        const history: Content[] = messages.map(m => ({
          role: m.sender === Sender.USER ? 'user' : 'model',
          parts: [{ text: m.text } as Part]
        }));

        // Add the new user message to history (gemini 2.5 flash handles context well)
        history.push({
          role: 'user',
          parts: [{ text }]
        });

        response = await sendMessageToGemini(history, text);
      } else {
        // Bedrock uses a simpler format
        const history = messages.map(m => ({
          role: m.sender === Sender.USER ? 'user' : 'assistant',
          content: m.text
        }));

        response = await sendMessageToBedrock(history, text);
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: Sender.BOT,
        timestamp: new Date(),
        groundingChunks: selectedModel === 'gemini' ? response.groundingChunks : undefined
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        sender: Sender.BOT,
        timestamp: new Date(),
        isError: true
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (topic: string) => {
    handleSendMessage(`Tell me about ${topic}`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header />

      {/* Model Selector */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">AI Model:</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
              <button
                onClick={() => setSelectedModel('gemini')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'gemini'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🔷 Gemini
              </button>
              <button
                onClick={() => setSelectedModel('bedrock')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'bedrock'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🟠 Bedrock
              </button>
            </div>
          </div>
          <span className="text-xs text-slate-400">
            {selectedModel === 'gemini' ? 'Google Gemini 2.5 Flash' : 'Claude 3.5 Sonnet'}
          </span>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
        <div className="max-w-4xl mx-auto">

          {/* Welcome Chips (Only show if history is short) */}
          {messages.length < 2 && (
            <div className="mb-8 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 ml-1">Explore the Syllabus</h2>
              <div className="flex flex-wrap gap-2">
                {PE_TOPICS.map((topic, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleChipClick(topic)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-all shadow-sm"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {isLoading && (
            <div className="flex justify-start mb-6 animate-pulse">
              <div className="flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                </div>
                <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm text-slate-500 text-sm flex items-center gap-1">
                  Thinking <span className="typing-dot">.</span><span className="typing-dot">.</span><span className="typing-dot">.</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      <Analytics />
    </div>
  );
};

export default App;
