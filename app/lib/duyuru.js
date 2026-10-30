/**
 * Yönetici bildirimleri: Activity'de açılır pencere olarak düşen duyurular
 * (web/rotalar/olaylar.js yoklamasıyla). Herkese ya da seçili üyelere
 * gönderilir; geçerlilik süresi boyunca Activity'yi sonradan açan da görür.
 * Her cihaz bir duyuruyu bir kez gösterir (ön yüz hatırlar).
 * Tasarım kuralı gereği emoji yoktur: `ikon` sabit bir listeden seçilir.
 */

export const IKONLAR = Object.freeze(['megafon', 'bilgi', 'uyari', 'hediye', 'kutlama', 'muz', 'yildiz', 'takvim']);
export const BASLIK_UZUNLUK = 80;
export const METIN_UZUNLUK = 1000;
export const ALICI_SINIRI = 50;
export const SURE_MIN_MS = 10 * 60_000;
export const SURE_MAX_MS = 7 * 86_400_000;

const satir = (r) => ({
  id: r.id,
  baslik: r.baslik,
  metin: r.metin,
  ikon: r.ikon,
  alicilar: r.alicilar ? JSON.parse(r.alicilar) : null,
  gonderenId: r.gonderen_id,
  zaman: r.zaman,
  bitis: r.bitis,
});

/**
 * Bildirim oluşturur. `alicilar` boş/null ise herkese.
 * @returns {{ok: false, sebep: string} | {ok: true, id: number}}
 */
export function duyuruGonder(db, {
  guildId, baslik, metin, ikon, alicilar = null, gonderenId, sureMs, simdi = Date.now(),
}) {
  const b = String(baslik ?? '').trim();
  const m = String(metin ?? '').trim();
  if (!b) return { ok: false, sebep: 'Başlık yazılmalı.' };
  if (b.length > BASLIK_UZUNLUK) return { ok: false, sebep: `Başlık en çok ${BASLIK_UZUNLUK} karakter olabilir.` };
  if (!m) return { ok: false, sebep: 'Mesaj yazılmalı.' };
  if (m.length > METIN_UZUNLUK) return { ok: false, sebep: `Mesaj en çok ${METIN_UZUNLUK} karakter olabilir.` };
  if (!IKONLAR.includes(ikon)) return { ok: false, sebep: 'Bilinmeyen ikon.' };
  if (!Number.isFinite(sureMs) || sureMs < SURE_MIN_MS || sureMs > SURE_MAX_MS) {
    return { ok: false, sebep: 'Geçerlilik en az 10 dakika, en çok 7 gün olmalı.' };
  }
  let liste = null;
  if (alicilar && alicilar.length > 0) {
    liste = [...new Set(alicilar.map(String))];
    if (liste.length > ALICI_SINIRI) return { ok: false, sebep: `Seçili gönderimde en çok ${ALICI_SINIRI} üye olabilir.` };
  }
  const r = db.prepare(
    `INSERT INTO duyurular (guild_id, baslik, metin, ikon, alicilar, gonderen_id, zaman, bitis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(String(guildId), b, m, ikon, liste ? JSON.stringify(liste) : null, String(gonderenId), simdi, simdi + sureMs);
  return { ok: true, id: Number(r.lastInsertRowid) };
}

/** Üyenin şu an görmesi gereken bildirimler (eskiden yeniye). */
export function uyeninDuyurulari(db, guildId, kullaniciId, simdi = Date.now()) {
  return db
    .prepare('SELECT * FROM duyurular WHERE guild_id = ? AND bitis > ? ORDER BY zaman ASC, id ASC')
    .all(String(guildId), simdi)
    .map(satir)
    .filter((d) => d.alicilar === null || d.alicilar.includes(String(kullaniciId)));
}

/** Yönetim listesi: yeniden eskiye son `limit` bildirim. */
export function duyuruListesi(db, guildId, limit = 30) {
  return db
    .prepare('SELECT * FROM duyurular WHERE guild_id = ? ORDER BY zaman DESC, id DESC LIMIT ?')
    .all(String(guildId), limit)
    .map(satir);
}

/** Bildirimi geri çeker: henüz görmemiş olana artık düşmez. */
export function duyuruSil(db, guildId, id) {
  const silindi = db.prepare('DELETE FROM duyurular WHERE guild_id = ? AND id = ?').run(String(guildId), id).changes > 0;
  return silindi ? { ok: true } : { ok: false, sebep: 'Bu bildirim bulunamadı.' };
}
