#!/usr/bin/env node
/**
 * serve.mjs — локальный сервер для проверки «Академии Blender» (zero-dependency).
 *
 * Раздаёт корень репозитория, поэтому работают обе части проекта:
 *   /          → игра «Попаданец» (client/)
 *   /blender/  → академия Blender
 *
 * Запуск:  node blender/tools/serve.mjs [порт]
 * Открыть: http://localhost:4173/blender/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.gz': 'application/gzip',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const send = (res, status, type, body, extra = {}) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...extra });
  res.end(body);
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Method Not Allowed');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'text/plain', 'Bad Request');
  }

  if (pathname === '/' || pathname === '/index.html') {
    return send(res, 302, 'text/plain', 'игра: /client/ · академия: /blender/', { Location: '/blender/' });
  }
  if (pathname === '/blender') return send(res, 301, 'text/plain', '', { Location: '/blender/' });
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = path.normalize(path.join(ROOT, pathname));
  if (!target.startsWith(ROOT)) return send(res, 403, 'text/plain', 'Forbidden');

  let file = target;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    // SPA-фолбэк для внутренних ссылок академии (#/ask и т.п.)
    if (pathname.startsWith('/blender/') && !path.extname(pathname)) file = path.join(ROOT, 'blender/index.html');
    else return send(res, 404, 'text/plain; charset=utf-8', 'Не найдено: ' + pathname);
  }

  const body = fs.readFileSync(file);
  send(res, 200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    req.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, HOST, () => {
  console.log(`Академия Blender: http://localhost:${PORT}/blender/`);
  console.log(`(сервер слушает ${HOST}:${PORT}, корень — ${ROOT})`);
});
