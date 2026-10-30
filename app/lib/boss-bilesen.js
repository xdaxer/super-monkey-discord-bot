import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { sistemAcikMi } from './ayarlar.js';
import { gomu, zaman } from './bicim.js';
import {
  aktifBoss, bossBul, bossGorunumu, DURUMLAR, hasarSirasi, KATILIM_KASASI, saldir, SALDIRI_BEKLEME_MS, sonucOzeti,
  KATILIM_MUZ, TESELLI_MUZ,
} from './boss.js';
import { veritabani } from './db.js';
import { muz } from './ekonomi.js';
import { esyaGetir } from './esyalar.js';
import { emojiCozucu } from './kasa-bilesen.js';

const ONEK = 'boss';
const CUBUK_UZUNLUGU = 20;
/** Mesaj düzenlemeleri en sık bu aralıkla yapılır (Discord düzenleme sınırı). */
export const GUNCELLEME_ARALIGI_MS = 3000;
const ILK_SAYISI = 5;

export const SALDIR_BUTON_ID = `${ONEK}:saldir`;

/** customId boss saldırı butonu mu */
export function saldirButonuMu(customId) {
  return customId === SALDIR_BUTON_ID;
}

export function saldirButonu(kapali = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SALDIR_BUTON_ID)
      .setLabel('Saldır')
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(kapali),
  );
}

/** Can çubuğu: dolu kısım █, boş kısım ░ ve "kalan / toplam". */
export function canCubugu(can, maxCan, uzunluk = CUBUK_UZUNLUGU) {
  const oran = maxCan > 0 ? Math.max(0, Math.min(1, can / maxCan)) : 0;
  let dolu = Math.round(oran * uzunluk);
  // Can varsa en az bir blok görünsün; hasar yediyse çubuk tam dolu görünmesin.
  if (can > 0 && dolu === 0) dolu = 1;
  if (can > 0 && can < maxCan && dolu === uzunluk) dolu = uzunluk - 1;
  return `${'█'.repeat(dolu)}${'░'.repeat(uzunluk - dolu)} ${Math.max(0, can).toLocaleString('tr-TR')} / ${maxCan.toLocaleString('tr-TR')}`;
}

const MADALYA = ['🥇', '🥈', '🥉'];

function gorunum(guild, savas) {
  const emoji = emojiCozucu(guild);
  const g = bossGorunumu(savas.boss, savas.elit === 1);
  return { simge: emoji(g), ad: g.ad };
}

/** Canlı boss mesajının gömüsü. */
export function bossGomusu(db, guild, savas) {
  const { simge, ad } = gorunum(guild, savas);
  const elit = savas.elit === 1;
  const sira = hasarSirasi(db, savas.id, ILK_SAYISI);
  const liste = sira.length > 0
    ? sira.map((s, i) => `${MADALYA[i] ?? `**${i + 1}.**`} <@${s.kullanici_id}> — ${s.hasar.toLocaleString('tr-TR')}`).join('\n')
    : '_Henüz kimse saldırmadı._';

  const bitti = savas.durum !== DURUMLAR.aktif;
  const yenildi = savas.durum === DURUMLAR.yenildi;
  let baslik = `${simge} ${elit ? 'ELİT ' : ''}BOSS: ${ad}`;
  if (yenildi) baslik = `${simge} ${ad} yenildi!`;
  else if (bitti) baslik = `${simge} ${ad} kaçtı`;

  const satirlar = [`# ${baslik}`, `\`${canCubugu(savas.can, savas.max_can)}\``];
  if (!bitti) satirlar.push(`⏳ Kalan süre: ${zaman(savas.bitis, 'R')} (${zaman(savas.bitis, 'f')})`);
  satirlar.push('', '**En çok hasar verenler**', liste);

  let renk = elit ? 'uyari' : 'hata';
  if (bitti) renk = yenildi ? 'basari' : 'notr';
  return gomu(renk)
    .setDescription(satirlar.join('\n'))
    .setFooter({
      text: bitti
        ? 'Savaş sona erdi.'
        : `Her üye ${SALDIRI_BEKLEME_MS / 3_600_000} saatte bir saldırabilir (buton ya da /boss saldir). Kart gücün hasarı artırır.`,
    });
}

/** Güncel veriyle boss mesajını düzenler (hata atmaz). */
export async function bossMesajiniGuncelle(client, db, savasId) {
  try {
    const savas = bossBul(db, savasId);
    if (!savas?.kanal_id || !savas.mesaj_id) return;
    const kanal = await client.channels.fetch(savas.kanal_id);
    const mesaj = await kanal.messages.fetch(savas.mesaj_id);
    await mesaj.edit({
      embeds: [bossGomusu(db, kanal.guild, savas)],
      components: [saldirButonu(savas.durum !== DURUMLAR.aktif)],
      allowedMentions: { parse: [] },
    });
  } catch {
    // Mesaj silindi ya da kanal erişilemez: savaş yine de sürer.
  }
}

const bekleyen = new Map(); // savasId -> zamanlayıcı
const sonDuzenleme = new Map(); // savasId -> ms

/**
 * Düzenleme isteği: aynı savaş için en çok GUNCELLEME_ARALIGI_MS'de bir mesaj
 * düzenlenir; aradaki saldırılar tek düzenlemede toplanır. `hemen`: savaş
 * bittiğinde bekleme atlanır.
 */
