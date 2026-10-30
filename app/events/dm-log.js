import { Events, PermissionFlagsBits } from 'discord.js';

import { ayarGetir } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { aktarilirMi, dmGomusu, dmIcerigi } from '../lib/dm-log.js';
import { izinliGuild } from '../lib/guild-kilidi.js';
import { kanalYetkisiKontrol } from '../lib/izin.js';

export const name = Events.MessageCreate;

// DM içeriği MessageContent olmadan da gelir; yalnız DirectMessages gerekir.
export const gerekliIntent = ['DirectMessages'];

export async function execute(message) {
  if (!aktarilirMi(message)) return;

  // Tek sunuculu bot: ayar izinli sunucudan okunur (D-SUNUCU-KILIDI).
  const guildId = izinliGuild();
  if (!guildId) return;
  const kanalId = ayarGetir(veritabani(), guildId, 'dm.logKanal');
  if (!kanalId) return;

  const kanal = await message.client.channels.fetch(kanalId).catch(() => null);
  if (!kanal?.isTextBased?.()) return;
  const botUye = kanal.guild?.members?.me;
  if (botUye && !kanalYetkisiKontrol(kanal, botUye, PermissionFlagsBits.SendMessages).ok) return;

  await kanal.send({
    content: dmIcerigi(message),
    embeds: [dmGomusu(message)],
    // Etiket yalnız tıklanabilir profil için; kimseye bildirim gitmez.
    allowedMentions: { parse: [] },
  }).catch(() => null);
}
