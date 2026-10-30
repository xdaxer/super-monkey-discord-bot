/**
 * Öne çıkanlar akışı. Ekonomi Activity'ye taşınınca oyunlar kanalda görünmez
 * oldu; büyük kazanç/kayıp ve nadir kasa sonuçları burada olaya çevrilir.
 * Olay `ekonomi.akisKanal`a kısa bir embed olarak düşer; son kayıtlar
 * bellekte tutulup Activity'nin yan barına (/api/akis) verilir.
 *
 * Eşik `ekonomi.akisEsik` (varsayılan 2.000): en az bu kadar net kazanç ya da kayıp. Çarpan
 * BUYUK_CARPAN ve üstüyse eşiğin onda biri yeter (küçük bahisle ×36 rulet).
 * Kasada destansı ve üstü kart, her parlak kart ve rozet duyurulur.
 *
 * Animasyonlu sonuçlar animasyon bitene kadar bekletilir (`gecikmeMs`): ne
 * kanal ne şerit sonucu oyuncunun kendi ekranından önce ele vermez.
 */

import { EmbedBuilder } from 'discord.js';

import { ayarGetir } from './ayarlar.js';
import { muz } from './ekonomi.js';
import { esyaGetir } from './esyalar.js';
import {
  kartGetir, NADIRLIK_SIRASI, NADIRLIKLER, sonucMetni, sonucNadirligi,
} from './kasalar.js';

export const OYUN_ADLARI = Object.freeze({
  slot: 'Slot',
  yazitura: 'Yazı-Tura',
  zar: 'Zar',
  rulet: 'Rulet',
  at: 'At Yarışı',
  mines: 'Mines',
  blackjack: 'Blackjack',
  // Yalnız düello; defterdeki oyun adlarının okunur karşılığı için.
  xox: 'XOX',
});

export const BUYUK_CARPAN = 10;
// Destansı 2026-10-24'te eklendi: kasadan çıkan iyi sonuçlar görünsün.
const DUYURULAN_NADIRLIK = new Set(['destansi', 'efsanevi', 'mitik']);
/** En uzun sonuç animasyonu (rulet, at yarışı, kasa şeridi) ~5,6 sn. */
export const ANIMASYON_PAYI_MS = 7_000;
/** Aynı kişinin kumar duyuruları arası (kanal tek kişiyle dolmasın); kasa muaf. */
export const KISI_BEKLEME_MS = 60_000;
/** Bar her kasa düşüşünü de tuttuğu için çoklu açılışlara yer olsun. */
export const AKIS_UZUNLUGU = 60;
const KASA_SATIR_SINIRI = 5;

const RENK = { kazanc: 0x57f287, kayip: 0xed4245 };

/**
 * Kumar sonucu duyurulacak mı? `acilan`: mines'ta açılan kare sayısı.
 * @returns {{tur: 'kazanc'|'kayip', oyun, bahis, net, carpan, acilan} | null}
 */
export function kumarOlayi({
  oyun, bahis, net, carpan, acilan = null,
}, esik) {
  const olay = {
    oyun, bahis, net, carpan, acilan,
  };
  if (net >= esik || (carpan >= BUYUK_CARPAN && net >= esik / 10)) return { tur: 'kazanc', ...olay };
  if (net <= -esik) return { tur: 'kayip', ...olay };
  return null;
}

/** Kasa sonucu (lib/kasalar.js kasaAc'ın `sonuc`u) duyurulacak mı? */
export function kasaSonucuDuyurulurMu(sonuc) {
  if (sonuc.tur === 'kart') return Boolean(sonuc.parlak) || DUYURULAN_NADIRLIK.has(kartGetir(sonuc.kimlik).nadirlik);
  return sonuc.tur === 'esya' && esyaGetir(sonuc.kimlik)?.tur === 'rozet';
}

export function akisEsigi(db, guildId) {
  return ayarGetir(db, guildId, 'ekonomi.akisEsik');
}

