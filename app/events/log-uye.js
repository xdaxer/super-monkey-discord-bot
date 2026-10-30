import { Events } from 'discord.js';

import { gomu } from '../lib/bicim.js';
import { izinliGuild } from '../lib/guild-kilidi.js';
import { alanDegisimleri, logGonder, rolFarki, sesDegisimi } from '../lib/log.js';

const SES_BASLIK = {
  giris: ['basari', 'Ses kanalına girdi'],
  cikis: ['hata', 'Ses kanalından çıktı'],
  gecis: ['bilgi', 'Ses kanalı değiştirdi'],
};

const rolListesi = (idler) => idler.map((id) => `<@&${id}>`).join(' ');

export const olaylar = [
  {
    name: Events.VoiceStateUpdate,
    gerekliIntent: ['GuildVoiceStates'],
    async execute(eski, yeni) {
      const uye = yeni.member ?? eski.member;
      if (!yeni.guild || uye?.user?.bot) return;

      const tur = sesDegisimi(eski.channelId, yeni.channelId);
      if (!tur) return;

      const [renk, baslik] = SES_BASLIK[tur];
      const kanalMetni = {
        giris: `<#${yeni.channelId}>`,
        cikis: `<#${eski.channelId}>`,
        gecis: `<#${eski.channelId}> → <#${yeni.channelId}>`,
      }[tur];

      const embed = gomu(renk, baslik, `<@${yeni.id}> · ${kanalMetni}`);
      if (uye) embed.setAuthor({ name: uye.user.username, iconURL: uye.displayAvatarURL({ size: 64 }) });

      await logGonder(yeni.client, yeni.guild.id, 'log.olay.ses', embed);
    },
  },
  {
    name: Events.GuildMemberUpdate,
    gerekliIntent: ['GuildMembers'],
    async execute(eski, yeni) {
      if (yeni.user.bot) return;
      const { client, guild } = yeni;

      // Eski üye önbellekte yoksa roller bilinmiyor; yanlış "hepsi eklendi" logu atmayalım.
      if (!eski.partial) {
        const { eklenen, cikan } = rolFarki(eski.roles.cache.keys(), yeni.roles.cache.keys());
        if (eklenen.length || cikan.length) {
          const embed = gomu(eklenen.length ? 'basari' : 'uyari', 'Üyenin rolleri değişti', `<@${yeni.id}>`)
            .setAuthor({ name: yeni.user.username, iconURL: yeni.displayAvatarURL({ size: 64 }) });
          if (eklenen.length) embed.addFields({ name: 'Eklenen', value: rolListesi(eklenen).slice(0, 1024) });
          if (cikan.length) embed.addFields({ name: 'Alınan', value: rolListesi(cikan).slice(0, 1024) });
          await logGonder(client, guild.id, 'log.olay.uyeRol', embed);
        }
      }

      const satirlar = alanDegisimleri(eski, yeni, [
        ['Takma ad', (m) => m.nickname],
        ['Sunucu avatarı', (m) => m.avatar, { yalnizDegisti: true }],
      ]);
      if (satirlar.length === 0 || eski.partial) return;

      const embed = gomu('bilgi', 'Üye profili değişti', `<@${yeni.id}>\n${satirlar.join('\n')}`)
        .setThumbnail(yeni.displayAvatarURL({ size: 128 }));
      await logGonder(client, guild.id, 'log.olay.uyeProfil', embed);
    },
  },
  {
    // Kullanıcı adı ve genel avatar sunucuya değil hesaba ait; tek guild
    // kapsamında (D-SUNUCU-KILIDI) izinli sunucunun loguna yazılır.
    name: Events.UserUpdate,
    gerekliIntent: ['GuildMembers'],
    async execute(eski, yeni) {
      if (yeni.bot || eski.partial) return;

      const guild = yeni.client.guilds.cache.get(izinliGuild());
      if (!guild?.members.cache.has(yeni.id)) return;

      const satirlar = alanDegisimleri(eski, yeni, [
        ['Kullanıcı adı', (u) => u.username],
        ['Görünen ad', (u) => u.globalName],
        ['Avatar', (u) => u.avatar, { yalnizDegisti: true }],
      ]);
      if (satirlar.length === 0) return;

      const embed = gomu('bilgi', 'Kullanıcı profili değişti', `<@${yeni.id}>\n${satirlar.join('\n')}`)
        .setThumbnail(yeni.displayAvatarURL({ size: 128 }));
      await logGonder(yeni.client, guild.id, 'log.olay.uyeProfil', embed);
    },
  },
];
