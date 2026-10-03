// Lives outside api/: Vercel makes every file in api/ a public endpoint.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the connection to Google is faked: each test scripts what Gemini
// replies, per model, and the route is called as Vercel calls it.
type Reply = { text: string } | { error: number; retryDelay?: string };
const script: Record<string, Reply[]> = {};
const sent: { model: string; config: any }[] = [];

class FakeApiError extends Error {
  constructor(public status: number, retryDelay?: string) {
    super(JSON.stringify({
      error: {
        code: status,
        message: status === 429 ? 'You exceeded your current quota' : 'This model is currently experiencing high demand.',
        details: retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : [],
      },
    }));
  }
}

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = {
      create: ({ model, config }: { model: string; config: any }) => ({
        sendMessage: async () => {
          sent.push({ model, config });
          const reply = script[model]?.shift() ?? { error: 500 };
          if ('error' in reply) throw new FakeApiError(reply.error, reply.retryDelay);
          // The SDK's reply: the text, and the same text inside its candidate
          return { text: reply.text, candidates: [{ content: { parts: [{ text: reply.text }] }, finishReason: 'STOP' }] };
        },
      }),
    };
  },
}));

let handler: (req: any, res: any) => Promise<unknown>;
beforeAll(async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  handler = (await import('../../api/gemini')).default;
});
beforeEach(() => {
  for (const k of Object.keys(script)) delete script[k];
  sent.length = 0;
});

const ask = async () => {
  const out: { status?: number; body?: any } = {};
  const res: any = {
    setHeader: () => res,
    status: (s: number) => { out.status = s; return res; },
    json: (b: any) => { out.body = b; return res; },
    end: () => res,
  };
  await handler({ method: 'POST', headers: {}, body: { message: 'What are the P4 outcomes?', history: [] } }, res);
  return out;
};

describe('/api/gemini', () => {
  it('retries a moment of "high demand" (503) and still answers', async () => {
    script['gemini-2.5-flash'] = [{ error: 503 }, { text: 'P4 outcomes…' }];
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('P4 outcomes…');
  });

  it("answers with Flash-Lite when Flash's free quota is used up (429)", async () => {
    script['gemini-2.5-flash'] = [{ error: 429, retryDelay: '40s' }];
    script['gemini-2.5-flash-lite'] = [{ text: 'P4 outcomes from Lite' }];
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('P4 outcomes from Lite');
    expect(res.body.model).toBe('gemini-2.5-flash-lite');
  });

  it("says when to try again if every model's quota is used up", async () => {
    script['gemini-2.5-flash'] = [{ error: 429, retryDelay: '40s' }];
    script['gemini-2.5-flash-lite'] = [{ error: 429, retryDelay: '12.5s' }];
    const res = await ask();
    expect(res.status).toBe(429);
    expect(res.body.retryAfterSeconds).toBe(13);
    expect(res.body.error).toBe('Coach Bot is busy right now. Try again in about 13 seconds.');
  });

  it('asks Gemini not to think, so the whole token limit goes to the answer', async () => {
    script['gemini-2.5-flash'] = [{ text: 'P4 outcomes…' }];
    await ask();
    expect(sent[0].config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
});
