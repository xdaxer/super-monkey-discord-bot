/**
 * Yönetici muz çarpanı: bot sahibi ve yetkili geliştiriciler (.env →
 * authorUserID, developerUserIDs) emek gelirlerinde ek çarpan alır.
 *
 * Prestij ve Katıl çarpanıyla aynı yerlere (/gunluk, sohbet, /calis, görev
 * muzu) ÇARPILARAK uygulanır; kumar, satış, faiz, kasa ve düello çarpansızdır.
 * Aynı sebeple yönetici ile üye arasında takas ve hediye kapalıdır
 * (`yoneticiUyeArasi`); yöneticiler kendi aralarında aktarabilir.
 * Liste .env'den okunur, ekonomi modüllerine bağımlılık yoktur (döngü kurmaz).
 * Sayılar docs/para.md ile aynıdır.
 */

import { yetkiliKimlikler } from './izin.js';

export const YONETICI_CARPAN = 5;

/** Kullanıcının yönetici çarpanı: listede ise YONETICI_CARPAN, değilse 1. */
export function yoneticiCarpani(kullaniciId, kimlikler = yetkiliKimlikler()) {
  return kimlikler.includes(String(kullaniciId)) ? YONETICI_CARPAN : 1;
}

/**
 * Biri yönetici diğeri üye mi? Yönetici geliri çarpanlı olduğundan bu ikili
 * arasında eşya aktarımı (takas, hediye) üyeye karşılıksız değer taşır.
 */
export function yoneticiUyeArasi(a, b, kimlikler = yetkiliKimlikler()) {
  return kimlikler.includes(String(a)) !== kimlikler.includes(String(b));
}

export const YONETICI_AKTARIM_SEBEBI = 'Yöneticilerle üyeler arasında takas ve hediye kapalı; yöneticiler yalnız kendi aralarında aktarabilir.';
