// Lives outside api/: Vercel makes every file in api/ a public endpoint.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the connection to Google is faked: each test scripts what Gemini
// replies, per model, and the route is called as Vercel calls it.
// A reply's text may come in several parts, as Gemini 3 sends a longer answer
// `hang` never answers, as gemini-flash-latest did on 16 Nov 2026 (#164)
type Reply = { text: string | string[] } | { error: number; retryDelay?: string } | { hang: true };
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
          if ('hang' in reply) return new Promise(() => {});
          if ('error' in reply) throw new FakeApiError(reply.error, reply.retryDelay);
          // The SDK's reply: the whole text, and its parts inside the candidate
          const parts = ([] as string[]).concat(reply.text);
          return { text: parts.join(''), candidates: [{ content: { parts: parts.map((text) => ({ text })) }, finishReason: 'STOP' }] };
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
afterEach(() => {
  vi.useRealTimers();
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
  it('returns the whole answer when Gemini sends it in several parts', async () => {
    script['gemini-3-flash-preview'] = [{ text: ['**Travelling**\n1. Hang momentarily', ' on overhead apparatus.\n\n**Balancing**\n1. Balance on hands.'] }];
    const res = await ask();
    expect(res.body.text).toBe('**Travelling**\n1. Hang momentarily on overhead apparatus.\n\n**Balancing**\n1. Balance on hands.');
  });

  it('retries a moment of "high demand" (503) and still answers', async () => {
    script['gemini-3-flash-preview'] = [{ error: 503 }, { text: 'P4 outcomes…' }];
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('P4 outcomes…');
  });

  it("answers with Flash-Lite when Flash's free quota is used up (429)", async () => {
    script['gemini-3-flash-preview'] = [{ error: 429, retryDelay: '40s' }];
    script['gemini-3.5-flash-lite'] = [{ text: 'P4 outcomes from Lite' }];
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('P4 outcomes from Lite');
    expect(res.body.model).toBe('gemini-3.5-flash-lite');
  });

  it("says when to try again if every model's quota is used up", async () => {
    script['gemini-3-flash-preview'] = [{ error: 429, retryDelay: '40s' }];
    script['gemini-3.5-flash-lite'] = [{ error: 429, retryDelay: '12.5s' }];
    const res = await ask();
    expect(res.status).toBe(429);
    expect(res.body.retryAfterSeconds).toBe(13);
    expect(res.body.error).toBe('PE AI Buddy is busy right now. Try again in about 13 seconds.');
  });

  it('asks Gemini not to think, so the whole token limit goes to the answer', async () => {
    script['gemini-3-flash-preview'] = [{ text: 'P4 outcomes…' }];
    await ask();
    expect(sent[0].config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('searches the web only when the request asks for it', async () => {
    script['gemini-3-flash-preview'] = [{ text: 'from the syllabus' }, { text: 'from the web' }];
    await ask();
    expect(sent[0].config.tools).toBeUndefined();
    await ask({ tools: [{ googleSearch: {} }] });
    expect(sent[1].config.tools).toEqual([{ googleSearch: {} }]);
  });

  it("sends Flash-Lite no thinking setting (it doesn't think, and refuses the setting)", async () => {
    script['gemini-3-flash-preview'] = [{ error: 429 }];
    script['gemini-3.5-flash-lite'] = [{ text: 'from Lite' }];
    await ask();
    expect(sent[1]).toMatchObject({ model: 'gemini-3.5-flash-lite' });
    expect(sent[1].config.thinkingConfig).toBeUndefined();
  });

  it('moves on to the next model when Google has retired one (404)', async () => {
    script['gemini-3-flash-preview'] = [{ error: 404 }];
    script['gemini-3.5-flash-lite'] = [{ text: 'still answering' }];
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('still answering');
  });

  it("answers with Flash-Lite when Flash hasn't answered in 20 seconds", async () => {
    vi.useFakeTimers();
    script['gemini-3-flash-preview'] = [{ hang: true }];
    script['gemini-3.5-flash-lite'] = [{ text: 'P4 outcomes from Lite' }];
    const pending = ask();
    await vi.advanceTimersByTimeAsync(20_000);
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('P4 outcomes from Lite');
    expect(res.body.model).toBe('gemini-3.5-flash-lite');
  });

  it('says the AI took too long when no model answers in time', async () => {
    vi.useFakeTimers();
    script['gemini-3-flash-preview'] = [{ hang: true }];
    script['gemini-3.5-flash-lite'] = [{ hang: true }];
    const pending = ask();
    await vi.advanceTimersByTimeAsync(40_000);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(res.body.error).toBe('The AI took too long to answer. Please try again in a moment.');
  });
});
