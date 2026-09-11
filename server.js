/**
 * «Попаданец — Живой мир» — v0.1 prototype
 * Минимальный zero-dependency сервер: раздаёт клиент и делает SPA-fallback
 * (все GET-роуты из паспорта отдают index.html).
 *
 * В полной версии (по паспорту): Node 20 + Express + Prisma + PostgreSQL.
 * Для прототипа — чистый http, чтобы запуск был мгновенным.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const ROOT = path.join(__dirname, 'client');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('Method Not Allowed');
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const filePath = path.normalize(path.join(ROOT, p));
    // защита от path traversal
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let target = filePath;
    if (!path.extname(target)) target = path.join(ROOT, 'index.html'); // SPA fallback
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      target = path.join(ROOT, 'index.html');
    }
    const ext = path.extname(target).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const body = fs.readFileSync(target);
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`«Попаданец — Живой мир» (v0.1): http://${HOST}:${PORT}`);
});
