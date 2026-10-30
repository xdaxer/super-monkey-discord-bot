/**
 * Rozet rolleri: her rozetin bir Discord rolü vardır; rozeti alan üyeye
 * (mağaza ya da kasa) rolü de verilir. Rozetler koleksiyon olduğu için
 * seviye rollerinin aksine üye sahip olduğu bütün rozet rollerini taşır.
 *
 * Roller `npm run rozetrol` ile açılır, seviye rollerinin hemen üstüne
 * değerine göre sıralanır (en değerlinin rengi görünür) ve kimlikleri
 * `rozet.rol.<ad>` ayarlarına yazılır. Rol ikonu sunucu Boost seviyesi 2
 * istediği için ad başında balon simgesi var.
 */

import { ESYALAR } from './esyalar.js';

/** Rozet kimliği → rol rengi (BTD balon renkleri). */
export const ROZET_RENKLERI = {
  'rozet-kirmizi': 0xe74c3c,
  'rozet-mavi': 0x3498db,
  'rozet-yesil': 0x2ecc71,
  'rozet-sari': 0xf1c40f,
  'rozet-pembe': 0xff79c6,
  'rozet-siyah': 0x2c2f33,
  'rozet-gokkusagi': 0x9b59b6,
  'rozet-seramik': 0xa0522d,
  'rozet-altin': 0xffd700,
  'rozet-moab': 0x1f75fe,
  'rozet-bfb': 0xc0392b,
  'rozet-zomg': 0x27ae60,
  'rozet-bad': 0x8e44ad,
};

/** Katalog sırasındaki rozetler (en değerlisi sonda). */
export const ROZETLER = ESYALAR.filter((e) => e.tur === 'rozet');

export function rozetRolAnahtari(kimlik) {
  return `rozet.rol.${kimlik.replace(/^rozet-/, '')}`;
}

export function rozetRolAdi(rozet) {
  return `🎈 ${rozet.ad}`;
}

/** Ayar okuyucudan rozet → rol kimliği tablosu: `oku(anahtar)` ayar değerini döndürür. */
export function rozetRolIdleri(oku) {
  return Object.fromEntries(ROZETLER.map((r) => [r.kimlik, oku(rozetRolAnahtari(r.kimlik)) ?? null]));
}

/**
 * Üyeye rozetin rolünü verir. Rol kurulmamışsa, silinmişse, botun üstündeyse
 * ya da üyede zaten varsa hiçbir şey yapmaz; rol vermek rozeti almanın
 * parçası değil, süsü. Hata atmaz.
 *
 * @returns {Promise<string|null>} verilen rolün kimliği
 */
export async function rozetRoluVer(uye, kimlik, oku, sebep = 'Rozet rolü') {
  const rolId = oku(rozetRolAnahtari(kimlik));
  if (!rolId || !uye?.roles?.cache || uye.roles.cache.has(rolId)) return null;
  const rol = uye.guild?.roles?.cache?.get(rolId);
  if (!rol?.editable) return null;
  try {
    await uye.roles.add(rolId, sebep);
    return rolId;
  } catch {
    return null;
  }
}
