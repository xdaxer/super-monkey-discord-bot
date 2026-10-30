import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { ayarGetir, sistemAcikMi } from './ayarlar.js';
import { gomu } from './bicim.js';
import { veritabani } from './db.js';
import { bicimle, muz } from './ekonomi.js';
import { esyaGetir } from './esyalar.js';
import {
  CARPAN_YUZDE, DEVREDILENLER, KORUNANLAR, MAKS_PRESTIJ, prestijYap, SIFIRLANACAKLAR,
} from './prestij.js';
import { prestijRoluVer } from './prestij-rol.js';

const ONEK = 'prestij';
const EYLEMLER = ['onay', 'iptal'];

/** `seviye`: onay verildiği andaki prestij seviyesi (eski onay mesajını geçersiz kılar). */
export function prestijButonId(eylem, kullaniciId, seviye) {
  return `${ONEK}:${eylem}:${kullaniciId}:${seviye}`;
}

/** @returns {{eylem: string, kullaniciId: string, seviye: number} | null} */
export function prestijButonAyristir(customId) {
  const [onek, eylem, kullaniciId, seviye] = String(customId ?? '').split(':');
  if (onek !== ONEK || !EYLEMLER.includes(eylem) || !/^\d+$/.test(kullaniciId ?? '') || !/^\d+$/.test(seviye ?? '')) return null;
  return { eylem, kullaniciId, seviye: Number(seviye) };
}

export function prestijButonlari(kullaniciId, seviye, devreDisi = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(prestijButonId('onay', kullaniciId, seviye)).setLabel('Evet, prestij yap')
      .setEmoji('⭐').setStyle(ButtonStyle.Danger).setDisabled(devreDisi),
    new ButtonBuilder().setCustomId(prestijButonId('iptal', kullaniciId, seviye)).setLabel('Vazgeç')
      .setStyle(ButtonStyle.Secondary).setDisabled(devreDisi),
  );
}

const yuzde = (carpan) => `+%${Math.round((carpan - 1) * 100)}`;
const sayi = (n) => n.toLocaleString('tr-TR');
const kasaAdi = (kimlik) => esyaGetir(kimlik)?.ad ?? kimlik;

/** `/prestij bilgi` gömüsü. */
export function bilgiGomusu(durum) {
  const embed = gomu('bilgi', '⭐ Prestij');
  const satirlar = [
    `Prestijin: **${durum.seviye}/${MAKS_PRESTIJ}** · muz kazancı çarpanın: **×${sayi(durum.carpan)}** (${yuzde(durum.carpan)})`,
    `Her prestij kalıcı **+%${CARPAN_YUZDE} muz kazancı** verir (en çok +%${CARPAN_YUZDE * MAKS_PRESTIJ}): `
    + 'günlük ödül, sohbet, çalışma, görev ve sefer muzu ile maymun çiftliklerinin üretimi. '
    + 'Kumar, satış, faiz ve kasa ödülleri etkilenmez. Muz Çiftliği ve etkinlik çarpanlarıyla çarpılarak birleşir.',
    'Bedel yok: son prestijinden beri yeterince **emek geliri** (günlük, sohbet, çalışma, görev, sefer) kazanınca açılır.',
  ];
  if (durum.enUst) {
    satirlar.push('', '🌟 En üst prestijdesin.');
  } else {
    satirlar.push(
      '', `**Sonraki prestij (${durum.seviye + 1}):** çarpan ×${sayi(durum.sonrakiCarpan)} · ödül: ${kasaAdi(durum.odulKasa)}`,
      `Emek gelirin: ${muz(durum.emek)} / ${muz(durum.esik)}${durum.emek >= durum.esik ? ' ✅' : ''}`,
    );
  }
  embed.setDescription(satirlar.join('\n'));
  embed.addFields(
    { name: '🗑️ Sıfırlananlar', value: SIFIRLANACAKLAR.map((s) => `• ${s.ad}`).join('\n') },
    { name: '🔁 Muza çevrilenler', value: DEVREDILENLER.map((d) => `• ${d}`).join('\n') },
    { name: '🔒 Korunanlar', value: KORUNANLAR.map((k) => `• ${k}`).join('\n') },
  );
  if (durum.engeller.length > 0) {
    embed.addFields({ name: '⛔ Şu an yapılamaz', value: durum.engeller.map((e) => `• ${e}`).join('\n') });
  }
  return embed;
}

