import { Events } from 'discord.js';

import { gomu } from '../lib/bicim.js';
import { icerikGoster, logGonder } from '../lib/log.js';

export const olaylar = [
  {
    name: Events.MessageDelete,
    gerekliIntent: ['GuildMessages'],
    async execute(message) {
      if (!message.guild || message.author?.bot) return;

      const embed = gomu('hata', 'Mesaj silindi')
        .addFields(
          { name: 'Yazan', value: message.author ? `<@${message.author.id}>` : 'bilinmiyor', inline: true },
          { name: 'Kanal', value: `<#${message.channelId}>`, inline: true },
          { name: 'İçerik', value: icerikGoster(message.content) },
        );

      await logGonder(message.client, message.guild.id, 'log.olay.mesajSil', embed);
    },
  },
  {
    name: Events.MessageUpdate,
    gerekliIntent: ['GuildMessages'],
    async execute(eski, yeni) {
      if (!yeni.guild || yeni.author?.bot) return;
      // İçerik değişmediyse (gömme yüklenmesi gibi) log üretmiyoruz.
      if (eski.content === yeni.content) return;

      const embed = gomu('uyari', 'Mesaj düzenlendi')
        .addFields(
          { name: 'Yazan', value: yeni.author ? `<@${yeni.author.id}>` : 'bilinmiyor', inline: true },
          { name: 'Kanal', value: `<#${yeni.channelId}>`, inline: true },
          { name: 'Önce', value: icerikGoster(eski.content, 500) },
          { name: 'Sonra', value: icerikGoster(yeni.content, 500) },
        );

      if (yeni.url) embed.setDescription(`[Mesaja git](${yeni.url})`);

      await logGonder(yeni.client, yeni.guild.id, 'log.olay.mesajDuzenle', embed);
    },
  },
  {
    name: Events.MessageBulkDelete,
    gerekliIntent: ['GuildMessages'],
    async execute(mesajlar, kanal) {
      if (!kanal?.guild) return;

      // Önbellekteki mesajların özeti; eskileri bot görmemişse yalnız sayı kalır.
      const satirlar = [...mesajlar.values()]
        .filter((m) => m.author)
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => `**${m.author.username}:** ${icerikGoster(m.content, 120)}`);

      const embed = gomu('hata', `${mesajlar.size} mesaj toplu silindi`)
        .addFields({ name: 'Kanal', value: `<#${kanal.id}>` });
      if (satirlar.length) embed.setDescription(satirlar.join('\n').slice(0, 4000));

      await logGonder(kanal.client, kanal.guild.id, 'log.olay.mesajSil', embed);
    },
  },
];