const carpanMetni = (c) => `×${Number(c).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

/** Kanal mesajının başlık ve açıklaması. `emoji(nesne)`: kasa sonucundaki eşya/kart emojisi. */
export function duyuruMetni(olay, kullaniciId, emoji = (n) => n.yedek) {
  const kim = `<@${kullaniciId}>`;
  if (olay.tur === 'kasa') {
    const satirlar = olay.sonuclar.slice(0, KASA_SATIR_SINIRI).map((s) => `• ${sonucMetni(s, emoji)}`);
    const fazla = olay.sonuclar.length - satirlar.length;
    if (fazla > 0) satirlar.push(`_…ve ${fazla} tane daha_`);
    return {
      baslik: `🎁 Nadir kasa · ${olay.kasa.ad}`,
      aciklama: `${kim} kasadan çıkardı:\n${satirlar.join('\n')}`,
    };
  }
  const oyun = OYUN_ADLARI[olay.oyun] ?? olay.oyun;
  if (olay.tur === 'kazanc') {
    return {
      baslik: `🎉 Büyük kazanç · ${oyun}`,
      aciklama: `${kim} **${carpanMetni(olay.carpan)}** ile **+${muz(olay.net)}** kazandı!`,
    };
  }
  const mayin = olay.oyun === 'mines' && olay.acilan !== null
    ? ` ${olay.acilan} kare açtıktan sonra mayına bastı:`
    : '';
  return {
    baslik: `💀 Büyük kayıp · ${oyun}`,
    aciklama: `${kim}${mayin} **${muz(-olay.net)}** kaybetti.`,
  };
}

/** Kasa duyurusunun rengi: en nadir sonucun rengi. */
function kasaRengi(olay) {
  const sira = Math.max(...olay.sonuclar.map((s) => NADIRLIK_SIRASI.indexOf(sonucNadirligi(s))));
  return NADIRLIKLER[NADIRLIK_SIRASI[sira]].renk;
}

export function duyuruMesaji(olay, { kullaniciId, ad, avatarUrl = null, emoji }) {
  const { baslik, aciklama } = duyuruMetni(olay, kullaniciId, emoji);
  const embed = new EmbedBuilder()
    .setColor(olay.tur === 'kasa' ? kasaRengi(olay) : RENK[olay.tur])
    .setAuthor({ name: ad, ...(avatarUrl ? { iconURL: avatarUrl } : {}) })
    .setTitle(baslik)
    .setDescription(aciklama)
    .setFooter({ text: 'Muz Ekonomisi · Activity' })
    .setTimestamp();
  // Embed içindeki bahsetme zaten bildirim atmaz; yine de kimse etiketlenmesin.
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

/**
 * Son olaylar (bellekte; yeniden başlatmada sıfırlanması sorun değil) ve
 * kişi başı kanal bekleme süresi.
 */
export function akisDeposu({ uzunluk = AKIS_UZUNLUGU, kisiBeklemeMs = KISI_BEKLEME_MS } = {}) {
  const olaylar = [];
  const sonDuyuru = new Map();
  let sayac = 0;

  return {
    /** `zaman`: olayın görünür olacağı an (animasyon payı eklenmiş). */
    ekle(olay) {
      sayac += 1;
      const kayit = { ...olay, id: sayac };
      olaylar.push(kayit);
      if (olaylar.length > uzunluk) olaylar.splice(0, olaylar.length - uzunluk);
      return kayit;
    },
    /** Görünür olaylar, en yenisi önce. */
    liste(simdi = Date.now()) {
      return olaylar.filter((o) => o.zaman <= simdi).reverse();
    },
    /** Kumar duyurusu kanala gidebilir mi? Gidebiliyorsa zamanı işaretler. */
    kanalaGidebilir(kullaniciId, simdi = Date.now()) {
      const son = sonDuyuru.get(kullaniciId) ?? -Infinity;
      if (simdi - son < kisiBeklemeMs) return false;
      sonDuyuru.set(kullaniciId, simdi);
      if (sonDuyuru.size > 5000) sonDuyuru.clear();
      return true;
    },
  };
}
