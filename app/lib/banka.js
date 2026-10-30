/**
 * Banka: vadeli mevduat. Muz seçilen süre boyunca kilitlenir, vade dolunca
 * anapara + faiz kendiliğinden hesaba geçer (servisler/banka.js). Erken
 * bozulursa faiz verilmez ve anaparadan ceza kesilir.
 *
 * Faiz yeni muz yaratır; enflasyonu sınırlamak için kilitlenebilecek toplam
 * anapara seviyeye bağlı bir tavanla sınırlı. Sayılar docs/para.md ile aynı.
 */

import {
  dus, ekle, islem, TURLER,
} from './ekonomi.js';
import { aktifKredi } from './kredi.js';

const GUN = 86_400_000;

/**
 * Vade seçenekleri; faiz vade sonunda bir kez, anapara üzerinden. 2026-10-23'te
 * süreler yarıya indi, oranlar aynı kaldı (1g/3g/7g/14g → 12sa/1,5g/3,5g/7g).
 * Günlük getiri vadeyle artar; kısa vadeleri art arda açmak uzun vadeyi geçmez
 * (12sa×3 %12,5 < %14; 36sa+36sa+12sa %35 < %40; 84sa×2 %96 < %100).
 * Günlük getiri artık kredinin günlük maliyetini geçebildiği için (lib/kredi.js)
 * açık kredisi olan mevduat açamaz: kredi alıp bankaya yatırmak kâr ettirmez.
 */
export const VADELER = [
  { kimlik: '12sa', ad: '12 saat', ms: GUN / 2, yuzde: 4 },
  { kimlik: '36sa', ad: '1,5 gün', ms: 1.5 * GUN, yuzde: 14 },
  { kimlik: '84sa', ad: '3,5 gün', ms: 3.5 * GUN, yuzde: 40 },
  { kimlik: '7g', ad: '7 gün', ms: 7 * GUN, yuzde: 100 },
];

export const MEVDUAT_MIN = 1_000;
export const AKTIF_SINIRI = 5;
/** Erken bozmada anaparadan kesilen pay (%). */
export const ERKEN_CEZA_YUZDE = 10;
export const TAVAN_TABAN = 20_000;
export const TAVAN_SEVIYE_BASINA = 5_000;
export const TAVAN_MAKS = 500_000;

export const DURUMLAR = Object.freeze({ aktif: 'aktif', odendi: 'odendi', bozuldu: 'bozuldu' });

export function vadeGetir(kimlik) {
  return VADELER.find((v) => v.kimlik === kimlik) ?? null;
}

/** Kilitlenebilecek toplam anapara: 20.000 + 5.000 × seviye, en çok 500.000. */
export function mevduatTavani(seviye) {
  return Math.min(TAVAN_MAKS, TAVAN_TABAN + TAVAN_SEVIYE_BASINA * Math.max(0, Math.floor(seviye)));
}

export function faizHesapla(anapara, yuzde) {
  return Math.floor((anapara * yuzde) / 100);
}

export function aktifMevduatlar(db, guildId, kullaniciId) {
  return db
    .prepare(
      `SELECT * FROM mevduatlar WHERE guild_id = ? AND kullanici_id = ? AND durum = ?
       ORDER BY vade ASC, id ASC`,
    )
    .all(String(guildId), String(kullaniciId), DURUMLAR.aktif);
}

export function mevduatGetir(db, id) {
  return db.prepare('SELECT * FROM mevduatlar WHERE id = ?').get(id) ?? null;
}

/** Bankadaki toplam kilitli anapara. */
export function kilitliToplam(db, guildId, kullaniciId) {
  return aktifMevduatlar(db, guildId, kullaniciId).reduce((t, m) => t + m.anapara, 0);
}

/**
 * Mevduat açar: muz bakiyeden düşülür ve kilitlenir.
 * @returns {{ok: false, sebep: string} | {ok: true, mevduat: object, faiz: number}}
 */
