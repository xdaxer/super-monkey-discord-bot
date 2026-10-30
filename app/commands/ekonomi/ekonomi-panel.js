import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import {
  alanlaraBol, gomu, PINGSIZ, zaman,
} from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { muz } from '../../lib/ekonomi.js';
import { DONEMLER, panelOzeti, sonHareketler } from '../../lib/ekonomi-panel.js';
import { yetkiliKimlikler } from '../../lib/izin.js';
import { yoneticiMi } from './ekonomi-yonet.js';

export const sistem = 'ekonomi';
/** Yönetici komutu: ekonomi kanal sınırından muaf (lib/kanal-siniri.js). */
export const kanalMuaf = true;
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('ekonomi-panel')
  .setDescription('(Yönetici) Ekonomi paneli: muz arzı, basılan/yok edilen muz, üye hareketleri.')
  .setContexts(InteractionContextType.Guild)
  // Yalnız Yönetici: üyelerin hesap hareketlerini gösterir.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s
    .setName('ozet').setDescription('Muz arzı ve dönemin basılan / yok edilen muzu.')
    .addStringOption((o) => o
      .setName('donem').setDescription('Hangi dönem (varsayılan: bugün)')
      .addChoices(...Object.entries(DONEMLER).map(([deger, d]) => ({ name: d.ad, value: deger }))))
    .addBooleanOption((o) => o
      .setName('yoneticiler_dahil').setDescription('Sahip ve geliştiricilerin hesapları da sayılsın mı (varsayılan: hayır)')))
  .addSubcommand((s) => s
    .setName('kullanici').setDescription('Bir üyenin son defter hareketleri (kötüye kullanım incelemesi).')
    .addUserOption((o) => o.setName('uye').setDescription('Kimin hareketleri').setRequired(true)));

const sayi = (n) => Math.round(n).toLocaleString('tr-TR');

/** "+12,3%" / "-4,0%" / "—" */
export function yuzdeMetni(yuzde) {
  if (yuzde === null || yuzde === undefined) return '—';
  return `${yuzde >= 0 ? '+' : ''}${yuzde.toFixed(1).replace('.', ',')}%`;
}

/** İşaretli muz miktarı: "+120 🍌" / "-50 🍌". */
function isaretli(miktar) {
  return `${miktar >= 0 ? '+' : '-'}${muz(Math.abs(miktar))}`;
}

/** Kategori satırları; boşsa tire. */
function kategoriSatirlari(liste) {
  return liste.length > 0 ? liste.map((k) => `• ${k.ad}: **${muz(k.miktar)}**`) : ['• —'];
}

