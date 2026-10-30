/**
 * /calis enerjisi: en çok 100, 36 sn'de 1 dolar (boştan 1 saatte dolu). Kayıt
 * tembeldir: `calismalar.enerji` son yazıldığı andaki değer, `enerji_zaman` o
 * an; şu anki değer aradan geçen süreyle hesaplanır (hiç çalışmamış = dolu).
 *
 * Ayrı dosya: hem meslekler.js (çalışma) hem esyalar.js (Enerji Totemi)
 * kullanır, döngüsel içe aktarma olmasın diye bağımlılığı yoktur.
 */

export const ENERJI_MAKS = 100;
export const ENERJI_DOLUM_MS = 36_000;

/** Şu anki enerji: kayıttan bu yana dolan kadar, en çok ENERJI_MAKS (hiç çalışmamış = dolu). */
export function enerjiHesapla(satir, simdi = Date.now()) {
  if (!satir?.enerji_zaman) return ENERJI_MAKS;
  return Math.min(ENERJI_MAKS, satir.enerji + Math.max(0, simdi - satir.enerji_zaman) / ENERJI_DOLUM_MS);
}

/** Kullanıcının şu anki enerjisi. */
export function enerjiOku(db, guildId, kullaniciId, simdi = Date.now()) {
  const satir = db
    .prepare('SELECT enerji, enerji_zaman FROM calismalar WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));
  return enerjiHesapla(satir, simdi);
}

/** Enerjiyi `deger`e yazar (0 ile ENERJI_MAKS arasına sıkıştırılır); yazılanı döner. */
export function enerjiYaz(db, guildId, kullaniciId, deger, simdi = Date.now()) {
  const enerji = Math.min(ENERJI_MAKS, Math.max(0, deger));
  db.prepare(
    `INSERT INTO calismalar (guild_id, kullanici_id, enerji, enerji_zaman) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET enerji = excluded.enerji, enerji_zaman = excluded.enerji_zaman`,
  ).run(String(guildId), String(kullaniciId), enerji, simdi);
  return enerji;
}

/** Enerjiye `miktar` ekler (eksi olabilir); yeni değeri döner. */
export function enerjiEkle(db, guildId, kullaniciId, miktar, simdi = Date.now()) {
  return enerjiYaz(db, guildId, kullaniciId, enerjiOku(db, guildId, kullaniciId, simdi) + miktar, simdi);
}
