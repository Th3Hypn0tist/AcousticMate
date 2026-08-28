import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = process.env.ACOUSTICMATE_HOST ?? '127.0.0.1';
const PORT = Number(process.env.ACOUSTICMATE_PORT ?? 8000);

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
});

function runStartupSuite() {
  console.log('[acousticmate:test] startup gate');
  const result = spawnSync(process.execPath, ['--test'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`[acousticmate:test] startup gate failed (${result.status}); server not started`);
    process.exit(result.status ?? 1);
  }
  console.log('[acousticmate:test] startup gate passed');
}

function safePath(requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath.split('?')[0]); }
  catch { return null; }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = resolve(PROJECT_ROOT, relative);
  const rootPrefix = PROJECT_ROOT.endsWith(sep) ? PROJECT_ROOT : `${PROJECT_ROOT}${sep}`;
  if (candidate !== PROJECT_ROOT && !candidate.startsWith(rootPrefix)) return null;
  return candidate;
}

function serveFile(path, response) {
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(path).pipe(response);
}

function startServer() {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('ACOUSTICMATE_PORT must be an integer from 1 to 65535');
  const server = createServer((request, response) => {
    const path = safePath(request.url ?? '/');
    if (!path || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('Not found');
      return;
    }
    serveFile(path, response);
  });
  server.listen(PORT, HOST, () => {
    console.log(`AcousticMate -> http://${HOST}:${PORT}`);
  });
}

runStartupSuite();
startServer();