/** `/ekonomi-panel ozet` embed'i. Saf: verilen özetten üretir. */
export function ozetEmbed(ozet) {
  const donem = DONEMLER[ozet.donem] ?? DONEMLER.bugun;
  const enflasyon = ozet.net >= 0 ? 'enflasyon' : 'deflasyon';

  const embed = gomu('bilgi', `Ekonomi paneli — ${donem.ad}${ozet.yoneticiHaric ? ' · yöneticiler hariç' : ''}`)
    .setDescription(
      `**Toplam muz arzı:** ${muz(ozet.arz)}\n`
      + `Dolaşımda ${muz(ozet.bakiyeler)} + bankada kilitli ${muz(ozet.bankada)}${ozet.hissede > 0 ? ` + hissede ${muz(ozet.hissede)}` : ''}\n`
      + `**Muzu olan üye:** ${sayi(ozet.uyeSayisi)}`,
    )
    .addFields(
      ...alanlaraBol(`Basılan muz — ${sayi(ozet.toplamBasilan)}`, kategoriSatirlari(ozet.basilan)),
      ...alanlaraBol(`Yok edilen muz — ${sayi(ozet.toplamYokEdilen)}`, kategoriSatirlari(ozet.yokEdilen)),
      {
        name: `Net ${enflasyon}`,
        value: `**${isaretli(ozet.net)}** · arzda ${yuzdeMetni(ozet.degisimYuzde)}`,
        inline: true,
      },
      { name: 'Kasa açılan', value: `**${sayi(ozet.kasaAcilan)}**`, inline: true },
      { name: 'Satılan kart', value: `**${sayi(ozet.kartSatilan)}**`, inline: true },
    );

  const kazananlar = ozet.kazananlar.length > 0
    ? ozet.kazananlar.map((k, i) => `${i + 1}. <@${k.kullanici_id}> — **${isaretli(k.net)}**`)
    : ['—'];
  embed.addFields(...alanlaraBol('En çok kazanan 5 üye (dönem net)', kazananlar));

  const oyunlar = ozet.kumarOyunlari.length > 0
    ? ozet.kumarOyunlari.map((o) => {
      const geri = o.geriOdeme === null ? '—' : `%${o.geriOdeme.toFixed(1).replace('.', ',')}`;
      return `• ${o.ad}: ${sayi(o.adet)} bahis · ${muz(o.bahis)} yatırıldı · geri ödeme **${geri}** · ${sayi(o.kisi)} kişi`;
    })
    : ['—'];
  embed.addFields(...alanlaraBol('Kumar oyunları (geri ödeme = ödenen / yatırılan)', oyunlar));

  if (ozet.etkinlikler.length > 0) {
    embed.addFields(...alanlaraBol('Dönemdeki etkinlikler', ozet.etkinlikler.map((e) => (
      `• ${e.ad}: ${zaman(e.baslangic, 'f')} → ${zaman(e.bitis, 'f')}${e.erken ? ' (erken bitti)' : ''}`
    ))));
  }

  // Yönetici gönderimleri transferden ayrı: ×5 çarpanlı gelir üyelere geçince fiilen basılan muzdur.
  const yg = ozet.yoneticiGonderim;
  const ygSatirlar = yg.adet > 0
    ? [`Toplam **${muz(yg.toplam)}** · ${sayi(yg.adet)} gönderim · ${sayi(yg.aliciSayisi)} üye`,
      ...yg.alicilar.map((a) => `• <@${a.kullanici_id}> — **${muz(a.toplam)}** (${sayi(a.adet)})`)]
    : ['—'];
  embed.addFields(...alanlaraBol('Yöneticilerden üyelere gönderim', ygSatirlar));

  const tk = ozet.takaslar;
  const tkSatirlar = tk.adet > 0
    ? [`**${sayi(tk.adet)}** takas · değer ${muz(tk.toplamDeger)}${tk.yoneticili > 0 ? ` · ${sayi(tk.yoneticili)} tanesinde yönetici taraf` : ''}`,
      ...tk.dengesiz.map((t) => `• #${t.id} <@${t.edenId}> ${muz(t.verDeger)} ⇄ ${muz(t.isteDeger)} <@${t.karsiId}> — fark **${muz(t.fark)}**${t.yonetici ? ' 🛠️' : ''}`)]
    : ['—'];
  embed.addFields(...alanlaraBol('Takaslar (en dengesizler)', tkSatirlar));
  embed.setFooter({ text: 'Defter: ekonomi_hareketleri · mevduat arza dahil, ceza ve faiz ayrı sayılır' });
  return embed;
}

/** `/ekonomi-panel kullanici` embed'i: yeniden eskiye hareket listesi. */
export function hareketEmbed(uyeId, hareketler, bakiyeMetni) {
  const satirlar = hareketler.length > 0
    ? hareketler.map((h) => {
      const karsi = h.karsi_id ? ` · karşı: \`${h.karsi_id}\`` : '';
      return `${zaman(h.zaman, 'd')} ${zaman(h.zaman, 't')} · \`${h.tur}\` · **${isaretli(h.miktar)}** → ${muz(h.bakiye_sonra)}${karsi}`;
    })
    : ['Bu üyenin defterde hareketi yok.'];

  return gomu('bilgi', 'Üye hareketleri')
    .setDescription(`<@${uyeId}> — ${bakiyeMetni}`)
    .addFields(...alanlaraBol(`Son ${hareketler.length} hareket`, satirlar));
}

export async function execute(interaction) {
  if (!yoneticiMi(interaction)) {
    await interaction.reply({ content: '⛔ Bu komutu yalnız **Yönetici** yetkisi olanlar kullanabilir.', flags: MessageFlags.Ephemeral });
    return;
  }

  const db = veritabani();
  const guildId = interaction.guildId;
  const alt = interaction.options.getSubcommand();

  if (alt === 'ozet') {
    const donem = interaction.options.getString('donem') ?? 'bugun';
    // Varsayılan yöneticiler hariç: ×5 gelirleri ve bakiyeleri üye ekonomisini şişirmesin.
    const haric = interaction.options.getBoolean('yoneticiler_dahil') ? [] : yetkiliKimlikler();
    const ozet = panelOzeti(db, guildId, donem, Date.now(), { haric });
    // Kazananlar etiketlenir; yönetici panelinde kimseye bildirim gitmesin, yanıt da gizli.
    await interaction.reply({ embeds: [ozetEmbed(ozet)], flags: MessageFlags.Ephemeral, ...PINGSIZ });
    return;
  }

  const hedef = interaction.options.getUser('uye', true);
  const hareketler = sonHareketler(db, guildId, hedef.id);
  const bakiye = hareketler.length > 0 ? `son bakiye ${muz(hareketler[0].bakiye_sonra)}` : 'hesap yok';
  await interaction.reply({
    embeds: [hareketEmbed(hedef.id, hareketler, bakiye)], flags: MessageFlags.Ephemeral, ...PINGSIZ,
  });
}
