// Plain-HTTP dev server for local mobile-layout testing (skips @vitejs/plugin-basic-ssl).
process.env.DISABLE_HTTPS = '1';
const { createServer } = await import('vite');
const server = await createServer({
  server: { host: true, port: 5174, strictPort: true },
});
await server.listen();
server.printUrls();
