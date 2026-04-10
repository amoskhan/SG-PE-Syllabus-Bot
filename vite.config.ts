import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
      react(),
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
