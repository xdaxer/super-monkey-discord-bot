/**
 * Prestij rolleri (isteğe bağlı): her prestij seviyesinin bir Discord rolü
 * ("🌟 Prestij 3") vardır; üyede yalnız ulaştığı en yüksek seviyenin rolü durur.
 *
 * Roller `npm run prestijrol` ile açılır ve kimlikleri `prestij.rol.<n>`
 * ayarlarına yazılır. Rol kurulmamışsa hiçbir şey olmaz: prestij rolsüz de
 * tam çalışır.
 */

import { MAKS_PRESTIJ } from './prestij-carpan.js';

/** 1..MAKS_PRESTIJ */
export const PRESTIJ_SEVIYELERI = Object.freeze(Array.from({ length: MAKS_PRESTIJ }, (_, i) => i + 1));

/** Rol rengi: tüm seviyeler aynı altın tonu (sıra adda görünür). */
export const PRESTIJ_ROL_RENGI = 0xf1c40f;

export function prestijRolAnahtari(seviye) {
  return `prestij.rol.${seviye}`;
}

export function prestijRolAdi(seviye) {
  return `🌟 Prestij ${seviye}`;
}

/**
 * Üyeye seviyenin rolünü verir, daha düşük prestij rollerini alır. Rol
 * kurulmamışsa, botun üstündeyse ya da hata olursa sessizce geçer; rol süstür.
 *
 * @param {(anahtar: string) => string|null} oku ayar okuyucu
 * @returns {Promise<string|null>} verilen rolün kimliği
 */
export async function prestijRoluVer(uye, seviye, oku, sebep = 'Prestij rolü') {
  const rolId = oku(prestijRolAnahtari(seviye));
  if (!rolId || !uye?.roles?.cache) return null;
  const rol = uye.guild?.roles?.cache?.get(rolId);
  if (!rol?.editable) return null;
  try {
    if (!uye.roles.cache.has(rolId)) await uye.roles.add(rolId, sebep);
    const eskiler = PRESTIJ_SEVIYELERI
      .filter((n) => n !== seviye)
      .map((n) => oku(prestijRolAnahtari(n)))
      .filter((id) => id && uye.roles.cache.has(id));
    if (eskiler.length > 0) await uye.roles.remove(eskiler, sebep);
    return rolId;
  } catch {
    return null;
  }
}
