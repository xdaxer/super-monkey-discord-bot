/**
 * Katıl (YouTube üyelik) muz çarpanı: üyenin en yüksek kademesinin bonusu.
 *
 * Gelir yerleri (günlük, sohbet, /calis, görev) üye nesnesi taşımaz; bu yüzden
 * üyelik rolleri `uyelik_rolleri` tablosuna aynalanır (events/uyelik.js) ve
 * çarpan oradan okunur. Prestij çarpanıyla ÇARPILARAK birleşir.
 * Ekonomi modülleri bunu içe aktarır. ayarlar.js'i İÇE AKTARMAZ: ayarlar →
 * rozet-rol → esyalar → ekonomi zinciri döngü kurar ve esyalar'ın üst düzey
 * SERI_KORUYUCU kullanımı bozulur (prestij-carpan.js ile aynı sebep). Bu
 * yüzden ayar tablosu burada doğrudan okunur; varsayılanlar uyelik.js'tedir.
 */

import { enIyiKademe, kademeBonusAnahtari, UYELIK_KADEMELERI } from './uyelik.js';

const VARSAYILAN = new Map(UYELIK_KADEMELERI.map(({ no, bonusYuzde }) => [kademeBonusAnahtari(no), bonusYuzde]));

/** ayarlar tablosundan tek değer; yoksa ya da bozuksa varsayılan. */
function oku(db, guildId, anahtar, varsayilan) {
  const satir = db
    .prepare('SELECT deger FROM ayarlar WHERE guild_id = ? AND anahtar = ?')
    .get(String(guildId), anahtar);
  if (!satir) return varsayilan;
  try {
    return JSON.parse(satir.deger);
  } catch {
    return varsayilan;
  }
}

function islem(db, fn) {
  db.exec('SAVEPOINT uyelik');
  try {
    fn();
    db.exec('RELEASE uyelik');
  } catch (error) {
    db.exec('ROLLBACK TO uyelik');
    db.exec('RELEASE uyelik');
    throw error;
  }
}

function yaz(db, guildId, kullaniciId, rolIdleri) {
  const g = String(guildId);
  const k = String(kullaniciId);
  db.prepare('DELETE FROM uyelik_rolleri WHERE guild_id = ? AND kullanici_id = ?').run(g, k);
  const ekle = db.prepare('INSERT OR IGNORE INTO uyelik_rolleri (guild_id, kullanici_id, rol_id) VALUES (?, ?, ?)');
  for (const rolId of rolIdleri) ekle.run(g, k, String(rolId));
}

/** Bir üyenin üyelik rollerini yazar (boş liste = üyelik yok). */
export function uyelikRolleriYaz(db, guildId, kullaniciId, rolIdleri) {
  islem(db, () => yaz(db, guildId, kullaniciId, rolIdleri));
}

/**
 * Bütün sunucuyu yeniden kurar: listede olmayanların satırları silinir.
 * @param {Array<{kullaniciId: string, rolIdleri: string[]}>} uyeler
 */
export function uyelikleriEsitle(db, guildId, uyeler) {
  islem(db, () => {
    db.prepare('DELETE FROM uyelik_rolleri WHERE guild_id = ?').run(String(guildId));
    for (const { kullaniciId, rolIdleri } of uyeler) yaz(db, guildId, kullaniciId, rolIdleri);
  });
}

/**
 * Üyenin geçerli kademesi; sistem kapalıysa ya da kademesi yoksa null.
 * @returns {{no: number, rolId: string, yuzde: number} | null}
 */
export function uyelikKademesi(db, guildId, kullaniciId) {
  // Varsayılan kapalı (SISTEMLER.uyelik); test bunu ayarlar.js ile karşılaştırır.
  if (!oku(db, guildId, 'sistem.uyelik', false)) return null;
  const roller = db
    .prepare('SELECT rol_id FROM uyelik_rolleri WHERE guild_id = ? AND kullanici_id = ?')
    .all(String(guildId), String(kullaniciId))
    .map((s) => s.rol_id);
  if (roller.length === 0) return null;
  return enIyiKademe(roller, (anahtar) => oku(db, guildId, anahtar, VARSAYILAN.get(anahtar) ?? null));
}

/** Üyenin muz kazanç çarpanı: kademesi yoksa 1, +%25 kademede 1.25. */
export function uyelikCarpani(db, guildId, kullaniciId) {
  const kademe = uyelikKademesi(db, guildId, kullaniciId);
  return kademe ? (100 + kademe.yuzde) / 100 : 1;
}