/** `/prestij yap` onay gömüsü: geri dönüşü olmayan işlemin ne kaybettireceğini açıkça yazar. */
export function onayGomusu(durum) {
  return gomu('uyari', '⚠️ Prestij yapmak üzeresin').setDescription([
    'İlerlemen **geri dönüşsüz** sıfırlanacak.',
    `Karşılığında: prestij **${durum.seviye + 1}** · muz kazancı ×${sayi(durum.sonrakiCarpan)} (${yuzde(durum.sonrakiCarpan)}) `
    + `· ${kasaAdi(durum.odulKasa)}.`,
    '',
    '**Kaybedeceklerin:**',
    ...SIFIRLANACAKLAR.map((s) => `• ${s.ad}`),
    `• Cüzdanındaki **${muz(durum.bakiye)}** yok olur.`,
    '',
    '**Yeni cüzdanına geçen:**',
    `• Çiftliklerinin satış değeri ve depodaki muz: **${muz(durum.ciftlikDevri)}**`,
    '',
    '**Korunanlar:**',
    ...KORUNANLAR.map((k) => `• ${k}`),
  ].join('\n'));
}

/** Prestij sonrası özet gömüsü (butona basanın gizli yanıtı). */
export function sonucGomusu(sonuc) {
  const satirlar = sonuc.ozet.filter((o) => o.miktar > 0).map((o) => `• ${o.ad}: ${bicimle(o.miktar)} ${o.birim}`);
  const kazanilan = [`• ${kasaAdi(sonuc.kasa)}`];
  if (sonuc.devir.muz > 0) kazanilan.push(`• Çiftlik devri (${sonuc.devir.ciftlik} çiftlik): ${muz(sonuc.devir.muz)}`);
  return gomu('basari', `⭐ Prestij ${sonuc.seviye}`).setDescription([
    `Yeni çarpanın: **×${sayi(sonuc.carpan)}** (${yuzde(sonuc.carpan)})`,
    '', '**Yeni başlangıcın:**', ...kazanilan,
    ...(satirlar.length > 0 ? ['', '**Sıfırlanan:**', ...satirlar] : []),
  ].join('\n'));
}

/** Kanala giden kutlama: yalnız kişinin kendisi etiketlenir. */
export function kutlamaMetni(kullaniciId, seviye, carpan) {
  return `⭐ <@${kullaniciId}> **Prestij ${seviye}** oldu! Muz kazancı artık **×${sayi(carpan)}**.`;
}

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

export async function butonBasildi(interaction, db = veritabani()) {
  const { eylem, kullaniciId, seviye } = prestijButonAyristir(interaction.customId);

  if (interaction.user.id !== kullaniciId) {
    await gizli(interaction, 'Bu onay sana ait değil. Kendin için `/prestij yap`.');
    return;
  }

  const guildId = interaction.guildId;
  if (!sistemAcikMi(db, guildId, 'ekonomi')) {
    await gizli(interaction, 'Ekonomi sistemi bu sunucuda kapalı.');
    return;
  }

  if (eylem === 'iptal') {
    await interaction.update({ content: 'Vazgeçtin, hiçbir şey değişmedi.', embeds: [], components: [] });
    return;
  }

  const sonuc = prestijYap(db, { guildId, kullaniciId, beklenenSeviye: seviye });
  if (!sonuc.ok) {
    await interaction.update({ content: sonuc.sebep, embeds: [], components: [] });
    return;
  }

  await interaction.update({ content: null, embeds: [sonucGomusu(sonuc)], components: [] });
  // Rol süstür: verilemese de prestij yazıldı.
  await prestijRoluVer(interaction.member, sonuc.seviye, (anahtar) => ayarGetir(db, guildId, anahtar)).catch(() => null);
  await interaction.followUp({
    content: kutlamaMetni(kullaniciId, sonuc.seviye, sonuc.carpan),
    allowedMentions: { parse: [], users: [kullaniciId] },
  }).catch(() => null);
}

export function prestijBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && prestijButonAyristir(i.customId) !== null,
      calistir: butonBasildi,
    },
  ];
}
