import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');
import { EventBus } from './events.js';
import { TaskManager } from './taskManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');
const events = new EventBus();
const taskManager = new TaskManager(events);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, {
        config: appConfig,
        mode: 'manual-only',
        message: 'Playwright/브라우저 자동조작 없이, 수동 새로고침 타이머와 사용자가 직접 조회한 결과 텍스트 분석만 제공합니다.',
      });
      return json(res, 200, taskManager.getSnapshot());
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      return events.connect(res);
    }

    if (req.method === 'POST' && url.pathname === '/api/login-browser') {
      await taskManager.openLoginBrowser();
      return json(res, 200, { ok: true });
    }

    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(start|stop)$/);
    if (req.method === 'POST' && taskMatch) {
      const [, taskId, action] = taskMatch;
      if (action === 'start') taskManager.start(taskId);
      else taskManager.stop(taskId);
      return json(res, 200, { ok: true });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(appConfig.port, () => {
  console.log(`KORAIL manual seat helper running at http://localhost:${appConfig.port}`);
  console.log(`KORAIL helper running at http://localhost:${appConfig.port}`);
});

process.on('SIGINT', async () => {
  await taskManager.stopAll();
  process.exit(0);
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
