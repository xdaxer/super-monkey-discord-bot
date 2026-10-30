import { Events } from 'discord.js';

import { ayarGetir } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { yanitHedefi, yanitIletilirMi } from '../lib/dm-log.js';

/** Discord "Cannot send messages to this user": DM'ler kapalı ya da ortak sunucu yok. */
const DM_KAPALI = 50007;

/**
 * dm.logKanal'da bir aktarım mesajına verilen yanıtı o kullanıcıya DM olarak
 * gönderir. Başarıda ✅, başarısızlıkta ❌ ve nedenini yazar.
 */
export const name = Events.MessageCreate;

// Yanıtın metnini okumak için sunucu mesajı içeriği gerekir.
export const gerekliIntent = ['GuildMessages', 'MessageContent'];

export async function execute(message) {
  if (!message.guildId || message.author.bot || !message.reference?.messageId) return;

  const kanalId = ayarGetir(veritabani(), message.guildId, 'dm.logKanal');
  if (!kanalId || message.channelId !== kanalId) return;
  if (!yanitIletilirMi(message.content, message.attachments.size)) return;

  const yanitlanan = await message.fetchReference().catch(() => null);
  const hedefId = yanitHedefi(yanitlanan, message.client.user.id);
  if (!hedefId) return;

  try {
    const kullanici = await message.client.users.fetch(hedefId);
    await kullanici.send({
      content: message.content || undefined,
      files: [...message.attachments.values()].map((ek) => ({ attachment: ek.url, name: ek.name })),
      allowedMentions: { parse: [] },
    });
    await message.react('✅').catch(() => null);
  } catch (error) {
    await message.react('❌').catch(() => null);
    const sebep = error.code === DM_KAPALI
      ? 'kullanıcının DM\'leri kapalı ya da botla ortak sunucusu yok'
      : error.message;
    await message.reply({ content: `İletilemedi: ${sebep}.`, allowedMentions: { parse: [] } }).catch(() => null);
  }
}
