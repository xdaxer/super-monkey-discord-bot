import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { kilitliToplam, vadesiGelenleriOde } from '../../lib/banka.js';
import { basarimBildir } from '../../lib/basarim-bilesen.js';
import { gomu, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import {
  bugunGonderilen, gunlukLimit, hesapGetir, muz, paraSimgesi, SERI_KORUYUCU, sonrakiGunBaslangici, trGunu,
  zenginlikSirasi,
} from '../../lib/ekonomi.js';
import { borcSatiri } from '../../lib/kredi.js';
import { etkinlikSatirlari } from '../../lib/etkinlik.js';
import { adet, etkinEtkiler } from '../../lib/envanter.js';
import { prestijSeviyesi, seviyeCarpani } from '../../lib/prestij-carpan.js';
import { uyelikKademesi } from '../../lib/uyelik-carpan.js';
import { YONETICI_CARPAN, yoneticiCarpani } from '../../lib/yonetici-carpan.js';
import { esyaEmoji, esyaGetir, rozetler } from '../../lib/esyalar.js';
import { kullaniciGetir } from '../../lib/seviye.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('cuzdan')
  .setDescription('Muz bakiyesini ve günlük serisini gösterir.')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((o) => o.setName('uye').setDescription('Kimin cüzdanı (boşsa kendin)'));

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const hedef = interaction.options.getUser('uye') ?? interaction.user;

  if (hedef.bot) {
    await interaction.reply({ content: `Botların cüzdanı yok. ${paraSimgesi()} Onlar zaten muz yemiyor.` });
    return;
  }

  // Vadesi dolmuş mevduat varsa bakiye gösterilmeden önce ödenir.
  vadesiGelenleriOde(db, { guildId, kullaniciId: hedef.id });
  const hesap = hesapGetir(db, guildId, hedef.id);
  const bankada = kilitliToplam(db, guildId, hedef.id);
  const borc = borcSatiri(db, guildId, hedef.id, zaman);
  const sira = zenginlikSirasi(db, guildId, hedef.id);
  const bugunAldi = hesap.son_gunluk === trGunu();

  const embed = gomu('bilgi', `${hedef.username} — cüzdan`)
    .setThumbnail(hedef.displayAvatarURL?.() ?? null)
    .addFields(
      { name: 'Bakiye', value: `**${muz(hesap.bakiye)}**`, inline: true },
      { name: 'Sıra', value: sira ? `**#${sira}**` : '_henüz yok_', inline: true },
      { name: 'Günlük seri', value: `${hesap.gunluk_seri} gün`, inline: true },
      ...(bankada > 0 ? [{ name: 'Bankada (kilitli)', value: `${muz(bankada)} · \`/banka durum\``, inline: true }] : []),
      ...(borc ? [{ name: 'Kredi borcu', value: borc }] : []),
      {
        name: 'Günlük ödül',
        value: bugunAldi ? `Alındı, yenisi ${zaman(sonrakiGunBaslangici(), 'R')}` : 'Hazır: `/gunluk`',
      },
    );

  // Rozet vitrini: en değerlisi başta, sunucu emojisiyle.
  const bul = (ad) => interaction.guild?.emojis?.cache?.find((e) => e.name === ad)?.toString() ?? null;
  const sahip = rozetler(db, guildId, hedef.id).reverse();
  embed.addFields({
    name: `Rozetler (${sahip.length})`,
    value: sahip.length > 0 ? sahip.map((r) => esyaEmoji(r, bul)).join(' ') : '_henüz yok — `/magaza liste kategori:Rozetler`_',
  });

  const prestij = prestijSeviyesi(db, guildId, hedef.id);
  if (prestij > 0) {
    embed.addFields({ name: 'Prestij', value: `⭐×${prestij} · muz kazancı **×${seviyeCarpani(prestij).toLocaleString('tr-TR')}**` });
  }

  const kademe = uyelikKademesi(db, guildId, hedef.id);
  if (kademe?.yuzde > 0) {
    const ad = interaction.guild?.roles?.cache?.get(kademe.rolId)?.name ?? `Kademe ${kademe.no}`;
    embed.addFields({ name: 'Katıl üyeliği', value: `💜 ${ad} · muz kazancı **+%${kademe.yuzde}**` });
  }

  if (yoneticiCarpani(hedef.id) > 1) {
    embed.addFields({ name: 'Yönetici', value: `🛠️ muz kazancı **×${YONETICI_CARPAN}**` });
  }

  const takviyeler = Object.entries(etkinEtkiler(db, guildId, hedef.id))
    .map(([tur, bitis]) => `${esyaEmoji(esyaGetir(tur), bul)} ${esyaGetir(tur).ad}: ${zaman(bitis, 'R')} bitiyor`);
  const koruyucu = adet(db, guildId, hedef.id, SERI_KORUYUCU);
  if (koruyucu > 0) takviyeler.push(`🛡️ Seri Koruyucu: ${koruyucu} tane`);
  if (takviyeler.length > 0) embed.addFields({ name: 'Takviyeler', value: takviyeler.join('\n') });
  const etkinlikler = etkinlikSatirlari(db, guildId, zaman);
  if (etkinlikler.length > 0) embed.addFields({ name: '🎉 Etkinlikler', value: etkinlikler.join('\n') });
  embed.setFooter({ text: 'Kasalar ve kart koleksiyonu: /envanter goster' });

  // Gönderim limiti yalnız kendi cüzdanında gösterilir; başkasının hareketi kimseyi ilgilendirmez.
  if (hedef.id === interaction.user.id) {
    const limit = gunlukLimit(kullaniciGetir(db, guildId, hedef.id).seviye);
    const kalan = Math.max(0, limit - bugunGonderilen(db, guildId, hedef.id));
    embed.addFields({ name: 'Bugün gönderebileceğin', value: `${muz(kalan)} / ${muz(limit)}` });
  }

  await interaction.reply({ embeds: [embed] });
  await basarimBildir(interaction);
}