export function guncellemeIste(client, db, savasId, { hemen = false, simdi = Date.now() } = {}) {
  if (hemen) {
    clearTimeout(bekleyen.get(savasId));
    bekleyen.delete(savasId);
    sonDuzenleme.set(savasId, simdi);
    return bossMesajiniGuncelle(client, db, savasId);
  }
  if (bekleyen.has(savasId)) return Promise.resolve();
  const bekleme = Math.max(0, GUNCELLEME_ARALIGI_MS - (simdi - (sonDuzenleme.get(savasId) ?? 0)));
  const zamanlayici = setTimeout(() => {
    bekleyen.delete(savasId);
    sonDuzenleme.set(savasId, Date.now());
    bossMesajiniGuncelle(client, db, savasId);
  }, bekleme);
  zamanlayici.unref?.();
  bekleyen.set(savasId, zamanlayici);
  return Promise.resolve();
}

/** Sonuç duyurusu: ilk 3 (ve son vuruş) etiketlenir. */
export function sonucDuyurusu(db, guild, savas) {
  const { simge, ad } = gorunum(guild, savas);
  const o = sonucOzeti(db, savas);
  const yenildi = savas.durum === DURUMLAR.yenildi;
  const satirlar = [];
  if (yenildi) {
    const kasa = esyaGetir(KATILIM_KASASI);
    satirlar.push(
      `**${o.katilimci}** savaşçı toplam ${o.toplamHasar.toLocaleString('tr-TR')} hasar verdi.`,
      `Herkese **${muz(KATILIM_MUZ)} + 2 × hasarı** (toplam ${muz(o.dagitilan)}) + ${kasa.yedek} **${kasa.ad}**.`,
    );
  } else {
    satirlar.push(
      `${o.katilimci} savaşçı toplam ${o.toplamHasar.toLocaleString('tr-TR')} hasar verdi ama yetmedi. `
      + `Katılan herkese teselli: **${muz(TESELLI_MUZ)}**.`,
    );
  }
  if (o.ilk3.length > 0) {
    satirlar.push('', '**En çok hasar verenler**');
    o.ilk3.forEach((s, i) => satirlar.push(`${MADALYA[i]} <@${s.kullanici_id}> — ${s.hasar.toLocaleString('tr-TR')}`));
  }
  const sonVurus = yenildi ? savas.son_vurus_id : null;
  if (sonVurus) satirlar.push('', `🎯 Son vuruş: <@${sonVurus}> (ek ödül)`);

  const etiketler = [...new Set([...o.ilk3.map((s) => s.kullanici_id), ...(sonVurus ? [sonVurus] : [])])];
  return {
    content: yenildi
      ? `🏆 ${simge} **${ad}** yenildi! ${etiketler.map((i) => `<@${i}>`).join(' ')}`
      : `💨 ${simge} **${ad}** kaçtı...`,
    embeds: [gomu(yenildi ? 'basari' : 'notr').setDescription(satirlar.join('\n'))],
    allowedMentions: { users: etiketler },
  };
}

/** Saldırı sonucu gizli yanıt metni. */
export function saldiriMetni(s, simdi = Date.now()) {
  if (!s.ok) {
    if (s.kalanMs) return `⏳ Henüz dinleniyorsun. Sıradaki saldırın: ${zaman(simdi + s.kalanMs, 'R')}.`;
    return s.sebep;
  }
  const guc = s.guc > 0 ? ` (kart gücün: +${s.guc})` : '';
  const satirlar = [
    `${s.kritik ? '💥 **KRİTİK VURUŞ!** ' : '⚔️ '}**${s.hasar.toLocaleString('tr-TR')}** hasar verdin.${guc}`,
    s.sonVurus ? '🎯 **Son vuruşu sen yaptın!** Boss yenildi.' : `Bossun kalan canı: ${Math.max(0, s.can).toLocaleString('tr-TR')}`,
  ];
  if (!s.sonVurus) satirlar.push(`Sıradaki saldırın: ${zaman(s.sonrakiSaldiri, 'R')}.`);
  return satirlar.join('\n');
}

/**
 * Hem buton hem `/boss saldir` için ortak saldırı akışı. Sonuç yanıtı gizlidir;
 * mesaj güncellemesi toplu, savaş bittiyse hemen yapılır (duyuruyu servis
 * döngüsü bir kez gönderir).
 */
export async function saldiriAkisi(interaction) {
  const db = veritabani();
  if (!sistemAcikMi(db, interaction.guildId, 'ekonomi')) {
    await interaction.reply({ content: 'Ekonomi sistemi bu sunucuda kapalı.', flags: MessageFlags.Ephemeral });
    return null;
  }
  const s = saldir(db, { guildId: interaction.guildId, kullaniciId: interaction.user.id });
  await interaction.reply({ content: saldiriMetni(s), flags: MessageFlags.Ephemeral });

  const sonuc = s.ok ? s.sonuc : s.bitti;
  const savasId = sonuc?.savas?.id ?? aktifBoss(db, interaction.guildId)?.id;
  if (savasId) await guncellemeIste(interaction.client, db, savasId, { hemen: Boolean(sonuc) });
  return s;
}

export function bossBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && saldirButonuMu(i.customId),
      calistir: saldiriAkisi,
    },
  ];
}