export function yatir(db, {
  guildId, kullaniciId, miktar, vade: vadeKimlik, seviye = 0, simdi = Date.now(),
}) {
  const vade = vadeGetir(vadeKimlik);
  if (!vade) return { ok: false, sebep: 'Geçersiz vade.' };
  if (!Number.isSafeInteger(miktar) || miktar < MEVDUAT_MIN) {
    return { ok: false, sebep: `En az ${MEVDUAT_MIN.toLocaleString('tr-TR')} muz yatırabilirsin.` };
  }

  return islem(db, () => {
    if (aktifKredi(db, guildId, kullaniciId)) {
      return { ok: false, sebep: 'Açık kredin varken mevduat açamazsın; önce krediyi kapat (`/kredi ode`).' };
    }
    const aktif = aktifMevduatlar(db, guildId, kullaniciId);
    if (aktif.length >= AKTIF_SINIRI) {
      return { ok: false, sebep: `Aynı anda en çok ${AKTIF_SINIRI} mevduatın olabilir.` };
    }
    const tavan = mevduatTavani(seviye);
    const kilitli = aktif.reduce((t, m) => t + m.anapara, 0);
    if (kilitli + miktar > tavan) {
      return {
        ok: false,
        sebep: `Bankaya en çok ${tavan.toLocaleString('tr-TR')} muz kilitleyebilirsin (seviyeyle artar); `
          + `şu an ${kilitli.toLocaleString('tr-TR')} kilitli, en çok ${Math.max(0, tavan - kilitli).toLocaleString('tr-TR')} daha.`,
      };
    }

    const kalan = dus(db, { guildId, kullaniciId, miktar, tur: TURLER.mevduat, simdi });
    if (kalan === null) return { ok: false, sebep: 'Bakiyen yetmiyor.' };

    const { lastInsertRowid } = db.prepare(
      `INSERT INTO mevduatlar (guild_id, kullanici_id, anapara, faiz_yuzde, baslangic, vade, durum)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(String(guildId), String(kullaniciId), miktar, vade.yuzde, simdi, simdi + vade.ms, DURUMLAR.aktif);

    return { ok: true, mevduat: mevduatGetir(db, Number(lastInsertRowid)), faiz: faizHesapla(miktar, vade.yuzde), bakiye: kalan };
  });
}

/**
 * Vadesi dolmuş mevduatları öder: anapara + faiz hesaba geçer. Koşullu
 * UPDATE ile durum değiştirildiği için iki tur aynı mevduatı iki kez ödeyemez.
 * `kullanici` verilirse yalnız onunkiler.
 * @returns {Array<{id: number, guild_id: string, kullanici_id: string, anapara: number, faiz: number}>}
 */
export function vadesiGelenleriOde(db, { simdi = Date.now(), guildId = null, kullaniciId = null } = {}) {
  const kosul = kullaniciId ? 'AND guild_id = ? AND kullanici_id = ?' : '';
  const parametreler = kullaniciId ? [String(guildId), String(kullaniciId)] : [];
  const gelenler = db
    .prepare(`SELECT * FROM mevduatlar WHERE durum = ? AND vade <= ? ${kosul} ORDER BY vade ASC`)
    .all(DURUMLAR.aktif, simdi, ...parametreler);

  const odenen = [];
  for (const m of gelenler) {
    islem(db, () => {
      const faiz = faizHesapla(m.anapara, m.faiz_yuzde);
      const { changes } = db
        .prepare('UPDATE mevduatlar SET durum = ?, odenen = ?, kapanis = ? WHERE id = ? AND durum = ?')
        .run(DURUMLAR.odendi, m.anapara + faiz, simdi, m.id, DURUMLAR.aktif);
      if (changes === 0) return;
      const ortak = { guildId: m.guild_id, kullaniciId: m.kullanici_id, karsiId: `mevduat-${m.id}`, simdi };
      ekle(db, { ...ortak, miktar: m.anapara, tur: TURLER.mevduat });
      if (faiz > 0) ekle(db, { ...ortak, miktar: faiz, tur: TURLER.faiz });
      odenen.push({ id: m.id, guild_id: m.guild_id, kullanici_id: m.kullanici_id, anapara: m.anapara, faiz });
    });
  }
  return odenen;
}

/**
 * Mevduatı vadesinden önce bozar: faiz yok, anaparadan %10 ceza.
 * @returns {{ok: false, sebep: string} | {ok: true, iade: number, ceza: number}}
 */
export function boz(db, {
  guildId, kullaniciId, id, simdi = Date.now(),
}) {
  return islem(db, () => {
    const m = mevduatGetir(db, id);
    if (!m || m.guild_id !== String(guildId) || m.kullanici_id !== String(kullaniciId)) {
      return { ok: false, sebep: 'Böyle bir mevduatın yok. Numaralara **Banka → Mevduat** ekranından bak.' };
    }
    if (m.durum !== DURUMLAR.aktif) return { ok: false, sebep: 'Bu mevduat zaten kapanmış.' };
    if (m.vade <= simdi) {
      vadesiGelenleriOde(db, { simdi, guildId, kullaniciId });
      return { ok: false, sebep: 'Vadesi dolmuştu; faiziyle birlikte hesabına geçti.' };
    }

    const ceza = Math.floor((m.anapara * ERKEN_CEZA_YUZDE) / 100);
    const iade = m.anapara - ceza;
    db.prepare('UPDATE mevduatlar SET durum = ?, odenen = ?, kapanis = ? WHERE id = ?')
      .run(DURUMLAR.bozuldu, iade, simdi, m.id);
    if (iade > 0) {
      ekle(db, {
        guildId, kullaniciId, miktar: iade, tur: TURLER.mevduat, karsiId: `mevduat-${m.id}`, simdi,
      });
    }
    return { ok: true, iade, ceza };
  });
}
