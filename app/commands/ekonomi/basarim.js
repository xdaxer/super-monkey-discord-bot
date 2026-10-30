import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

import {
  basarimDurumlari, basarimlariKontrolEt, basarimOzeti, KADEMELER, KATEGORILER, odulMetni,
} from '../../lib/basarimlar.js';
import { gomu, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { bicimle, muz } from '../../lib/ekonomi.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('basarim')
  .setDescription('Başarımlarını, ilerlemeni ve başarım puanını gösterir. Ödüller kendiliğinden verilir.')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((o) => o.setName('uye').setDescription('Kimin başarımları (boşsa kendin)'));

/** Kazanıldıysa ✅ ve tarih, değilse ilerleme. */
export function basarimSatiri({ tanim, zaman: kazanma, deger }) {
  const kademe = KADEMELER[tanim.kademe].simge;
  if (kazanma) return `✅ ${kademe} **${tanim.ad}** · ${tanim.aciklama} · ${zaman(kazanma, 'd')}`;
  return `▫️ ${kademe} **${tanim.ad}** · ${tanim.aciklama} · \`${bicimle(deger)}/${bicimle(tanim.hedef)}\``;
}

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const hedef = interaction.options.getUser('uye') ?? interaction.user;

  if (hedef.bot) {
    await interaction.reply({ content: 'Botların başarımı yok.' });
    return;
  }

  // Yalnız komutu kullanan için kontrol edilir; ödül ona gider.
  const yeniler = hedef.id === interaction.user.id ? basarimlariKontrolEt(db, guildId, hedef.id) : [];
  const durumlar = basarimDurumlari(db, guildId, hedef.id);
  const ozet = basarimOzeti(db, guildId, hedef.id);

  const yeniMetni = yeniler.length > 0
    ? `\n\n🏆 **Yeni kazandın:** ${yeniler.map(({ tanim }) => `${tanim.ad} (${odulMetni(tanim.odul, muz)})`).join(', ')}`
    : '';
  const embed = gomu('bilgi', `${hedef.username} — başarımlar`)
    .setThumbnail(hedef.displayAvatarURL?.() ?? null)
    .setDescription(
      `**${ozet.adet}/${ozet.toplam}** başarım · **${ozet.puan}/${ozet.toplamPuan}** puan\n`
      + `-# 🥉 Bronz 1 · 🥈 Gümüş 2 · 🥇 Altın 3 puan${yeniMetni}`,
    );

  for (const [kimlik, kategori] of Object.entries(KATEGORILER)) {
    const liste = durumlar.filter((d) => d.tanim.kategori === kimlik);
    const biten = liste.filter((d) => d.zaman).length;
    embed.addFields({
      name: `${kategori.simge} ${kategori.ad} (${biten}/${liste.length})`,
      value: liste.map(basarimSatiri).join('\n').slice(0, 1024),
    });
  }
  embed.setFooter({ text: 'Ödüller başarım kazanılınca kendiliğinden verilir.' });

  await interaction.reply({ embeds: [embed] });
}
