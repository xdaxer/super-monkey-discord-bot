import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const eventsDir = path.join(appDir, 'events');

/**
 * app/events/*.js ağacını okur.
 *
 * Bir dosya ya tek olay (`name` + `execute` dışa aktararak) ya da birden çok
 * olay (`olaylar` dizisi dışa aktararak) tanımlayabilir. Birden çok olay aynı
 * konuya aitse (ör. bütün mesaj logları) tek dosyada durması okunurluğu artırır.
 *
 * `gerekliIntent` verilen olaylar, o intent kapalıyken hiç bağlanmaz.
 */
export async function loadEvents() {
  let dosyalar;
  try {
    dosyalar = await readdir(eventsDir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const olaylar = [];

  for (const file of dosyalar) {
    if (!file.endsWith('.js')) continue;

    const displayPath = `events/${file}`;
    const imported = await import(pathToFileURL(path.join(eventsDir, file)).href);
    const tanimlar = imported.olaylar ?? [imported];

    if (!Array.isArray(tanimlar) || tanimlar.length === 0) {
      throw new Error(`${displayPath}: "olaylar" dizisi boş olamaz.`);
    }

    for (const tanim of tanimlar) {
      if (!tanim?.name || typeof tanim.execute !== 'function') {
        throw new Error(`${displayPath}: her olay "name" ve "execute" taşımalı.`);
      }

      olaylar.push({
        name: tanim.name,
        once: Boolean(tanim.once),
        execute: tanim.execute,
        gerekliIntent: tanim.gerekliIntent ?? [],
        yol: displayPath,
      });
    }
  }

  return olaylar;
}

/**
 * Olayları istemciye bağlar. İstemcide bulunmayan intent'i gerektiren olaylar
 * hiç bağlanmaz ve atlananların listesi döndürülür.
 *
 * @param {string[]} aktifIntentler İstemcinin gerçekten açtığı intent adları.
 */
export function olaylariBagla(client, olaylar, aktifIntentler = [], logger = console) {
  const atlanan = [];

  for (const olay of olaylar) {
    const eksik = olay.gerekliIntent.filter((ad) => !aktifIntentler.includes(ad));
    if (eksik.length > 0) {
      atlanan.push({ yol: olay.yol, olay: olay.name, eksik });
      continue;
    }

    const sarmalayici = async (...args) => {
      try {
        await olay.execute(...args);
      } catch (error) {
        // Tek bir olay işleyicisinin hatası botu düşürmemeli.
        logger.error(`${olay.yol} (${olay.name}) hata verdi:`, error);
      }
    };

    if (olay.once) client.once(olay.name, sarmalayici);
    else client.on(olay.name, sarmalayici);
  }

  return atlanan;
}
