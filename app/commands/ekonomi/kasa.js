import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { gomu } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { muz } from '../../lib/ekonomi.js';
import { esyaGetir } from '../../lib/esyalar.js';
import { gorevBildir, kasaOlaylari } from '../../lib/gorev-bilesen.js';
import { adet } from '../../lib/envanter.js';
import {
  animasyonluAc, emojiCozucu, odulRoluVer, tekrarButonu,
} from '../../lib/kasa-bilesen.js';
import {
  COKLU_ACMA, garantiDurumu, garantiMetni, KASA_GARANTI, KASA_ICERIKLERI, KASA_KIMLIKLERI, kasaAc, NADIRLIK_SIRASI, NADIRLIKLER,
  sonucMetni, sonucNadirligi,
} from '../../lib/kasalar.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

const kasaSecenegi = (o) => o
  .setName('kasa').setDescription('Hangi kasa').setRequired(true)
  .addChoices(...KASA_KIMLIKLERI.map((k) => ({ name: `${esyaGetir(k).yedek} ${esyaGetir(k).ad}`, value: k })));

export const data = new SlashCommandBuilder()
  .setName('kasa')
  .setDescription('Kasa aç ve içeriğine bak.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('ac').setDescription('Envanterindeki bir kasayı açar.')
    .addStringOption(kasaSecenegi)
    .addIntegerOption((o) => o
      .setName('adet').setDescription(`Kaç tane (1–${COKLU_ACMA}; birden çoksa animasyonsuz özet)`)
      .setMinValue(1).setMaxValue(COKLU_ACMA)))
  .addSubcommand((s) => s
    .setName('bilgi').setDescription('Kasadan neyin hangi olasılıkla çıktığını gösterir.')
    .addStringOption(kasaSecenegi));

/** İçerik satırı: "%33,0 · 300–1.000 muz" */
function icerikSatiri(o, toplam, emoji) {
  const yuzde = `%${((o.agirlik / toplam) * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  if (o.tur === 'muz') return `\`${yuzde.padStart(6)}\` ${muz(o.min)} – ${muz(o.max)}`;
  if (o.tur === 'kart') {
    const n = NADIRLIKLER[o.nadirlik];
    return `\`${yuzde.padStart(6)}\` ${n.simge} ${n.ad} kart (satış ${muz(n.deger)})`;
  }
  const esya = esyaGetir(o.kimlik);
  return `\`${yuzde.padStart(6)}\` ${emoji(esya)} ${esya.ad}`;
}

async function bilgi(interaction) {
  const kasa = interaction.options.getString('kasa', true);
  const esya = esyaGetir(kasa);
  const icerik = KASA_ICERIKLERI[kasa];
  const toplam = icerik.reduce((t, o) => t + o.agirlik, 0);
  const emoji = emojiCozucu(interaction.guild);
  const db = veritabani();
  const sahip = adet(db, interaction.guildId, interaction.user.id, kasa);
  const garanti = KASA_GARANTI[kasa];

  const embed = gomu('bilgi', `${esya.yedek} ${esya.ad}`)
    .setDescription([
      esya.aciklama,
      '',
      ...[...icerik].sort((a, b) => b.agirlik - a.agirlik).map((o) => icerikSatiri(o, toplam, emoji)),
    ].join('\n'))
    .addFields(
      { name: 'Mağaza fiyatı', value: esya.fiyat === null ? '_satılmaz_ (her `/gunluk` ile gelir)' : muz(esya.fiyat), inline: true },
      { name: 'Sende', value: `${sahip} tane`, inline: true },
    )
    .setFooter({ text: 'Bedava kasalar: her /gunluk Günlük Kasa (7. gün + Ahşap); seviye atlayınca tek seviye Günlük (20. seviyeden sonra Ahşap), çift seviye Ahşap, 5\'in katı Demir, 10\'un katı Altın, 25\'in katı Elmas.' });
  if (garanti) {
    const n = NADIRLIKLER[garanti.nadirlik];
    embed.addFields({
      name: 'Garanti',
      value: `Üst üste ${garanti.esik} açılışta ${n.simge} ${n.ad} ya da üstü çıkmazsa sonuncusu ${n.ad} kart olur.\n`
        + garantiMetni(garantiDurumu(db, interaction.guildId, interaction.user.id, kasa)),
    });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function cokluAc(interaction, kasa, kac) {
  const db = veritabani();
  const emoji = emojiCozucu(interaction.guild);
  const sonuclar = [];
  let kalan = 0;
  let garanti = null;

  for (let i = 0; i < kac; i += 1) {
    const s = kasaAc(db, { guildId: interaction.guildId, kullaniciId: interaction.user.id, kasa });
    if (!s.ok) {
      if (i === 0) {
        await interaction.reply({ content: s.sebep, flags: MessageFlags.Ephemeral });
        return;
      }
      break;
    }
    sonuclar.push(s.sonuc);
    kalan = s.kalan;
    garanti = s.garanti;
  }

  // En iyi sonuç önce; gömünün rengi de onun nadirliği.
  const sira = (s) => NADIRLIK_SIRASI.indexOf(sonucNadirligi(s));
  sonuclar.sort((a, b) => sira(b) - sira(a));
  const enIyi = NADIRLIKLER[sonucNadirligi(sonuclar[0])];
  const esya = esyaGetir(kasa);

  const embed = gomu('notr', `${esya.yedek} ${sonuclar.length} × ${esya.ad}`)
    .setColor(enIyi.renk)
    .setDescription([
      ...sonuclar.map((s) => `${NADIRLIKLER[sonucNadirligi(s)].simge} ${sonucMetni(s, emoji)}`),
      ...(garanti ? ['', garantiMetni(garanti)] : []),
    ].join('\n'))
    .setFooter({ text: `${interaction.user.username} açtı` });

  await interaction.reply({ embeds: [embed], components: [tekrarButonu(kasa, interaction.user.id, kalan)] });
  // Rozet çıktıysa rol, yanıttan sonra (3 sn yanıt süresi).
  for (const s of sonuclar) await odulRoluVer(interaction, s);
  await gorevBildir(interaction, kasaOlaylari(sonuclar));
}

export async function execute(interaction) {
  if (interaction.options.getSubcommand() === 'bilgi') {
    await bilgi(interaction);
    return;
  }

  const kasa = interaction.options.getString('kasa', true);
  const kac = interaction.options.getInteger('adet') ?? 1;
  if (kac > 1) {
    await cokluAc(interaction, kasa, kac);
    return;
  }
  await animasyonluAc(interaction, kasa);
}
