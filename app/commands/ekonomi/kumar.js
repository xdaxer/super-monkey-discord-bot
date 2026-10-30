import {
  AttachmentBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { setTimeout as bekle } from 'node:timers/promises';

import { bahisCoz } from '../../lib/bahis.js';
import { gomu, sureBicimle } from '../../lib/bicim.js';
import {
  baslat, hamle, mesajIdKaydet, zamanAsimiMi,
} from '../../lib/blackjack.js';
import { veritabani } from '../../lib/db.js';
import { bakiye, muz } from '../../lib/ekonomi.js';
import { BORC_YASAK, borcluMu } from '../../lib/kredi.js';
import { bjButonlari, bjGomusu, cashbackSatiri } from '../../lib/ekonomi-bilesen.js';
import { gorevBildir, kumarOlaylari } from '../../lib/gorev-bilesen.js';
import { GIF_ZAMAN_ASIMI } from '../../lib/kasa-bilesen.js';
import { atGifiUret, ruletGifiUret, slotGifiUret } from '../../lib/kumar-gif.js';
import { MAYIN_MAKS, MAYIN_MIN, MAYIN_VARSAYILAN } from '../../lib/mines.js';
import { minesOyunuBaslat } from '../../lib/mines-bilesen.js';
import {
  ATLAR, atYarisi, bahisBeklemesi, bahisOyna, BAHIS_MIN, RULET_SAYI_CARPAN, ruletCevir, ruletSecimi,
  slotCevir, YAZITURA_CARPAN, yaziTura, ZAR_BERABERE, zarOyna,
} from '../../lib/kumar.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

const bahisSecenegi = (o) => o
  .setName('bahis').setDescription(`Ne kadar: en az ${BAHIS_MIN}; 500, 2.5k, yarı, hepsi`)
  .setRequired(true).setMaxLength(20);

export const data = new SlashCommandBuilder()
  .setName('kumar')
  .setDescription('Muzuna bahis oyna: slot, yazı-tura, zar, rulet, at yarışı, mines, blackjack.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('slot').setDescription('Üç makara: üçlü 777x\'e kadar, ikili de öder.')
    .addStringOption(bahisSecenegi))
  .addSubcommand((s) => s
    .setName('yazitura').setDescription(`Bilirsen bahsin ${String(YAZITURA_CARPAN).replace('.', ',')} katı.`)
    .addStringOption(bahisSecenegi)
    .addStringOption((o) => o
      .setName('secim').setDescription('Yazı mı tura mı').setRequired(true)
      .addChoices({ name: 'Yazı', value: 'yazi' }, { name: 'Tura', value: 'tura' })))
  .addSubcommand((s) => s
    .setName('zar').setDescription('İki zar sen, iki zar kasa: büyük toplam kazanır (2x).')
    .addStringOption(bahisSecenegi))
  .addSubcommand((s) => s
    .setName('rulet').setDescription(`Renk / tek-çift 2x, tek sayı ${RULET_SAYI_CARPAN}x.`)
    .addStringOption(bahisSecenegi)
    .addStringOption((o) => o
      .setName('secim').setDescription('kırmızı, siyah, tek, çift ya da 0–36 arası bir sayı')
      .setRequired(true).setMaxLength(10)))
  .addSubcommand((s) => s
    .setName('at').setDescription('Beş at yarışır: favori az, sürpriz çok öder.')
    .addStringOption(bahisSecenegi)
    .addIntegerOption((o) => o
      .setName('at').setDescription('Hangi ata oynuyorsun').setRequired(true)
      .addChoices(...ATLAR.map((a) => ({
        name: `${a.no} · ${a.ad} (${String(a.carpan).replace('.', ',')}x · şans %${a.sans})`, value: a.no,
      })))))
  .addSubcommand((s) => s
    .setName('mines').setDescription('Mayınlara basmadan kare aç, çarpan büyüsün; istediğin an çek.')
    .addStringOption(bahisSecenegi)
    .addIntegerOption((o) => o
      .setName('mayin').setDescription(`Kaç mayın (${MAYIN_MIN}–${MAYIN_MAKS}, varsayılan ${MAYIN_VARSAYILAN}); çok mayın, hızlı büyüyen çarpan`)
      .setMinValue(MAYIN_MIN).setMaxValue(MAYIN_MAKS)))
  .addSubcommand((s) => s
    .setName('blackjack').setDescription('21: kart çek, dur, ikiye katla ya da böl. Blackjack 2,2x (6:5).')
    .addStringOption(bahisSecenegi));

