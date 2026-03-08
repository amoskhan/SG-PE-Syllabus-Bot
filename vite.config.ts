import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Decode BEDROCK_BEARER_TOKEN (server-side only, no VITE_ prefix) for the dev proxy
  let bedrockProxyTarget = 'https://bedrock-runtime.ap-southeast-1.amazonaws.com';
  let bedrockPresignedPath = '/';
  const bedrockToken = env.BEDROCK_BEARER_TOKEN || '';
  if (bedrockToken) {
    try {
      const base64Part = bedrockToken.replace(/^bedrock-api-key-/, '');
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      const presignedUrl = decoded.startsWith('http') ? decoded : `https://${decoded}`;
      const urlObj = new URL(presignedUrl);
      bedrockProxyTarget = `${urlObj.protocol}//${urlObj.host}`;
      bedrockPresignedPath = `${urlObj.pathname}${urlObj.search}`;
    } catch {
      console.warn('vite.config: Could not decode BEDROCK_BEARER_TOKEN for dev proxy');
    }
  }

  return {
    clearScreen: true,
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/bedrock': {
          target: bedrockProxyTarget,
          changeOrigin: true,
          rewrite: () => bedrockPresignedPath,
          secure: false,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    }
  };
});
