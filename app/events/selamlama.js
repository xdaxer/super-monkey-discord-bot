import { Events, PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { PINGSIZ } from '../lib/bicim.js';
import { veritabani } from '../lib/db.js';
import { selamGrubu } from '../lib/selamlama.js';

/**
 * Aynı kişi üst üste selam yazarsa bot yankı makinesine dönmesin. Süre kısa
 * tutuluyor: amaç sel baskınını kesmek, normal sohbette araya girmemek.
 */
export const BEKLEME_MS = 5_000;

const sonCevap = new Map();

/**
 * Anahtar (kanal+kullanıcı) hâlâ bekleme süresindeyse true döner; değilse
 * "şimdi cevaplandı" diye işaretler. Yan etkili, çünkü kontrol ve işaretleme
 * arasında ikinci bir mesaj geçmesin.
 */
export function beklemedeMi(anahtar, simdi = Date.now(), bekleme = BEKLEME_MS) {
  const son = sonCevap.get(anahtar);
  if (son !== undefined && simdi - son < bekleme) return true;

  sonCevap.set(anahtar, simdi);

  // Süresi dolmuş kayıtlar sonsuza dek birikmesin.
  if (sonCevap.size > 500) {
    for (const [k, t] of sonCevap) if (simdi - t >= bekleme) sonCevap.delete(k);
  }

  return false;
}

export const name = Events.MessageCreate;
export const gerekliIntent = ['GuildMessages', 'MessageContent'];

export async function execute(message) {
  if (!message.guild || message.author?.bot) return;

  const db = veritabani();
  const guildId = message.guild.id;

  if (!sistemAcikMi(db, guildId, 'selamlama')) return;

  const kanalId = ayarGetir(db, guildId, 'selamlama.kanal');
  if (!kanalId || message.channelId !== kanalId) return;

  const grup = selamGrubu(message.content);
  if (!grup) return;

  const botUye = message.guild.members.me;
  if (botUye && !message.channel.permissionsFor(botUye)?.has(PermissionFlagsBits.SendMessages)) {
    return;
  }

  if (beklemedeMi(`${message.channelId}:${message.author.id}`)) return;

  const cevap = ayarGetir(db, guildId, grup.ayar);
  await message.reply({ content: cevap, ...PINGSIZ });
}
