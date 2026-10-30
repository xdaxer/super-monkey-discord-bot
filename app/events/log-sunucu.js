import { Events } from 'discord.js';

import { gomu } from '../lib/bicim.js';
import { alanDegisimleri, logGonder } from '../lib/log.js';

const KANAL_TURLERI = {
  0: 'metin', 2: 'ses', 4: 'kategori', 5: 'duyuru', 10: 'duyuru başlığı', 11: 'başlık', 12: 'özel başlık',
  13: 'sahne', 15: 'forum',
};

const KANAL_ALANLARI = [
  ['Ad', (k) => k.name],
  ['Konu', (k) => k.topic],
  ['Kategori', (k) => (k.parentId ? `<#${k.parentId}>` : null)],
  ['Yavaş mod (sn)', (k) => k.rateLimitPerUser],
  ['NSFW', (k) => k.nsfw],
  ['Bit hızı', (k) => (k.bitrate ? `${k.bitrate / 1000}kbps` : null)],
  ['Kişi sınırı', (k) => k.userLimit],
  ['Arşivli', (k) => k.archived],
  ['Kilitli', (k) => k.locked],
];

const ROL_ALANLARI = [
  ['Ad', (r) => r.name],
  ['Renk', (r) => r.hexColor],
  ['Ayrı göster', (r) => r.hoist],
  ['Etiketlenebilir', (r) => r.mentionable],
  ['İzinler', (r) => r.permissions?.bitfield?.toString(), { yalnizDegisti: true }],
  ['Simge', (r) => r.icon ?? r.unicodeEmoji, { yalnizDegisti: true }],
];

const SUNUCU_ALANLARI = [
  ['Ad', (g) => g.name],
  ['Simge', (g) => g.icon, { yalnizDegisti: true }],
  ['Afiş', (g) => g.banner, { yalnizDegisti: true }],
  ['AFK kanalı', (g) => (g.afkChannelId ? `<#${g.afkChannelId}>` : null)],
  ['Sistem kanalı', (g) => (g.systemChannelId ? `<#${g.systemChannelId}>` : null)],
  ['Doğrulama seviyesi', (g) => g.verificationLevel],
  ['Gizli URL', (g) => g.vanityURLCode],
];

/** Değişen izin üzerine yazmalarının sayısı; ayrıntı yerine kim etkilendi yazılır. */
function izinDegisimi(eski, yeni) {
  const once = eski.permissionOverwrites?.cache;
  const sonra = yeni.permissionOverwrites?.cache;
  if (!once || !sonra) return null;

  const idler = new Set([...once.keys(), ...sonra.keys()]);
  const etkilenen = [...idler].filter((id) => {
    const a = once.get(id);
    const b = sonra.get(id);
    return a?.allow.bitfield !== b?.allow.bitfield || a?.deny.bitfield !== b?.deny.bitfield;
  });
  if (etkilenen.length === 0) return null;

  const ad = (id) => ((once.get(id) ?? sonra.get(id)).type === 0 ? `<@&${id}>` : `<@${id}>`);
  return `**İzinler değişti:** ${etkilenen.map(ad).join(' ')}`.slice(0, 1000);
}

