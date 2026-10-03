import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    clearScreen: true,
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {},
    },
    plugins: [
      ...(process.env.DISABLE_HTTPS ? [] : [basicSsl()]),
      react(),
      {
        // Local dev runs the real api/gemini.ts, so the models, the Flash-Lite
        // fallback and the "busy" message are the same as on the live site
        name: 'gemini-dev-proxy',
        configureServer(server) {
          process.env.GEMINI_API_KEY ||= env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
          server.middlewares.use('/api/gemini', (req, res) => {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', async () => {
              // Vercel's res.status(…).json(…) on top of Node's response
              const reply = Object.assign(res, {
                status: (code: number) => { res.statusCode = code; return reply; },
                json: (data: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return reply; },
              });
              try {
                const { default: handler } = await server.ssrLoadModule('/api/gemini.ts');
                await handler({ method: req.method, headers: req.headers, body: body ? JSON.parse(body) : {} }, reply);
              } catch (e: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
          });
        },
      },
      {
        name: 'claude-dev-proxy',
        configureServer(server) {
          server.middlewares.use('/api/claude', (req, res) => {
            const apiKey = env.VITE_ANTHROPIC_API_KEY;
            if (!apiKey) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'VITE_ANTHROPIC_API_KEY not set in .env.local' }));
              return;
            }
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const upstream = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-beta': 'prompt-caching-2024-07-31',
                    'content-type': 'application/json',
                  },
                  body,
                });
                const data = await upstream.json() as any;
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = upstream.ok ? 200 : upstream.status;
                res.end(JSON.stringify(upstream.ok ? {
                  text: data.content?.[0]?.text || '',
                  tokenUsage: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
                } : {
                  error: data.error?.message || 'Anthropic API error',
                }));
              } catch (e: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
          });
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    }
  };
});
