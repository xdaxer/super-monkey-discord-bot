/**
 * Komut kanal sınırı: bir sistemin komutları yalnız yöneticinin seçtiği
 * kanallarda (ve bu kanalların thread'lerinde) çalışsın.
 *
 * Şimdilik yalnız ekonomi (`ekonomi.kanallar`). Liste boşsa sınır yoktur.
 * Muaf komutlar modülde `export const kanalMuaf = true` ile işaretlenir
 * (yönetici komutları). Butonlar buradan geçmez: mesaj izinli kanalda açılmıştır.
 */

import { ayarGetir } from './ayarlar.js';

/** Sistem → kanal listesi ayarı. */
export const KANAL_AYARLARI = Object.freeze({
  ekonomi: { anahtar: 'ekonomi.kanallar', ad: 'Ekonomi komutları' },
});

/**
 * Komut bu kanalda çalışabilir mi?
 * @returns {string | null} Reddedilirse kullanıcıya gösterilecek metin; izinliyse null.
 */
export function kanalSiniriMesaji(db, interaction, command) {
  const kural = command?.sistem ? KANAL_AYARLARI[command.sistem] : null;
  if (!kural || command.kanalMuaf || !interaction.guildId) return null;

  const liste = ayarGetir(db, interaction.guildId, kural.anahtar);
  if (!Array.isArray(liste) || liste.length === 0) return null;

  const kanal = interaction.channel;
  // Thread'ler üst kanalın iznini taşır.
  const ust = kanal?.isThread?.() ? kanal.parentId : null;
  if (liste.includes(String(interaction.channelId)) || (ust && liste.includes(String(ust)))) return null;

  return `${kural.ad} yalnız ${liste.map((k) => `<#${k}>`).join(', ')} kanallarında kullanılabilir.`;
}