export const olaylar = [
  {
    name: Events.GuildBanAdd,
    async execute(ban) {
      const embed = gomu('hata', 'Kullanıcı yasaklandı')
        .addFields(
          { name: 'Kullanıcı', value: `${ban.user.tag ?? ban.user.username} (\`${ban.user.id}\`)` },
          { name: 'Gerekçe', value: ban.reason ?? 'Belirtilmedi' },
        );

      await logGonder(ban.client, ban.guild.id, 'log.olay.moderasyon', embed);
    },
  },
  {
    name: Events.GuildBanRemove,
    async execute(ban) {
      const embed = gomu('basari', 'Yasak kaldırıldı')
        .addFields({
          name: 'Kullanıcı',
          value: `${ban.user.tag ?? ban.user.username} (\`${ban.user.id}\`)`,
        });

      await logGonder(ban.client, ban.guild.id, 'log.olay.moderasyon', embed);
    },
  },
  {
    name: Events.ChannelCreate,
    async execute(kanal) {
      if (!kanal.guild) return;

      const embed = gomu('basari', 'Kanal oluşturuldu')
        .addFields(
          { name: 'Kanal', value: `<#${kanal.id}> (\`${kanal.name}\`)`, inline: true },
          { name: 'Tür', value: KANAL_TURLERI[kanal.type] ?? String(kanal.type), inline: true },
        );

      await logGonder(kanal.client, kanal.guild.id, 'log.olay.kanal', embed);
    },
  },
  {
    name: Events.ChannelDelete,
    async execute(kanal) {
      if (!kanal.guild) return;

      const embed = gomu('hata', 'Kanal silindi')
        .addFields(
          { name: 'Kanal', value: `\`${kanal.name}\` (\`${kanal.id}\`)`, inline: true },
          { name: 'Tür', value: KANAL_TURLERI[kanal.type] ?? String(kanal.type), inline: true },
        );

      await logGonder(kanal.client, kanal.guild.id, 'log.olay.kanal', embed);
    },
  },
  {
    name: Events.GuildRoleCreate,
    async execute(rol) {
      const embed = gomu('basari', 'Rol oluşturuldu')
        .addFields({ name: 'Rol', value: `<@&${rol.id}> (\`${rol.name}\`)` });

      await logGonder(rol.client, rol.guild.id, 'log.olay.rol', embed);
    },
  },
  {
    name: Events.GuildRoleDelete,
    async execute(rol) {
      const embed = gomu('hata', 'Rol silindi')
        .addFields({ name: 'Rol', value: `\`${rol.name}\` (\`${rol.id}\`)` });

      await logGonder(rol.client, rol.guild.id, 'log.olay.rol', embed);
    },
  },
  {
    name: Events.ChannelUpdate,
    async execute(eski, yeni) {
      if (!yeni.guild) return;

      const satirlar = alanDegisimleri(eski, yeni, KANAL_ALANLARI);
      const izin = izinDegisimi(eski, yeni);
      if (izin) satirlar.push(izin);
      if (satirlar.length === 0) return;

      const embed = gomu('bilgi', 'Kanal güncellendi', `<#${yeni.id}> (\`${yeni.name}\`)\n${satirlar.join('\n')}`);
      await logGonder(yeni.client, yeni.guild.id, 'log.olay.kanal', embed);
    },
  },
  {
    name: Events.ThreadCreate,
    async execute(baslik, yeniMi) {
      if (!baslik.guild || !yeniMi) return;

      const embed = gomu('basari', 'Başlık açıldı')
        .addFields(
          { name: 'Başlık', value: `<#${baslik.id}> (\`${baslik.name}\`)`, inline: true },
          { name: 'Üst kanal', value: baslik.parentId ? `<#${baslik.parentId}>` : '?', inline: true },
          { name: 'Açan', value: baslik.ownerId ? `<@${baslik.ownerId}>` : 'bilinmiyor', inline: true },
        );
      await logGonder(baslik.client, baslik.guild.id, 'log.olay.kanal', embed);
    },
  },
  {
    name: Events.ThreadDelete,
    async execute(baslik) {
      if (!baslik.guild) return;

      const embed = gomu('hata', 'Başlık silindi')
        .addFields(
          { name: 'Başlık', value: `\`${baslik.name}\` (\`${baslik.id}\`)`, inline: true },
          { name: 'Üst kanal', value: baslik.parentId ? `<#${baslik.parentId}>` : '?', inline: true },
        );
      await logGonder(baslik.client, baslik.guild.id, 'log.olay.kanal', embed);
    },
  },
  {
    name: Events.ThreadUpdate,
    async execute(eski, yeni) {
      if (!yeni.guild) return;

      const satirlar = alanDegisimleri(eski, yeni, KANAL_ALANLARI);
      if (satirlar.length === 0) return;

      const embed = gomu('bilgi', 'Başlık güncellendi', `<#${yeni.id}>\n${satirlar.join('\n')}`);
      await logGonder(yeni.client, yeni.guild.id, 'log.olay.kanal', embed);
    },
  },
  {
    name: Events.GuildRoleUpdate,
    async execute(eski, yeni) {
      // Sıra kaydırmaları (position) her rol için ayrı olay üretir; onları loglamıyoruz.
      const satirlar = alanDegisimleri(eski, yeni, ROL_ALANLARI);
      if (satirlar.length === 0) return;

      const embed = gomu('bilgi', 'Rol güncellendi', `<@&${yeni.id}> (\`${yeni.name}\`)\n${satirlar.join('\n')}`);
      await logGonder(yeni.client, yeni.guild.id, 'log.olay.rol', embed);
    },
  },
  {
    name: Events.GuildUpdate,
    async execute(eski, yeni) {
      const satirlar = alanDegisimleri(eski, yeni, SUNUCU_ALANLARI);
      if (satirlar.length === 0) return;

      const embed = gomu('bilgi', 'Sunucu ayarları değişti', satirlar.join('\n'));
      await logGonder(yeni.client, yeni.id, 'log.olay.sunucu', embed);
    },
  },
];
