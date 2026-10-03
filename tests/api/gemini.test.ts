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

const ask = async (body: Record<string, unknown> = {}) => {
  const out: { status?: number; body?: any } = {};
  const res: any = {
    setHeader: () => res,
    status: (s: number) => { out.status = s; return res; },
    json: (b: any) => { out.body = b; return res; },
    end: () => res,
  };
  await handler({ method: 'POST', headers: {}, body: { message: 'What are the P4 outcomes?', history: [], ...body } }, res);
  return out;
};

describe('/api/gemini', () => {
  it('retries a moment of "high demand" (503) and still answers', async () => {
    script['gemini-flash-latest'] = [{ error: 503 }, { text: 'P4 outcomes…' }];
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('P4 outcomes…');
  });

  it("answers with Flash-Lite when Flash's free quota is used up (429)", async () => {
    script['gemini-flash-latest'] = [{ error: 429, retryDelay: '40s' }];
    script['gemini-flash-lite-latest'] = [{ text: 'P4 outcomes from Lite' }];
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('P4 outcomes from Lite');
    expect(res.body.model).toBe('gemini-flash-lite-latest');
  });

  it("says when to try again if every model's quota is used up", async () => {
    script['gemini-flash-latest'] = [{ error: 429, retryDelay: '40s' }];
    script['gemini-flash-lite-latest'] = [{ error: 429, retryDelay: '12.5s' }];
    const res = await ask();
    expect(res.status).toBe(429);
    expect(res.body.retryAfterSeconds).toBe(13);
    expect(res.body.error).toBe('Coach Bot is busy right now. Try again in about 13 seconds.');
  });

  it('asks Gemini not to think, so the whole token limit goes to the answer', async () => {
    script['gemini-flash-latest'] = [{ text: 'P4 outcomes…' }];
    await ask();
    expect(sent[0].config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('searches the web only when the request asks for it', async () => {
    script['gemini-flash-latest'] = [{ text: 'from the syllabus' }, { text: 'from the web' }];
    await ask();
    expect(sent[0].config.tools).toBeUndefined();
    await ask({ tools: [{ googleSearch: {} }] });
    expect(sent[1].config.tools).toEqual([{ googleSearch: {} }]);
  });

  it("sends Flash-Lite no thinking setting (it doesn't think, and refuses the setting)", async () => {
    script['gemini-flash-latest'] = [{ error: 429 }];
    script['gemini-flash-lite-latest'] = [{ text: 'from Lite' }];
    await ask();
    expect(sent[1]).toMatchObject({ model: 'gemini-flash-lite-latest' });
    expect(sent[1].config.thinkingConfig).toBeUndefined();
  });

  it('moves on to the next model when Google has retired one (404)', async () => {
    script['gemini-flash-latest'] = [{ error: 404 }];
    script['gemini-flash-lite-latest'] = [{ text: 'still answering' }];
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('still answering');
  });
});