function gizli(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/** Net kazancı/kaybı ve yeni bakiyeyi tek satırda yazar. */
function sonucSatiri(sonuc) {
  const net = sonuc.net > 0 ? `**+${muz(sonuc.net)}**` : sonuc.net < 0 ? `**−${muz(-sonuc.net)}**` : '**±0**';
  return `${net} · Bakiye: ${muz(sonuc.bakiye)}`;
}

function sonucGomusu(baslik, sonuc, satirlar) {
  const tur = sonuc.net > 0 ? 'basari' : sonuc.net === 0 ? 'notr' : 'hata';
  const cashback = sonuc.cashback ? [cashbackSatiri(sonuc.cashback)] : [];
  return gomu(tur, baslik).setDescription([...satirlar, '', ...cashback, sonucSatiri(sonuc)].join('\n'));
}

const RULET_RENK = { kirmizi: '🔴', siyah: '⚫', yesil: '🟢' };
const SECIM_ADLARI = { kirmizi: 'Kırmızı', siyah: 'Siyah', tek: 'Tek', cift: 'Çift' };
/** GIF yüklenip görünene kadar tanınan pay (ms): sonuç GIF bitmeden gelmesin. */
const GIF_YUKLEME_PAYI = 800;

/** Her alt komutun oyunu ve sonuç gösterimi. */
const OYUNLAR = {
  slot: {
    hazirla: () => ({ oyun: () => slotCevir() }),
    gif: (s) => slotGifiUret({ makaralar: s.sonuc.makaralar, carpan: s.sonuc.carpan }),
    goster: (s) => sonucGomusu('🎰 Slot', s, [
      `**[ ${s.sonuc.makaralar.join(' | ')} ]**`,
      s.sonuc.carpan > 0 ? `Çarpan: **${s.sonuc.carpan}x**` : 'Eşleşme yok.',
    ]),
  },
  yazitura: {
    hazirla: (i) => {
      const secim = i.options.getString('secim', true);
      return { oyun: () => yaziTura(secim) };
    },
    goster: (s) => sonucGomusu('🪙 Yazı-tura', s, [
      `Para **${s.sonuc.sonuc === 'yazi' ? 'yazı' : 'tura'}** geldi.`,
    ]),
  },
  zar: {
    hazirla: () => ({ oyun: () => zarOyna() }),
    goster: (s) => {
      const { oyuncu, kasa, carpan } = s.sonuc;
      const durum = carpan === ZAR_BERABERE ? 'Berabere: bahsin yarısı geri.' : carpan > 0 ? 'Kazandın!' : 'Kasa kazandı.';
      return sonucGomusu('🎲 Zar', s, [
        `Sen: 🎲 ${oyuncu.join(' + ')} = **${oyuncu[0] + oyuncu[1]}**`,
        `Kasa: 🎲 ${kasa.join(' + ')} = **${kasa[0] + kasa[1]}**`,
        durum,
      ]);
    },
  },
  rulet: {
    hazirla: (i) => {
      const secim = ruletSecimi(i.options.getString('secim', true));
      if (!secim) return { hata: 'Seçimi anlayamadım: `kırmızı`, `siyah`, `tek`, `çift` ya da 0–36 arası bir sayı yaz.' };
      return { oyun: () => ruletCevir(secim), secimMetni: `Seçim: ${SECIM_ADLARI[secim.deger] ?? secim.deger}` };
    },
    gif: (s, hazir) => ruletGifiUret({ sayi: s.sonuc.sayi, carpan: s.sonuc.carpan, secimMetni: hazir.secimMetni }),
    goster: (s) => sonucGomusu('🎡 Rulet', s, [
      `Top **${RULET_RENK[s.sonuc.renk]} ${s.sonuc.sayi}** üstünde durdu.`,
      s.sonuc.carpan > 0 ? `Çarpan: **${s.sonuc.carpan}x**` : 'Bu tur kasanın.',
    ]),
  },
  at: {
    hazirla: (i) => {
      const secim = i.options.getInteger('at', true);
      return { oyun: () => atYarisi(secim) };
    },
    gif: (s) => atGifiUret({ secim: s.sonuc.secim, kazanan: s.sonuc.kazanan, carpan: s.sonuc.carpan }),
    goster: (s) => {
      const at = (no) => ATLAR.find((a) => a.no === no);
      const kazanan = at(s.sonuc.kazanan);
      return sonucGomusu('🏇 At yarışı', s, [
        `Senin atın: **${s.sonuc.secim} ${at(s.sonuc.secim).ad}**`,
        `Kazanan: 🏆 **${kazanan.no} ${kazanan.ad}**`,
        s.sonuc.carpan > 0 ? `Çarpan: **${String(s.sonuc.carpan).replace('.', ',')}x**` : 'Atın geride kaldı.',
      ]);
    },
  },
};

/** GIF'i üretir; canvas yoksa, hata verirse ya da gecikirse null. */
async function gifHazirla(uret) {
  try {
    return await Promise.race([uret(), bekle(GIF_ZAMAN_ASIMI).then(() => null)]);
  } catch {
    return null;
  }
}

/**
 * Önce "dönüyor" yanıtı, sonra GIF, GIF bitince sonuç gömüsü (son kare PNG ile).
 * Bahis zaten sonuçlanıp yazılmıştır; mesaj silinse de kayıp olmaz.
 */
async function animasyonluGoster(interaction, oyunTanimi, sonuc, hazir) {
  const sonGomu = oyunTanimi.goster(sonuc);
  const baslik = sonGomu.data.title;
  await interaction.reply({ embeds: [gomu('notr', `${baslik} dönüyor...`).setFooter({ text: interaction.user.username })] });

  try {
    const gif = await gifHazirla(() => oyunTanimi.gif(sonuc, hazir));
    if (!gif) {
      await interaction.editReply({ embeds: [sonGomu] });
      return;
    }
    await interaction.editReply({
      embeds: [gomu('notr', `${baslik} dönüyor...`).setImage('attachment://kumar.gif').setFooter({ text: interaction.user.username })],
      files: [new AttachmentBuilder(gif.gif, { name: 'kumar.gif' })],
      attachments: [],
    });
    await bekle(gif.sureMs + GIF_YUKLEME_PAYI);
    // GIF döngüye girer; sonuçta yerine son kareyi gösteren PNG konur.
    await interaction.editReply({
      embeds: [sonGomu.setImage('attachment://kumar.png')],
      files: [new AttachmentBuilder(gif.png, { name: 'kumar.png' })],
      attachments: [],
    });
  } catch {
    // Mesaj silindi ya da etkileşim süresi doldu: bahis zaten yazıldı.
  }
}

/** Bahis metnini ayrıştırıp sınırlara göre doğrular (kural lib/bahis.js'te). */
function bahisCozKomut(db, interaction) {
  return bahisCoz(db, {
    guildId: interaction.guildId,
    kullaniciId: interaction.user.id,
    ham: interaction.options.getString('bahis', true),
  });
}

async function blackjackBaslat(interaction, db, miktar) {
  const guildId = interaction.guildId;
  const kullaniciId = interaction.user.id;
  let sonuc = baslat(db, { guildId, kullaniciId, bahis: miktar });

  if (!sonuc.ok && sonuc.acik) {
    if (!zamanAsimiMi(sonuc.acik)) {
      await gizli(interaction, 'Zaten süren bir elin var; önce onu bitir (mesajındaki butonlarla).');
      return;
    }
    // Unutulmuş el: önce durup sonuçlandırıyoruz, sonra yenisini açıyoruz.
    const eski = hamle(db, {
      guildId, kullaniciId, tur: 'dur', hepsi: true,
    });
    await interaction.channel?.send({ embeds: [bjGomusu(eski.el, bakiye(db, guildId, kullaniciId))] }).catch(() => null);
    sonuc = baslat(db, { guildId, kullaniciId, bahis: miktar });
  }

  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  const { el } = sonuc;
  const yanit = await interaction.reply({
    embeds: [bjGomusu(el, el.bitti ? bakiye(db, guildId, kullaniciId) : null)],
    components: el.bitti ? [] : [bjButonlari(el)],
    withResponse: true,
  });

  const mesajId = yanit?.resource?.message?.id;
  if (!el.bitti && mesajId) mesajIdKaydet(db, guildId, kullaniciId, mesajId);
  await gorevBildir(interaction, kumarOlaylari({ bahis: miktar, biten: el.bitti ? el : null }));
}

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const kullaniciId = interaction.user.id;
  const alt = interaction.options.getSubcommand();

  if (borcluMu(db, guildId, kullaniciId)) return gizli(interaction, BORC_YASAK);

  const bahis = bahisCozKomut(db, interaction);
  if (!bahis.ok) {
    await gizli(interaction, bahis.sebep);
    return;
  }

  // Seçim hatası bekleme süresini yakmasın: önce oyunu hazırlıyoruz.
  const oyunTanimi = OYUNLAR[alt];
  const hazir = oyunTanimi?.hazirla(interaction) ?? {};
  if (hazir.hata) {
    await gizli(interaction, hazir.hata);
    return;
  }

  const bekle = bahisBeklemesi(guildId, kullaniciId);
  if (bekle > 0) {
    await gizli(interaction, `Biraz yavaş: ${sureBicimle(bekle)} sonra tekrar dene.`);
    return;
  }

  if (alt === 'blackjack') {
    await blackjackBaslat(interaction, db, bahis.miktar);
    return;
  }
  if (alt === 'mines') {
    await minesOyunuBaslat(interaction, db, bahis.miktar, interaction.options.getInteger('mayin') ?? MAYIN_VARSAYILAN);
    return;
  }

  const sonuc = bahisOyna(db, {
    guildId, kullaniciId, bahis: bahis.miktar, oyun: hazir.oyun, oyunAdi: alt,
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  if (oyunTanimi.gif) await animasyonluGoster(interaction, oyunTanimi, sonuc, hazir);
  else await interaction.reply({ embeds: [oyunTanimi.goster(sonuc)] });
  await gorevBildir(interaction, kumarOlaylari({
    bahis: bahis.miktar, biten: { bahis: bahis.miktar, net: sonuc.net },
  }));
}
