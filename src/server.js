import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, {
        config: appConfig,
        mode: 'manual-only',
        message: 'Playwright/브라우저 자동조작 없이, 수동 새로고침 타이머와 사용자가 직접 조회한 결과 텍스트 분석만 제공합니다.',
      });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(appConfig.port, () => {
  console.log(`KORAIL manual seat helper running at http://localhost:${appConfig.port}`);
});

async function serveStatic(urlPath, res) {
  const safePath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.resolve(publicDir, `.${safePath}`);
  if (!filePath.startsWith(publicDir)) return json(res, 403, { error: 'Forbidden' });

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}
