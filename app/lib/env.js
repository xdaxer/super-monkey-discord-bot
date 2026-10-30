import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

// .env'i modüle göre çözüyoruz: çalışma dizini ne olursa olsun (npm start,
// node app/app.js, app/scripts/... ) aynı dosya okunur.
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

dotenv.config({ path: path.join(appDir, '.env'), quiet: true });

/**
 * İstenen ortam değişkenlerini döndürür; eksik veya boş olan varsa
 * hangilerinin eksik olduğunu söyleyen bir hatayla durur.
 * Değerleri asla loglamaz.
 */
export function requireEnv(...names) {
  const eksik = names.filter((name) => !process.env[name]?.trim());

  if (eksik.length > 0) {
    throw new Error(
      `app/.env içinde eksik veya boş: ${eksik.join(', ')}\n` +
        'app/.env.example dosyasını örnek alın.',
    );
  }

  return Object.fromEntries(names.map((name) => [name, process.env[name].trim()]));
}

/**
 * İsteğe bağlı bir ortam değişkenini döndürür; yoksa veya boşsa null.
 * requireEnv'den farkı: eksiklik hata değil, çağıranın ele alacağı bir durum.
 */
export function optionalEnv(name) {
  const deger = process.env[name]?.trim();
  return deger ? deger : null;
}
