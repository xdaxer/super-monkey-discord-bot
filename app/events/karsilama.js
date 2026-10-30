import { AttachmentBuilder, Events, PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { gomu, PINGSIZ, zaman } from '../lib/bicim.js';
import { veritabani } from '../lib/db.js';
import { karsilamaKarti, sablonDoldur } from '../lib/gorsel.js';
import { logGonder } from '../lib/log.js';

/** Şablon yer tutucularını üye nesnesinden üretir. */
export function sablonVerileri(member) {
  return {
    kullanici: `<@${member.id}>`,
    kullaniciAdi: member.user.username,
    kullaniciEtiket: member.user.tag ?? member.user.username,
    sunucu: member.guild.name,
    uyeSayisi: member.guild.memberCount ?? 0,
  };
}

async function karsilamaGonder(member, { acikAnahtar, kanalAnahtar, mesajAnahtar, baslik, vurgu }) {
  const db = veritabani();
  const guildId = member.guild.id;

  if (!sistemAcikMi(db, guildId, 'karsilama')) return false;

  const kanalId = ayarGetir(db, guildId, kanalAnahtar);
  if (!kanalId) return false;

  const kanal = await member.client.channels.fetch(kanalId).catch(() => null);
  if (!kanal?.isTextBased?.()) return false;

  const botUye = member.guild.members.me;
  if (botUye && !kanal.permissionsFor(botUye)?.has(PermissionFlagsBits.SendMessages)) {
    return false;
  }

  const metin = sablonDoldur(ayarGetir(db, guildId, mesajAnahtar), sablonVerileri(member));
  const yuk = { content: metin, ...PINGSIZ };

  if (acikAnahtar && ayarGetir(db, guildId, acikAnahtar)) {
    const png = await karsilamaKarti({
      avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
      baslik,
      kullaniciAdi: member.user.username,
      altYazi: `${member.guild.name} · ${member.guild.memberCount} üye`,
      vurgu,
    });

    if (png) {
      yuk.files = [new AttachmentBuilder(png, { name: 'karsilama.png' })];
    }
  }

  await kanal.send(yuk).catch(() => null);
  return true;
}

export const olaylar = [
  {
    name: Events.GuildMemberAdd,
    gerekliIntent: ['GuildMembers'],
    async execute(member) {
      await karsilamaGonder(member, {
        acikAnahtar: 'karsilama.gorsel',
        kanalAnahtar: 'karsilama.kanal',
        mesajAnahtar: 'karsilama.mesaj',
        baslik: 'Hoş geldin!',
        vurgu: '#57f287',
      });

      const embed = gomu('basari', 'Üye katıldı')
        .addFields(
          { name: 'Üye', value: `<@${member.id}> (\`${member.id}\`)` },
          { name: 'Hesap oluşturuldu', value: zaman(member.user.createdTimestamp) },
          { name: 'Toplam üye', value: String(member.guild.memberCount ?? '?'), inline: true },
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }));

      await logGonder(member.client, member.guild.id, 'log.olay.uyeGiris', embed);
    },
  },
  {
    name: Events.GuildMemberRemove,
    gerekliIntent: ['GuildMembers'],
    async execute(member) {
      await karsilamaGonder(member, {
        acikAnahtar: null,
        kanalAnahtar: 'ugurlama.kanal',
        mesajAnahtar: 'ugurlama.mesaj',
        baslik: 'Güle güle',
        vurgu: '#ed4245',
      });

      const embed = gomu('uyari', 'Üye ayrıldı')
        .addFields(
          { name: 'Üye', value: `${member.user.tag ?? member.user.username} (\`${member.id}\`)` },
          {
            name: 'Sunucuya katılmıştı',
            value: member.joinedTimestamp ? zaman(member.joinedTimestamp) : 'bilinmiyor',
          },
          { name: 'Kalan üye', value: String(member.guild.memberCount ?? '?'), inline: true },
        );

      await logGonder(member.client, member.guild.id, 'log.olay.uyeCikis', embed);
    },
  },
];
