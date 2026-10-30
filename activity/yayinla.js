// `npm run yayinla`: vite build çıktısını (dist/) web köküne kopyalar.
// Hedef app/.env'deki `yayinDizini` (ortam değişkeni önce gelir). Eski
// assets/ silinir; yoksa her yayında karma adlı dosyalar birikir.
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

import { loadEnv } from 'vite';

const { yayinDizini } = loadEnv('production', '../app', 'yayinDizini');
if (!yayinDizini || !path.isAbsolute(yayinDizini) || path.resolve(yayinDizini) === '/') {
  console.error('app/.env içinde yayinDizini mutlak bir dizin olmalı (örn. /var/www/activity).');
  process.exit(1);
}
if (!existsSync('dist/index.html')) {
  console.error('dist/ yok: önce vite build.');
  process.exit(1);
}

rmSync(path.join(yayinDizini, 'assets'), { recursive: true, force: true });
cpSync('dist', yayinDizini, { recursive: true });
console.log(`Yayınlandı → ${yayinDizini}`);
