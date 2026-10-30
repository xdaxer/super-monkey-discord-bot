import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { VARSAYILAN_YOL, veritabani } from '../lib/db.js';

/**
 * Veritabanı yedekleme.
 *
 * Yedek `VACUUM INTO` ile alınır, dosya kopyalanarak değil. Gerekçe: bot
 * çalışırken sqlite dosyası WAL modunda yazılıyor; düz kopya, kopyalama anında
 * yarım kalmış bir işlemi yakalayıp açılamayan bir dosya üretebilir.
 * `VACUUM INTO` tek işlemde tutarlı bir anlık görüntü yazar.
 *
 * Bot tek makinede systemd kullanıcı servisi olarak çalışıyor (D-BARINDIRMA);
 * bu yüzden yerel yedek, veri kaybına karşı tek savunma.
 */

export const YEDEK_DIZINI = path.join(path.dirname(VARSAYILAN_YOL), 'yedekler');

/** Dosya adı deseni: sıralama ve ayıklama buna dayanır. */
const AD_DESENI = /^bot-(\d{8})-(\d{6})\.sqlite$/;

export function yedekAdi(tarih = new Date()) {
  const p = (n, u = 2) => String(n).padStart(u, '0');
  const g = `${tarih.getFullYear()}${p(tarih.getMonth() + 1)}${p(tarih.getDate())}`;
  const s = `${p(tarih.getHours())}${p(tarih.getMinutes())}${p(tarih.getSeconds())}`;
  return `bot-${g}-${s}.sqlite`;
}

/** Yedek dizinindeki yedekleri yeniden eskiye sıralı döndürür. */
export function yedekleriListele(dizin = YEDEK_DIZINI) {
  let dosyalar;
  try {
    dosyalar = readdirSync(dizin);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return dosyalar
    .filter((ad) => AD_DESENI.test(ad))
    .map((ad) => {
      const tam = path.join(dizin, ad);
      const bilgi = statSync(tam);
      return { ad, yol: tam, boyut: bilgi.size, zaman: bilgi.mtimeMs };
    })
    .sort((a, b) => b.ad.localeCompare(a.ad));
}

/**
 * Sayıdan eski yedekleri siler.
 * @returns {string[]} silinen dosya adları
 */
export function rotasyon(saklanan, dizin = YEDEK_DIZINI) {
  const sinir = Math.max(1, Math.floor(saklanan));
  const silinen = [];

  for (const yedek of yedekleriListele(dizin).slice(sinir)) {
    try {
      unlinkSync(yedek.yol);
      silinen.push(yedek.ad);
    } catch {
      // Silinemeyen tek dosya (izin, kilit) rotasyonu durdurmamalı.
    }
  }

  return silinen;
}

/**
 * Tek bir yedek alır ve rotasyonu uygular.
 *
 * @returns {{ok: true, ad: string, yol: string, boyut: number, sureMs: number, silinen: string[]}
 *          | {ok: false, sebep: string}}
 */
export function yedekAl({ db = veritabani(), dizin = YEDEK_DIZINI, saklanan = null,
  tarih = new Date() } = {}) {
  const basladi = Date.now();

  try {
    mkdirSync(dizin, { recursive: true });
  } catch (error) {
    return { ok: false, sebep: `Yedek dizini açılamadı: ${error.message}` };
  }

  const ad = yedekAdi(tarih);
  const hedef = path.join(dizin, ad);

  try {
    // Yol tırnak içinde: sqlite string sabiti bekler, parametre kabul etmez.
    db.exec(`VACUUM INTO '${hedef.replaceAll("'", "''")}'`);
  } catch (error) {
    return { ok: false, sebep: `Yedek alınamadı: ${error.message}` };
  }

  const boyut = statSync(hedef).size;
  const silinen = saklanan === null ? [] : rotasyon(saklanan, dizin);

  return { ok: true, ad, yol: hedef, boyut, sureMs: Date.now() - basladi, silinen };
}

/** Boyutu okunur birime çevirir. */
export function boyutBicimle(bayt) {
  if (!Number.isFinite(bayt) || bayt < 0) return 'bilinmiyor';
  const birimler = ['B', 'KB', 'MB', 'GB'];
  let deger = bayt;
  let i = 0;
  while (deger >= 1024 && i < birimler.length - 1) {
    deger /= 1024;
    i += 1;
  }
  return `${deger < 10 && i > 0 ? deger.toFixed(1) : Math.round(deger)} ${birimler[i]}`;
}

/**
 * Periyodik yedeklemeyi başlatır. Açılışta bir kez alır: bot uzun süre kapalı
 * kalıp açıldığında ilk periyodu beklemeden elde güncel bir yedek olur.
 *
 * @returns {() => void} durdurma fonksiyonu
 */
export function yedekDongusuBaslat({ db = veritabani(), guildId = null, logger = console,
  dizin = YEDEK_DIZINI, periyotMs = null } = {}) {
  const ayarOku = (anahtar, varsayilan) => {
    if (!guildId) return varsayilan;
    try {
      return ayarGetir(db, guildId, anahtar) ?? varsayilan;
    } catch {
      return varsayilan;
    }
  };

  let calisiyor = false;

  const tur = () => {
    if (calisiyor) return;
    calisiyor = true;
    try {
      if (guildId && !sistemAcikMi(db, guildId, 'yedek')) return;

      const sonuc = yedekAl({ db, dizin, saklanan: ayarOku('yedek.saklanan', 14) });
      if (sonuc.ok) {
        const not = sonuc.silinen.length > 0 ? `, ${sonuc.silinen.length} eski yedek silindi` : '';
        logger.log(`Yedek alındı: ${sonuc.ad} (${boyutBicimle(sonuc.boyut)}, ${sonuc.sureMs} ms${not})`);
      } else {
        // Disk dolu veya izin hatası botu düşürmemeli; sonraki tur yeniden dener.
        logger.error(sonuc.sebep);
      }
    } catch (error) {
      logger.error('Yedekleme turu hata verdi:', error.message);
    } finally {
      calisiyor = false;
    }
  };

  tur();

  const aralik = periyotMs ?? ayarOku('yedek.periyotSaat', 12) * 3_600_000;
  const zamanlayici = setInterval(tur, aralik);
  zamanlayici.unref?.();

  return () => clearInterval(zamanlayici);
}
