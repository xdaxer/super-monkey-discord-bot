/**
 * Promosyon kodları: yönetici yayında ya da duyuruda bir kod dağıtır; kod
 * süresi boyunca (varsayılan 1 saat) kullanan her üyeye bir kez muz verir.
 * İsteğe bağlı kullanım sınırı ilk N kişiyle sınırlar. Ödül defterde `promo`
 * türüyle yazılır (yoktan basılan muz; ekonomi panelinde ayrı satır).
 * Ekonomiden uzaklaştırılan üye kod kullanamaz (giriş noktaları engeller,
 * burada da denetlenir).
 */

import { ekle, islem, TURLER } from './ekonomi.js';
import { uzakMi } from './ekonomi-uzak.js';

export const KOD_DESENI = /^[A-Z0-9-]{3,24}$/;
export const ODUL_MIN = 1;
export const ODUL_MAX = 1_000_000;
export const SINIR_MAX = 10_000;
export const SURE_MIN_MS = 5 * 60_000;
export const SURE_MAX_MS = 7 * 86_400_000;

/** Kullanıcı girişini kod biçimine getirir: boşluksuz, büyük harf (Türkçe i/ı dahil). */
export function kodNormallestir(metin) {
  return String(metin ?? '').trim().replace(/\s+/g, '').toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
}

const satir = (r) => (r ? {
  id: r.id, kod: r.kod, odul: r.odul, sinir: r.sinir, olusturanId: r.olusturan_id, zaman: r.zaman, bitis: r.bitis,
} : null);

function kullanimSayisi(db, kodId) {
  return db.prepare('SELECT COUNT(*) AS n FROM promo_kullanimlari WHERE kod_id = ?').get(kodId).n;
}

/**
 * Kod oluşturur. Aynı kod daha önce kullanıldıysa (süresi dolmuş olsa da) reddedilir.
 * @returns {{ok: false, sebep: string} | {ok: true, id: number, kod: string, bitis: number}}
 */
export function promoOlustur(db, {
  guildId, kod, odul, sinir = null, sureMs, olusturanId, simdi = Date.now(),
}) {
  const k = kodNormallestir(kod);
  if (!KOD_DESENI.test(k)) return { ok: false, sebep: 'Kod 3–24 karakter olmalı; yalnız harf, rakam ve tire.' };
  if (!Number.isSafeInteger(odul) || odul < ODUL_MIN || odul > ODUL_MAX) {
    return { ok: false, sebep: `Ödül ${ODUL_MIN} ile ${ODUL_MAX.toLocaleString('tr-TR')} muz arasında olmalı.` };
  }
  if (sinir !== null && (!Number.isSafeInteger(sinir) || sinir < 1 || sinir > SINIR_MAX)) {
    return { ok: false, sebep: `Kullanım sınırı 1 ile ${SINIR_MAX.toLocaleString('tr-TR')} arasında olmalı (boş = sınırsız).` };
  }
  if (!Number.isFinite(sureMs) || sureMs < SURE_MIN_MS || sureMs > SURE_MAX_MS) {
    return { ok: false, sebep: 'Süre en az 5 dakika, en çok 7 gün olmalı.' };
  }
  const var_ = db.prepare('SELECT 1 FROM promo_kodlari WHERE guild_id = ? AND kod = ?').get(String(guildId), k);
  if (var_) return { ok: false, sebep: `**${k}** daha önce oluşturulmuş; başka bir kod seç.` };
  const r = db.prepare(
    `INSERT INTO promo_kodlari (guild_id, kod, odul, sinir, olusturan_id, zaman, bitis)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(String(guildId), k, odul, sinir, String(olusturanId), simdi, simdi + sureMs);
  return {
    ok: true, id: Number(r.lastInsertRowid), kod: k, bitis: simdi + sureMs,
  };
}

/**
 * Kodu kullanır: ödülü bir kez verir. Tek işlemde: sınır ve tekrar denetimi yarışa kapalı.
 * @returns {{ok: false, sebep: string} | {ok: true, kod: string, odul: number, bakiye: number}}
 */
export function promoKullan(db, {
  guildId, kullaniciId, kod, simdi = Date.now(),
}) {
  const k = kodNormallestir(kod);
  if (!k) return { ok: false, sebep: 'Kodu yaz.' };
  if (uzakMi(db, guildId, kullaniciId)) return { ok: false, sebep: 'Ekonomiden uzaklaştırıldığın için kod kullanamazsın.' };
  return islem(db, () => {
    const p = satir(db.prepare('SELECT * FROM promo_kodlari WHERE guild_id = ? AND kod = ?').get(String(guildId), k));
    if (!p) return { ok: false, sebep: 'Böyle bir kod yok. Harfleri kontrol et.' };
    if (p.bitis <= simdi) return { ok: false, sebep: `**${p.kod}** kodunun süresi doldu.` };
    if (db.prepare('SELECT 1 FROM promo_kullanimlari WHERE kod_id = ? AND kullanici_id = ?').get(p.id, String(kullaniciId))) {
      return { ok: false, sebep: `**${p.kod}** kodunu zaten kullandın.` };
    }
    if (p.sinir !== null && kullanimSayisi(db, p.id) >= p.sinir) return { ok: false, sebep: `**${p.kod}** kodunun kullanım hakkı doldu.` };
    db.prepare('INSERT INTO promo_kullanimlari (kod_id, kullanici_id, zaman) VALUES (?, ?, ?)').run(p.id, String(kullaniciId), simdi);
    const bakiye = ekle(db, {
      guildId, kullaniciId, miktar: p.odul, tur: TURLER.promo, karsiId: `promo-${p.id}`, simdi,
    });
    return {
      ok: true, kod: p.kod, odul: p.odul, bakiye,
    };
  });
}

/** Yönetim listesi: yeniden eskiye, kullanım sayısıyla. */
export function promoListesi(db, guildId, limit = 30) {
  return db
    .prepare('SELECT * FROM promo_kodlari WHERE guild_id = ? ORDER BY zaman DESC, id DESC LIMIT ?')
    .all(String(guildId), limit)
    .map((r) => ({ ...satir(r), kullanim: kullanimSayisi(db, r.id) }));
}

/** Kodu hemen sona erdirir (verilen ödüller geri alınmaz). */
export function promoBitir(db, guildId, id, simdi = Date.now()) {
  const r = db.prepare('UPDATE promo_kodlari SET bitis = ? WHERE guild_id = ? AND id = ? AND bitis > ?').run(simdi, String(guildId), id, simdi);
  return r.changes > 0 ? { ok: true } : { ok: false, sebep: 'Bu kod zaten bitmiş ya da yok.' };
}

/** Kodu kullananlar (yeniden eskiye). */
export function promoKullananlar(db, kodId) {
  return db
    .prepare('SELECT kullanici_id, zaman FROM promo_kullanimlari WHERE kod_id = ? ORDER BY zaman DESC')
    .all(kodId)
    .map((r) => ({ kullaniciId: r.kullanici_id, zaman: r.zaman }));
}
