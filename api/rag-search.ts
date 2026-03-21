import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

export default async function handler(req: any, res: any) {
  // CORS handles
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  
  if (!apiKey || !supabaseUrl || !supabaseKey) {
     return res.status(200).json({ context: '' }); // Graceful fail if not configured
  }

  try {
    const { query } = req.body;
    if (!query || query.trim() === '') return res.status(200).json({ context: '' });

    const supabase = createClient(supabaseUrl, supabaseKey);
    const ai = new GoogleGenAI({ apiKey });

    // 1. Embed user query
    const embeddingResponse = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: query
    });
    
    const embedding =
      (embeddingResponse as any)?.embedding?.values ??
      (embeddingResponse as any)?.embeddings?.[0]?.values ??
      null;

    if (!embedding || embedding.length === 0) {
        return res.status(200).json({ context: '' });
    }

    // Truncate to 768 dims to match vector(768) column (gemini-embedding-001 returns 3072)
    const truncated = (embedding as number[]).slice(0, 768);

    // 2. Search Supabase PGVector
    const { data: chunks, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: truncated,
      match_threshold: 0.3,  // Lowered from 0.65 — truncated 768-dim vectors score lower
      match_count: 4
    });

    if (error) {
       console.error("Supabase RAG Search Error:", error);
       return res.status(200).json({ context: '' }); 
    }

    if (!chunks || chunks.length === 0) {
       return res.status(200).json({ context: '' });
    }

    // 3. Format Context for LLM
    const contextString = chunks.map((c: any) => `[Retrieved Document Excerpt]:\n${c.content}`).join('\n\n---\n\n');
    return res.status(200).json({ context: contextString });

  } catch (err: any) {
    console.error("RAG Search failed:", err);
    return res.status(200).json({ context: '' }); 
  }
}
