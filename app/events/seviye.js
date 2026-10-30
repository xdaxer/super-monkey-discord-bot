import { Events } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { xpKanalindaMi, xpKazandirirMi, xpVer } from '../lib/seviye.js';
import { xpBonusu, xpSonrasi } from '../lib/seviye-odul.js';

export const name = Events.MessageCreate;

// Yalnız mesajın varlığı sayılıyor, içeriği okunmuyor: MessageContent gerekmez.
export const gerekliIntent = ['GuildMessages'];

export async function execute(message) {
  if (!message.guild) return;

  const db = veritabani();
  const guildId = message.guild.id;

  if (!sistemAcikMi(db, guildId, 'seviye')) return;
  if (!xpKazandirirMi(message).ok) return;
  if (!xpKanalindaMi(message, ayarGetir(db, guildId, 'seviye.kanallar'))) return;

  const sonuc = xpVer(db, {
    guildId, kullaniciId: message.author.id,
    bonus: xpBonusu(db, guildId, message.member ?? { id: message.author.id }),
  });
  if (!sonuc.verildi) return;

  await xpSonrasi(db, {
    guild: message.guild, member: message.member, kullaniciId: message.author.id,
    sonuc, client: message.client,
  });
}
