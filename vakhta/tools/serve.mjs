/**
 * serve.mjs — маленький сервер для локальной проверки приложения.
 *
 * Зачем он нужен: приложение работает только по http(s) — при открытии файла
 * двойным щелчком (file://) браузер запрещает модули, IndexedDB и service worker.
 * Этот сервер раздаёт репозиторий и сразу открывает «Счётчик вахты».
 *
 * Запуск из корня репозитория:
 *     node vakhta/tools/serve.mjs
 * Затем открыть:  http://localhost:4173/vakhta/
 *
 * Чтобы проверить на iPhone в той же сети Wi-Fi, узнайте адрес компьютера
 * (например, 192.168.1.5) и откройте http://192.168.1.5:4173/vakhta/ в Safari.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// корень репозитория: vakhta/tools/serve.mjs → на два уровня выше
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT) || 4173;
const HOST = '0.0.0.0';

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
  '.md': 'text/markdown; charset=utf-8',
  '.gz': 'application/gzip',
};

const server = http.createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/' || pathname === '') {
      response.writeHead(302, { Location: '/vakhta/' });
      response.end();
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) {
      response.writeHead(403).end('Запрещено');
      return;
    }

    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Не найдено: ${pathname}`);
      return;
    }

    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // без кэша: правки в файлах видно сразу
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Ошибка сервера: ${error.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Счётчик вахты: http://localhost:${PORT}/vakhta/`);
  console.log('Для проверки на телефоне откройте этот адрес по IP компьютера в той же сети Wi-Fi.');
});
