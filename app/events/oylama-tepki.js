import { Events, PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { kanalYetkisiKontrol } from '../lib/izin.js';
import { kendiOyuMu } from '../lib/oylama.js';

export const name = Events.MessageReactionAdd;

// Tepki olayları bu intent'e bağlı; ayrıcalıklı değil.
export const gerekliIntent = ['GuildMessageReactions'];

/**
 * Kendine oy engeli: oylama kanalında bir üye kendi mesajına ⬆️/⬇️ basarsa
 * tepkisi hemen geri alınır.
 *
 * Discord bir tepkinin eklenmesini engellemeye izin vermiyor; yapılabilecek
 * tek şey eklendikten sonra kaldırmak. Kullanıcı kısa bir an kendi oyunu
 * görebilir, sonra kaybolur.
 *
 * Sessizce kaldırıyoruz: kanalda her kendine oy denemesi için bir uyarı
 * mesajı, oylama kanalını sohbete çevirirdi.
 */
export async function execute(tepki, kullanici) {
  if (kullanici?.bot) return;

  // Önbellekte olmayan mesaj/tepki partial gelir; yazarı ve emojiyi
  // okuyabilmek için önce tamamlanmalı.
  try {
    if (tepki.partial) await tepki.fetch();
    if (tepki.message?.partial) await tepki.message.fetch();
  } catch {
    // Mesaj silinmişse tamamlanamaz; yapacak bir şey yok.
    return;
  }

  const mesaj = tepki.message;
  if (!mesaj?.guild) return;

  const db = veritabani();
  const guildId = mesaj.guild.id;

  if (!sistemAcikMi(db, guildId, 'oylama')) return;

  const kanalId = ayarGetir(db, guildId, 'oylama.kanal');
  if (!kanalId || mesaj.channelId !== kanalId) return;

  const kendi = kendiOyuMu({
    emoji: tepki.emoji?.name,
    tepkiVeren: kullanici.id,
    mesajYazari: mesaj.author?.id,
    botId: mesaj.client?.user?.id ?? null,
  });
  if (!kendi) return;

  // Başkasının tepkisini kaldırmak Mesajları Yönet istiyor. Yetki yoksa
  // sessizce geçiyoruz: olay işleyicisinin kanala hata yazması doğru değil.
  const botUye = mesaj.guild.members.me;
  if (botUye && !kanalYetkisiKontrol(mesaj.channel, botUye, PermissionFlagsBits.ManageMessages).ok) {
    return;
  }

  await tepki.users.remove(kullanici.id).catch(() => null);
}
