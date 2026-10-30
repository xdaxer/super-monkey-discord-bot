import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { ayarGetir } from '../../lib/ayarlar.js';
import { gomu, PINGSIZ } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import {
  kullaniciGetir, SES_GUNLUK_AYAR, sesXpBugun, seviyeHesapla, sira, siralama,
} from '../../lib/seviye.js';
import { kademeBul, sonrakiKademe, toplamXpKademe } from '../../lib/seviye-rol.js';

export const sistem = 'seviye';
export const modul = 'seviye';

/** Sıralamada gösterilen kişi sayısı. */
export const SIRALAMA_ADEDI = 10;

export const data = new SlashCommandBuilder()
  .setName('seviye')
  .setDescription('Seviye ve XP durumunu gösterir.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('bilgi').setDescription('Kendi veya bir üyenin seviyesini gösterir.')
    .addUserOption((o) => o.setName('uye').setDescription('Kimin seviyesi (boşsa kendin)')))
  .addSubcommand((s) => s
    .setName('siralama').setDescription(`Sunucunun ilk ${SIRALAMA_ADEDI} üyesini gösterir.`));

/** İlerleme çubuğu: seviye içindeki XP oranını görsel olarak verir. */
export function ilerlemeCubugu(suAnki, sonraki, genislik = 12) {
  const oran = sonraki > 0 ? Math.min(1, Math.max(0, suAnki / sonraki)) : 0;
  const dolu = Math.round(oran * genislik);
  return `${'█'.repeat(dolu)}${'░'.repeat(genislik - dolu)} %${Math.round(oran * 100)}`;
}

/** Kartın rol satırı: ulaşılan kademe ve sıradakine kalan XP. */
export function rolSatiri(seviye, xp) {
  const simdiki = kademeBul(seviye);
  const sonraki = sonrakiKademe(seviye);
  const bas = simdiki ? `**${simdiki.ad}**` : '_henüz yok_';
  if (!sonraki) return `${bas}\nEn üst kademe 🏆`;
  const kalan = Math.max(0, toplamXpKademe(sonraki) - xp);
  return `${bas}\nSıradaki: ${sonraki.ad} (Sv ${sonraki.seviye}, ${kalan} XP kaldı)`;
}

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const alt = interaction.options.getSubcommand();

  if (alt === 'bilgi') {
    const hedef = interaction.options.getUser('uye') ?? interaction.user;
    const kayit = kullaniciGetir(db, guildId, hedef.id);
    const { seviye, suAnki, sonraki } = seviyeHesapla(kayit.xp);
    const kacinci = sira(db, guildId, hedef.id);
    const sesTavan = ayarGetir(db, guildId, SES_GUNLUK_AYAR);

    const embed = gomu('bilgi', `${hedef.username} — seviye kartı`)
      .setThumbnail(hedef.displayAvatarURL?.() ?? null)
      .addFields(
        { name: 'Seviye', value: `**${seviye}**`, inline: true },
        { name: 'Toplam XP', value: `**${kayit.xp}**`, inline: true },
        { name: 'Sıra', value: kacinci ? `**#${kacinci}**` : '_henüz yok_', inline: true },
        { name: 'Sonraki seviyeye', value: `${suAnki} / ${sonraki} XP\n${ilerlemeCubugu(suAnki, sonraki)}` },
        { name: 'Sayılan mesaj', value: String(kayit.mesaj_sayisi), inline: true },
        { name: 'Seviye rolü', value: rolSatiri(seviye, kayit.xp), inline: true },
        {
          name: 'Bugün sesten',
          value: sesTavan > 0 ? `${sesXpBugun(db, guildId, hedef.id)} / ${sesTavan} XP` : '_ses XP\'si kapalı_',
          inline: true,
        },
      );

    await interaction.reply({ embeds: [embed] });
    return;
  }

  const liste = siralama(db, guildId, SIRALAMA_ADEDI);

  if (liste.length === 0) {
    await interaction.reply({ content: 'Henüz kimse XP kazanmamış. Sohbet başlayınca burası dolar.' });
    return;
  }

  const madalya = ['🥇', '🥈', '🥉'];
  const satirlar = liste.map((k, i) => {
    const isaret = madalya[i] ?? `\`#${String(i + 1).padStart(2, ' ')}\``;
    return `${isaret} <@${k.kullanici_id}> — seviye **${k.seviye}**, ${k.xp} XP`;
  });

  const embed = gomu('bilgi', `${interaction.guild.name} — seviye sıralaması`)
    .setDescription(satirlar.join('\n'));

  // Sıralamada on kişi etiketleniyor; PINGSIZ olmasa hepsine bildirim giderdi.
  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
