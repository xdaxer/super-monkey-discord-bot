/**
 * Rol mağazası: yönetici bir rolü muz fiyatıyla satışa koyar, üye satın alır.
 *
 * Satın almada önce bakiye düşülür, sonra rol verilir; rol verilemezse
 * (yetki/hiyerarşi değişmiş olabilir) para iade edilir. Kimse parasını verip
 * rolü alamadan kalmaz.
 */

import { dus, ekle, TURLER } from './ekonomi.js';

/** Bir sunucuda satıştaki en çok rol: Discord seçenek sınırı (25). */
export const URUN_SINIRI = 25;
export const FIYAT_MAX = 100_000_000;

export function urunler(db, guildId) {
  return db
    .prepare('SELECT id, rol_id, fiyat FROM magaza_urunleri WHERE guild_id = ? ORDER BY fiyat ASC, id ASC')
    .all(String(guildId));
}

export function urunGetir(db, guildId, rolId) {
  return db
    .prepare('SELECT id, rol_id, fiyat FROM magaza_urunleri WHERE guild_id = ? AND rol_id = ?')
    .get(String(guildId), String(rolId)) ?? null;
}

/**
 * Ürünü ekler; aynı rol zaten satıştaysa fiyatını günceller.
 * @returns {{ok: true, guncellendi: boolean} | {ok: false, sebep: string}}
 */
export function urunEkle(db, { guildId, rolId, fiyat, ekleyenId, simdi = Date.now() }) {
  if (!Number.isSafeInteger(fiyat) || fiyat < 1 || fiyat > FIYAT_MAX) {
    return { ok: false, sebep: 'Fiyat 1 ile 100.000.000 arasında bir tam sayı olmalı.' };
  }
  const mevcut = urunGetir(db, guildId, rolId);
  if (!mevcut && urunler(db, guildId).length >= URUN_SINIRI) {
    return { ok: false, sebep: `Mağazada en çok ${URUN_SINIRI} rol olabilir.` };
  }

  db.prepare(
    `INSERT INTO magaza_urunleri (guild_id, rol_id, fiyat, ekleyen_id, eklenme) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, rol_id) DO UPDATE SET fiyat = excluded.fiyat`,
  ).run(String(guildId), String(rolId), fiyat, String(ekleyenId), simdi);

  return { ok: true, guncellendi: Boolean(mevcut) };
}

export function urunKaldir(db, guildId, rolId) {
  return db.prepare('DELETE FROM magaza_urunleri WHERE guild_id = ? AND rol_id = ?')
    .run(String(guildId), String(rolId)).changes > 0;
}

/**
 * Rol satışa konabilir mi: @everyone, entegrasyon/bot rolü ve botun
 * kendi en üst rolüne eşit ya da üstündeki roller verilemez.
 */
export function rolSatilabilirMi(rol, botEnUstPozisyon) {
  if (!rol) return { ok: false, sebep: 'Rol bulunamadı.' };
  if (rol.id === rol.guild?.id) return { ok: false, sebep: '@everyone satılamaz.' };
  if (rol.managed) return { ok: false, sebep: 'Bot veya entegrasyon rolleri satılamaz.' };
  if (rol.position >= botEnUstPozisyon) {
    return { ok: false, sebep: 'Bu rol botun rolünün üstünde ya da aynı hizada; bot veremez.' };
  }
  return { ok: true };
}

/**
 * Satın alma. `rolVer` Discord'a rolü veren async fonksiyondur; hata atarsa
 * düşülen muz iade edilir.
 *
 * @returns {Promise<{ok: true, bakiye: number} | {ok: false, sebep: string}>}
 */
export async function satinAl(db, { guildId, kullaniciId, urun, rolVer, simdi = Date.now() }) {
  const kalan = dus(db, {
    guildId, kullaniciId, miktar: urun.fiyat, tur: TURLER.magaza, karsiId: urun.rol_id, simdi,
  });
  if (kalan === null) return { ok: false, sebep: 'Bakiyen bu role yetmiyor.' };

  try {
    await rolVer();
  } catch {
    ekle(db, { guildId, kullaniciId, miktar: urun.fiyat, tur: TURLER.iade, karsiId: urun.rol_id, simdi });
    return { ok: false, sebep: 'Rol verilemedi (botun yetkisi yetmiyor olabilir); muzun iade edildi.' };
  }

  return { ok: true, bakiye: kalan };
}
