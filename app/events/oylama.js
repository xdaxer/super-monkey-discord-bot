import { Events, PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { kanalYetkisiKontrol } from '../lib/izin.js';
import { oylanirMi, tepkileriEkle } from '../lib/oylama.js';

export const name = Events.MessageCreate;

// İçerik okunmuyor, yalnız mesajın varlığı yetiyor: MessageContent gerekmez.
export const gerekliIntent = ['GuildMessages'];

export async function execute(message) {
  if (!message.guild) return;

  const db = veritabani();
  const guildId = message.guild.id;

  if (!sistemAcikMi(db, guildId, 'oylama')) return;

  const kanalId = ayarGetir(db, guildId, 'oylama.kanal');
  if (!kanalId || message.channelId !== kanalId) return;

  if (!oylanirMi(message, message.client?.user?.id ?? null).ok) return;

  const botUye = message.guild.members.me;
  if (botUye && !kanalYetkisiKontrol(message.channel, botUye, PermissionFlagsBits.AddReactions).ok) {
    return;
  }

  await tepkileriEkle(message);
}
