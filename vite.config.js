import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function neutralinoDevPlugin() {
  return {
    name: 'vite-plugin-neutralino-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/__neutralino_globals.js' || req.url?.startsWith('/__neutralino_globals.js')) {
          const authInfoPath = path.resolve(process.cwd(), '.tmp/auth_info.json');
          let attempts = 0;
          while (!fs.existsSync(authInfoPath) && attempts < 30) {
            await new Promise((r) => setTimeout(r, 100));
            attempts++;
          }
          if (fs.existsSync(authInfoPath)) {
            try {
              const authInfo = JSON.parse(fs.readFileSync(authInfoPath, 'utf8'));
              const combinedToken = (authInfo.nlToken && authInfo.nlToken.includes('.'))
                ? authInfo.nlToken
                : (authInfo.nlConnectToken ? `${authInfo.nlToken}.${authInfo.nlConnectToken}` : authInfo.nlToken);
              const globalsScript = `
                window.NL_PORT = ${authInfo.nlPort};
                window.NL_TOKEN = '${combinedToken}';
                window.NL_CONNECT_TOKEN = '${authInfo.nlConnectToken || ''}';
                window.NL_ARGS = [];
                window.NL_PATH = '${process.cwd().replace(/\\/g, '/')}';
                window.NL_APPID = 'io.stalink.hub';
                window.NL_APPVERSION = '1.0.0';
                window.NL_MODE = 'window';
                window.NL_RESMODE = 'dir';
                window.NL_EXTENABLED = true;
                window.NL_GINJECTED = true;
              `;
              res.setHeader('Content-Type', 'application/javascript');
              res.end(globalsScript);
              return;
            } catch (e) {
              console.error('Failed to read auth_info.json in Vite plugin:', e);
            }
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), neutralinoDevPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
