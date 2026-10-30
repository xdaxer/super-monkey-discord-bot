/**
 * Activity'de geçen süre (yalnız yönetici panelinde görünür). Arayüz açık ve
 * kullanılırken (görünür sekme, son BOSTA_MS içinde etkileşim) NABIZ_MS'de bir
 * nabız atar; iki nabız arası KOPMA_MS'yi geçmezse aradaki süre o oturuma ve
 * o anki ekrana yazılır, geçerse yeni oturum başlar. Süreyi sunucu ölçer:
 * nabızları sıklaştırmak gerçek geçen zamandan fazlasını yazdıramaz.
 */

import { trGunu } from './ekonomi.js';

export const NABIZ_MS = 60_000;
export const KOPMA_MS = 150_000;
export const BOSTA_MS = 5 * 60_000;

const EKRAN_DESENI = /^[a-z][a-z0-9-]{0,29}$/;
const UYE_SINIRI = 100;
const GUN_SINIRI = 60;

/** Nabız: süreyi son oturuma ve ekrana ekler; eklenen ms'yi döner. */
export function nabizKaydet(db, {
  guildId, kullaniciId, ekran, simdi = Date.now(),
}) {
  const g = String(guildId);
  const k = String(kullaniciId);
  const ad = EKRAN_DESENI.test(ekran ?? '') ? ekran : 'diger';
  const son = db
    .prepare('SELECT id, son FROM arayuz_oturumlari WHERE guild_id = ? AND kullanici_id = ? ORDER BY son DESC LIMIT 1')
    .get(g, k);

  if (!son || simdi - son.son > KOPMA_MS) {
    db.prepare('INSERT INTO arayuz_oturumlari (guild_id, kullanici_id, baslangic, son) VALUES (?, ?, ?, ?)').run(g, k, simdi, simdi);
    return 0;
  }
  const eklenen = Math.max(0, simdi - son.son);
  if (eklenen === 0) return 0;
  db.prepare('UPDATE arayuz_oturumlari SET son = ?, sure_ms = sure_ms + ? WHERE id = ?').run(simdi, eklenen, son.id);
  db.prepare(
    `INSERT INTO arayuz_sureleri (guild_id, kullanici_id, gun, ekran, sure_ms) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id, gun, ekran) DO UPDATE SET sure_ms = sure_ms + excluded.sure_ms`,
  ).run(g, k, trGunu(simdi), ad, eklenen);
  return eklenen;
}

/**
 * Yönetici özeti. `baslangic` null ise bütün kayıtlar. Gün ve ekran kırılımı
 * Türkiye gününe göredir (başlangıcın günü dahil).
 */
export function kullanimOzeti(db, guildId, { baslangic = null, simdi = Date.now() } = {}) {
  const g = String(guildId);
  const gun = baslangic === null ? '' : trGunu(baslangic);
  const zaman = baslangic ?? 0;

  const toplam = db
    .prepare('SELECT COALESCE(SUM(sure_ms), 0) AS ms, COUNT(DISTINCT kullanici_id) AS kisi FROM arayuz_sureleri WHERE guild_id = ? AND gun >= ?')
    .get(g, gun);
  const oturum = db
    .prepare('SELECT COUNT(*) AS adet, COALESCE(MAX(sure_ms), 0) AS en_uzun FROM arayuz_oturumlari WHERE guild_id = ? AND son >= ?')
    .get(g, zaman);

  const gunluk = db
    .prepare(
      `SELECT gun, SUM(sure_ms) AS ms, COUNT(DISTINCT kullanici_id) AS kisi FROM arayuz_sureleri
       WHERE guild_id = ? AND gun >= ? GROUP BY gun ORDER BY gun DESC LIMIT ?`,
    )
    .all(g, gun, GUN_SINIRI)
    .reverse()
    .map((s) => ({ gun: s.gun, ms: s.ms, kisi: s.kisi }));

  const ekranlar = db
    .prepare(
      `SELECT ekran, SUM(sure_ms) AS ms, COUNT(DISTINCT kullanici_id) AS kisi FROM arayuz_sureleri
       WHERE guild_id = ? AND gun >= ? GROUP BY ekran ORDER BY ms DESC`,
    )
    .all(g, gun)
    .map((s) => ({ ekran: s.ekran, ms: s.ms, kisi: s.kisi }));

  // Üye satırı: süre gün tablosundan, oturum sayısı ve son görülme oturumlardan.
  const uyeler = new Map();
  const uye = (id) => {
    if (!uyeler.has(id)) uyeler.set(id, { kullaniciId: id, ms: 0, oturum: 0, enUzun: 0, son: 0, ekran: null });
    return uyeler.get(id);
  };
  for (const s of db
    .prepare('SELECT kullanici_id, ekran, SUM(sure_ms) AS ms FROM arayuz_sureleri WHERE guild_id = ? AND gun >= ? GROUP BY kullanici_id, ekran')
    .all(g, gun)) {
    const u = uye(s.kullanici_id);
    u.ms += s.ms;
    // En çok vakit geçirdiği ekran.
    if (!u.ekran || s.ms > u.ekranMs) Object.assign(u, { ekran: s.ekran, ekranMs: s.ms });
  }
  for (const s of db
    .prepare(
      `SELECT kullanici_id, COUNT(*) AS adet, MAX(sure_ms) AS en_uzun, MAX(son) AS son FROM arayuz_oturumlari
       WHERE guild_id = ? AND son >= ? GROUP BY kullanici_id`,
    )
    .all(g, zaman)) {
    Object.assign(uye(s.kullanici_id), { oturum: s.adet, enUzun: s.en_uzun, son: s.son });
  }

  const simdiAktif = db
    .prepare('SELECT kullanici_id, baslangic, son FROM arayuz_oturumlari WHERE guild_id = ? AND son >= ? ORDER BY baslangic')
    .all(g, simdi - KOPMA_MS)
    .map((s) => ({ kullaniciId: s.kullanici_id, baslangic: s.baslangic, son: s.son }));

  return {
    toplamMs: toplam.ms,
    kisi: toplam.kisi,
    oturum: oturum.adet,
    ortalamaOturumMs: oturum.adet > 0 ? Math.round(toplam.ms / oturum.adet) : 0,
    enUzunOturumMs: oturum.en_uzun,
    gunluk,
    ekranlar,
    uyeler: [...uyeler.values()]
      .sort((a, b) => b.ms - a.ms || b.son - a.son)
      .slice(0, UYE_SINIRI)
      .map(({ ekranMs, ...u }) => u),
    simdiAktif,
  };
}
