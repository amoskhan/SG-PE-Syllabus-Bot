import formidable from 'formidable';
import * as fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Disable default body parser so formidable can process multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

// ── Helper: Try every known way to extract text from a PDF buffer ────────────
async function extractPdfText(dataBuffer: Buffer): Promise<{ text: string; method: string }> {
  // Strategy 1: pdf-parse v1 default export (most common install)
  try {
    const pdfParse = await import('pdf-parse');
    const parseFn = (pdfParse as any).default ?? pdfParse;
    if (typeof parseFn === 'function') {
      const result = await parseFn(dataBuffer);
      if (result?.text && result.text.trim().length > 0) {
        return { text: result.text, method: 'pdf-parse v1 default' };
      }
    }
  } catch (_) {}

  // Strategy 2: pdf-parse v2 class-based API
  try {
    const pdfParse = await import('pdf-parse');
    const PDFParseClass = (pdfParse as any).PDFParse ?? (pdfParse as any).default?.PDFParse;
    if (PDFParseClass) {
      const parser = new PDFParseClass({ data: dataBuffer });
      const result = await parser.getText();
      if (result?.text && result.text.trim().length > 0) {
        return { text: result.text, method: 'pdf-parse v2 class' };
      }
    }
  } catch (_) {}

  // Strategy 3 is removed. Raw PDF parsing without decompression produces binary garbage.

  throw new Error(
    'Could not extract text from PDF. All 3 strategies failed. ' +
    'Make sure pdf-parse is installed: run "npm install pdf-parse" or "yarn add pdf-parse".'
  );
}
// ── Context-aware chunker ─────────────────────────────────────────────────────
// Fixes the core RAG quality problem: PDF table parsing splits level headers
// ("PRIMARY 2 - GAMES AND SPORTS") from the skill outcomes below them.
// This chunker tracks the current level+subject and prepends it into every chunk
// so every retrieved piece is self-contained and answerable.
function buildContextAwareChunks(text: string, maxChunkChars = 900): string[] {
  // Patterns that identify a new level/subject section header in the parsed text.
  // Plain hyphens are used because PDF parsers typically corrupt em dashes to '-' or '?'.
  const HEADER_PATTERNS = [
    /^(PRIMARY\s+\d(?:\s+AND\s+\d)?\s*[-–]\s*.+)$/i,
    /^(SECONDARY\s+\d\s*[-–]\s*.+)$/i,
    /^(PRE-UNIVERSITY\s*[-–]\s*.+)$/i,
    /^(BY END OF PRIMARY \d\s*[-–]\s*.+)$/i,
    /^(LEARNING OUTCOMES?)$/i,
  ];

  // Normalise: join lines that look like broken table cells.
  // e.g. "Striking\n(with\nimplement)" → "Striking (with implement)"
  const normalised = text
    .replace(/\r\n/g, '\n')
    // Join a line that ends without punctuation to the next short line (< 40 chars)
    // that starts with lowercase or '(' — typical broken table cell symptom.
    .replace(/([^\n.!?:,])\n([(a-z][^\n]{0,38})\n/g, '$1 $2\n')
    // Replace corrupted dash characters with a plain hyphen
    .replace(/[–—]/g, '-');

  const lines = normalised.split('\n');

  let currentContext = 'SINGAPORE MOE PE SYLLABUS 2024';
  const chunks: string[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    const content = buffer.join('\n').trim();
    if (content.length >= 30) {
      // Prepend the running context header so every chunk is self-contained
      chunks.push(`[${currentContext}]\n\n${content}`);
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect a new section header
    const isHeader = HEADER_PATTERNS.some(p => p.test(trimmed));
    if (isHeader && trimmed.length > 0) {
      flushBuffer();
      // Keep the full header text as the new running context
      // Collapse multi-word level names like "PRIMARY 1 AND 2" gracefully
      currentContext = trimmed.replace(/\s+/g, ' ');
      buffer.push(trimmed); // include header at top of next chunk too
      continue;
    }

    buffer.push(line);

    // Flush when the buffer approaches the max chunk size
    const bufferText = buffer.join('\n');
    if (bufferText.length >= maxChunkChars) {
      flushBuffer();
    }
  }

  flushBuffer(); // flush any remaining content
  return chunks.filter(c => c.trim().length >= 50);
}

export default async function handler(req: any, res: any) {
  // ── CORS ────────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Verify the caller is a signed-in user
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing auth token.' });
  }
  {
    const authClient = createClient(supabaseUrl || '', supabaseKey || '');
    const { data: { user: authUser }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Unauthorized: invalid or expired session.' });
    }
  }

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    const missing = [
      !apiKey && 'GEMINI_API_KEY',
      !supabaseUrl && 'SUPABASE_URL',
      !supabaseKey && 'SUPABASE_ANON_KEY',
    ].filter(Boolean).join(', ');
    return res.status(500).json({ error: `Server misconfigured. Missing: ${missing}` });
  }

  try {
    const form = formidable({});
    form.parse(req, async (err, _fields, files) => {
      if (err) return res.status(500).json({ error: `Form parsing error: ${err.message}` });

      const fileArray = Array.isArray(files.file) ? files.file : [files.file];
      const file = fileArray[0];
      if (!file) return res.status(400).json({ error: 'No file uploaded. Make sure the form field is named "file".' });

      try {
        // ── STEP 1: Parse PDF ─────────────────────────────────────────────────
        const dataBuffer = fs.readFileSync(file.filepath);
        console.log(`📂 File received: ${file.originalFilename} (${dataBuffer.length} bytes)`);

        const { text, method } = await extractPdfText(dataBuffer);
        console.log(`✅ PDF parsed via "${method}" — ${text.length} chars extracted`);

        if (text.trim().length < 50) {
          return res.status(422).json({
            error: `PDF text extraction returned almost no content (${text.length} chars). ` +
                   'The PDF may be a scanned image (not text-based). Try a text-based PDF.'
          });
        }

        // ── STEP 2: Chunk text (context-aware) ───────────────────────────────
        // Problem: PDF-parsed syllabus tables produce fragmented text where
        // the level heading ("PRIMARY 2") is far from the skill content.
        // Solution: scan line-by-line, track the current level/subject,
        // and prepend that context into every chunk so RAG results are self-contained.
        const chunks = buildContextAwareChunks(text);
        console.log(`📄 ${chunks.length} context-aware chunks created`);

        if (chunks.length === 0) {
          return res.status(422).json({ error: 'PDF had text but no usable chunks (all were too short).' });
        }

        // ── STEP 3: Supabase & Gemini clients ────────────────────────────────
        const supabase = createClient(supabaseUrl, supabaseKey);
        const ai = new GoogleGenAI({ apiKey });

        // ── STEP 4: Save document record ──────────────────────────────────────
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .insert({ title: file.originalFilename || 'Untitled PDF' })
          .select()
          .single();

        if (docError) {
          console.error('❌ Supabase documents insert failed:', docError);
          return res.status(500).json({
            error: `Database error saving document record: ${docError.message}. ` +
                   `Hint: ${docError.hint || 'Check your Supabase RLS policies and table schema.'}`
          });
        }

        console.log(`✅ Document record created: ${doc.id} ("${doc.title}")`);

        // ── STEP 5: Embed & save chunks ───────────────────────────────────────
        let processedChunks = 0;
        const chunkErrors: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i].trim();

          // Generate embedding
          let embeddingValues: number[] | null = null;
          try {
            const embeddingResponse = await ai.models.embedContent({
              model: 'gemini-embedding-001',
              contents: chunk
            });
            embeddingValues =
              (embeddingResponse as any)?.embedding?.values ??
              (embeddingResponse as any)?.embeddings?.[0]?.values ??
              null;
          } catch (embedErr: any) {
            chunkErrors.push(`Chunk ${i}: embedding error — ${embedErr.message}`);
            console.error(`❌ Chunk ${i} embedding failed:`, embedErr.message);
            continue;
          }

          if (!embeddingValues || embeddingValues.length === 0) {
            chunkErrors.push(`Chunk ${i}: embedding returned no values`);
            console.error(`❌ Chunk ${i}: embedding returned no values`);
            continue;
          }

          // Truncate to 768 dims to match vector(768) column — valid for Matryoshka embeddings
          const truncated = embeddingValues.slice(0, 768);
          console.log(`✅ Chunk ${i + 1}/${chunks.length}: embedding ${embeddingValues.length}d → truncated to ${truncated.length}d → inserting...`);

          // Insert chunk
          const { error: chunkError } = await supabase.from('document_chunks').insert({
            document_id: doc.id,
            content: chunk,
            embedding: `[${truncated.join(',')}]`
          });

          if (chunkError) {
            chunkErrors.push(`Chunk ${i}: DB insert error — ${chunkError.message}`);
            console.error(`❌ Chunk ${i} DB insert failed:`, JSON.stringify(chunkError));
          } else {
            processedChunks++;
          }
        }

        // ── STEP 6: Return result ─────────────────────────────────────────────
        if (processedChunks === 0) {
          return res.status(500).json({
            error: `PDF parsed (${chunks.length} chunks found) but 0 were saved to the database. ` +
                   `First error: ${chunkErrors[0] || 'unknown'}`,
            debug: { pdfMethod: method, textLength: text.length, chunkCount: chunks.length, errors: chunkErrors.slice(0, 5) }
          });
        }

        return res.status(200).json({
          success: true,
          message: `✅ Successfully saved ${processedChunks} of ${chunks.length} chunks from "${file.originalFilename}" to the database.`,
          debug: { pdfMethod: method, textLength: text.length, chunkErrors: chunkErrors.slice(0, 3) }
        });

      } catch (innerError: any) {
        console.error('❌ PDF Processing internal error:', innerError);
        return res.status(500).json({ error: innerError.message });
      }
    });
  } catch (error: any) {
    console.error('❌ PDF Processing outer error:', error);
    return res.status(500).json({ error: error.message });
  }
}
