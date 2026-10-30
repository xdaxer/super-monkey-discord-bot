import { AttachmentBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { vadesiGelenleriOde } from '../../lib/banka.js';
import { basarimBildir } from '../../lib/basarim-bilesen.js';
import { gomu } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { bicimle, muz } from '../../lib/ekonomi.js';
import { esyaGetir } from '../../lib/esyalar.js';
import { kartGetir } from '../../lib/kasalar.js';
import { emojiCozucu } from '../../lib/kasa-bilesen.js';
import { emojiUrlCozucu, profilKarti, profilVerisi } from '../../lib/profil-gorsel.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('profil')
  .setDescription('Seviye, muz ve kart koleksiyonunu tek bir profil kartında gösterir.')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((o) => o.setName('uye').setDescription('Kimin profili (boşsa kendin)'));

/** Görsel üretilemediğinde aynı bilgileri taşıyan embed. */
export function profilGomusu(veri, { gorunenAd, avatarUrl = null, emoji = () => '🎈' }) {
  const kol = veri.koleksiyon;
  const embed = gomu('bilgi', `${gorunenAd} — profil`)
    .setColor(veri.kademe?.renk ?? 0xffd33d)
    .addFields(
      {
        name: 'Seviye',
        value: `**${veri.seviye}** · ${bicimle(veri.suAnki)}/${bicimle(veri.sonraki)} XP\n`
          + `${veri.kademe ? veri.kademe.ad : '_rol yok_'} · XP sırası ${veri.xpSirasi ? `**#${veri.xpSirasi}**` : '_yok_'}`,
      },
      {
        name: 'Muz',
        value: `${muz(veri.bakiye)} · sıra ${veri.zenginlikSirasi ? `**#${veri.zenginlikSirasi}**` : '_yok_'}\n`
          + `Bankada: ${muz(veri.bankada)} · Seri: ${veri.seri} gün`,
      },
      {
        name: `Koleksiyon ${kol.farkli}/${kol.toplam}`,
        value: `Puan: **${bicimle(kol.puan)}**\n`
          + [...kol.kademeler].reverse().map((k) => `${k.ad} ${k.sahip}/${k.toplam}`).join(' · '),
      },
      {
        name: 'En değerli kartlar',
        value: veri.enDegerliKartlar.length > 0
          ? veri.enDegerliKartlar.map((k) => `${emoji(kartGetir(k.kimlik))}${k.adet > 1 ? `×${k.adet}` : ''}`).join(' ')
          : '_henüz yok_',
      },
      {
        name: `Rozetler (${veri.rozetler.length})`,
        value: veri.rozetler.length > 0
          ? veri.rozetler.map((r) => emoji(esyaGetir(r.kimlik))).join(' ')
          : '_henüz yok_',
      },
    );
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const hedef = interaction.options.getUser('uye') ?? interaction.user;

  if (hedef.bot) {
    await interaction.reply({ content: 'Botların profili yok.' });
    return;
  }

  // Görsel üretimi 3 saniyeyi geçebilir.
  await interaction.deferReply();

  // Vadesi dolmuş mevduat varsa bakiye gösterilmeden önce ödenir (/cuzdan gibi).
  vadesiGelenleriOde(db, { guildId, kullaniciId: hedef.id });
  const veri = profilVerisi(db, guildId, hedef.id);
  const uye = interaction.options.getMember?.('uye') ?? interaction.member;
  const gorunenAd = uye?.displayName ?? hedef.globalName ?? hedef.username;
  const avatarUrl = hedef.displayAvatarURL({ extension: 'png', size: 256 });

  const png = await profilKarti({
    veri, gorunenAd, avatarUrl, emojiUrl: emojiUrlCozucu(interaction.guild),
  });

  if (png) {
    await interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'profil.png' })] });
    await basarimBildir(interaction);
    return;
  }

  const embed = profilGomusu(veri, { gorunenAd, avatarUrl, emoji: emojiCozucu(interaction.guild) });
  await interaction.editReply({ embeds: [embed] });
  await basarimBildir(interaction);
}
