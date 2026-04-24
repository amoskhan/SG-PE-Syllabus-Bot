import { createClient } from '@supabase/supabase-js';

async function validateToken(token: string) {
  if (!token) return { user: null, error: 'Missing token' };
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { user: null, error: 'Invalid token' };
    return { user, error: null };
  } catch {
    return { user: null, error: 'Auth service unavailable' };
  }
}

/** For Edge runtime endpoints (api/claude.ts, api/openrouter.ts, api/get-memory.ts) */
export async function validateEdgeAuth(req: Request) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  return validateToken(token);
}

/** For Node runtime endpoints (api/rag-search.ts, api/upload-pdf.ts) */
export async function validateNodeAuth(req: { headers: Record<string, string | string[] | undefined> }) {
  const authHeader = (req.headers['authorization'] as string) || '';
  const token = authHeader.replace('Bearer ', '').trim();
  return validateToken(token);
}
