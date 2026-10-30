/**
 * Web API rotalarının ortak yardımcıları: kullanıcıya gösterilecek hata,
 * lib sonucunu ({ok, sebep}) hataya çevirme ve gövde alanı okuma.
 */

/** Kullanıcıya gösterilecek hata; `durum` HTTP kodu. Metin lib'in `sebep`i gibi markdown taşıyabilir. */
export class WebHatasi extends Error {
  constructor(mesaj, durum = 400) {
    super(mesaj);
    this.durum = durum;
  }
}

/** Kullanıcı hatası fırlatır. */
export function hata(sebep, durum = 400) {
  throw new WebHatasi(sebep, durum);
}

/** lib'in `{ok: false, sebep}` sonucunu hataya çevirir, başarılıysa sonucu döner. */
export function basarili(sonuc) {
  if (!sonuc?.ok) throw new WebHatasi(sonuc?.sebep ?? 'İşlem yapılamadı.');
  return sonuc;
}

/** Gövdeden metin alanı; zorunluysa ve yoksa hata. */
export function metin(govde, ad, { zorunlu = true, uzunluk = 100 } = {}) {
  const deger = govde?.[ad];
  if (deger === undefined || deger === null || deger === '') {
    if (zorunlu) hata(`\`${ad}\` eksik.`);
    return null;
  }
  if (typeof deger !== 'string' && typeof deger !== 'number') hata(`\`${ad}\` geçersiz.`);
  const s = String(deger).trim();
  if (s.length > uzunluk) hata(`\`${ad}\` çok uzun.`);
  return s;
}

/** Gövdeden tam sayı alanı; sınır dışıysa hata. */
export function tamSayi(govde, ad, { zorunlu = true, min = -Infinity, max = Infinity, varsayilan = null } = {}) {
  const deger = govde?.[ad];
  if (deger === undefined || deger === null || deger === '') {
    if (zorunlu) hata(`\`${ad}\` eksik.`);
    return varsayilan;
  }
  const n = Number(deger);
  if (!Number.isSafeInteger(n) || n < min || n > max) hata(`\`${ad}\` ${min}–${max} arası bir tam sayı olmalı.`);
  return n;
}

/** Discord kimliği (snowflake) doğrulaması. */
export function kimlikMi(deger) {
  return typeof deger === 'string' && /^\d{5,25}$/.test(deger);
}
