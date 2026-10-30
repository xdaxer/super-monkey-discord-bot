/**
 * Kasa açılışı GIF'i: kasanın içeriğinden öğeler sağdan sola kayar, yavaşlayarak
 * durur ve ortadaki işaretçinin altında gerçek ödül kalır.
 *
 * Yerleşim ve zamanlama hesapları saf fonksiyonlardır (canvas'sız test edilir).
 * Canvas gorsel.js'teki gibi isteğe bağlıdır: yüklenemez ya da çizim hata verirse
 * `kasaGifiUret` null döner ve çağıran yazılı şerit animasyonuna düşer.
 *
 * GIF kodlayıcı: gifenc (saf JS, yerel derleme yok).
 */

import { readFile } from 'node:fs/promises';
import { setImmediate as siradaki } from 'node:timers/promises';

import gifenc from 'gifenc';

import { esyaGetir } from './esyalar.js';
import {
  KARTLAR, KASA_ICERIKLERI, NADIRLIKLER, kartGetir, sonucNadirligi,
} from './kasalar.js';

const { GIFEncoder, applyPalette, quantize } = gifenc;

// ── Ölçüler ve zamanlama ──────────────────────────────────────────────────

export const GENISLIK = 640;
export const YUKSEKLIK = 180;
export const HUCRE = 88;
/** Şeritte görünen hücre sayısı (GENISLIK / HUCRE, tek sayı: ortası işaretçi). */
export const GORUNEN = 7;
/** Şeritteki toplam hücre; ödül sondan birkaç hücre önce durur. */
export const SERIT_HUCRESI = 34;
export const HEDEF_INDEKSI = SERIT_HUCRESI - 5;
export const BOYUT_SINIRI = 2 * 1024 * 1024;

/** Kayma kareleri: sabit aralıklı; yavaşlama konumdan (easing) gelir. */
export const KAYMA_KARESI = 30;
export const KAYMA_GECIKMESI = 7; // 1/100 sn
/** Kayma bittikten sonra çerçeve parlaması kareleri. */
export const PARLAMA_KARESI = 10;
export const PARLAMA_GECIKMESI = 9;
/** Son karede bekleme (GIF döngüye girse de sonuç bir süre görünsün). */
export const SON_BEKLEME = 150;

const PARA_GORSELI = new URL('../varliklar/para.png', import.meta.url);

/** Kasa sınıfı renkleri (başlık şeridi). */
export const KASA_RENKLERI = {
  'kasa-gunluk': 0x95a5a6,
  'kasa-ahsap': 0xa0693b,
  'kasa-demir': 0xbdc3c7,
  'kasa-altin': 0xf1c40f,
  'kasa-elmas': 0x5dade2,
};

// ── Saf hesaplar ──────────────────────────────────────────────────────────

/** Yavaşlayan hareket: hızı başta en yüksek, sonda sıfır (ease-out quart). */
export function yavaslama(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 4;
}

/**
 * Şeridin sola kaydığı piksel miktarı. `ilerleme` 0..1 zamandır; 1'de
 * `hedefIndeks` hücresinin ortası tam olarak görüntünün ortasında olur.
 */
export function kaymaMiktari({
  hedefIndeks = HEDEF_INDEKSI, hucre = HUCRE, genislik = GENISLIK, ilerleme,
}) {
  const hedef = (hedefIndeks + 0.5) * hucre - genislik / 2;
  return hedef * yavaslama(ilerleme);
}

/** Hücrenin ekrandaki sol kenarı. */
export function hucreSolu(indeks, kayma, hucre = HUCRE) {
  return indeks * hucre - kayma;
}

/** Görüntünün ortasındaki (işaretçinin altındaki) hücre. */
export function ortadakiHucre(kayma, { hucre = HUCRE, genislik = GENISLIK } = {}) {
  return Math.floor((kayma + genislik / 2) / hucre);
}

/** Her kayma karesinin ilerlemesi (0..1, son kare tam 1). */
export function kareIlerlemeleri(adet = KAYMA_KARESI) {
  return Array.from({ length: adet }, (_, i) => (i + 1) / adet);
}

function agirlikliSec(liste, rastgele) {
  const toplam = liste.reduce((t, o) => t + o.agirlik, 0);
  let kalan = rastgele() * toplam;
  for (const oge of liste) {
    kalan -= oge.agirlik;
    if (kalan < 0) return oge;
  }
  return liste[liste.length - 1];
}

/** Şerit öğesi: `{tur, emojiAdi, yedek, nadirlik, parlak}`. */
function ogeOlustur(tur, nesne, nadirlik) {
  return {
    tur, emojiAdi: nesne?.emojiAdi ?? null, yedek: nesne?.yedek ?? '❓', nadirlik, parlak: Boolean(nesne?.parlak),
  };
}

/** Kasa içeriğinden ağırlıklı rastgele bir şerit öğesi. */
export function rastgeleOge(kasa, rastgele = Math.random) {
  const secilen = agirlikliSec(KASA_ICERIKLERI[kasa], rastgele);
  if (secilen.tur === 'muz') return ogeOlustur('muz', null, 'siradan');
  if (secilen.tur === 'kart') {
    const havuz = KARTLAR.filter((k) => k.nadirlik === secilen.nadirlik);
    const kart = havuz[Math.min(havuz.length - 1, Math.floor(rastgele() * havuz.length))];
    return ogeOlustur('kart', kart, kart.nadirlik);
  }
  const esya = esyaGetir(secilen.kimlik);
  return ogeOlustur(esya.tur === 'kasa' ? 'kasa' : 'esya', esya, sonucNadirligi({ tur: secilen.tur, kimlik: secilen.kimlik }));
}

/** Gerçek ödülün şerit öğesi. */
export function odulOgesi(sonuc) {
  const nadirlik = sonucNadirligi(sonuc);
  if (sonuc.tur === 'muz') return ogeOlustur('muz', null, nadirlik);
  if (sonuc.tur === 'kart') return ogeOlustur('kart', kartGetir(sonuc.kimlik), nadirlik);
  const esya = esyaGetir(sonuc.kimlik ?? sonuc.yerine);
  return ogeOlustur(esya.tur === 'kasa' ? 'kasa' : 'esya', esya, nadirlik);
}

/** Bütün şerit: rastgele öğeler, `hedefIndeks` yerinde gerçek ödül. */
export function seritOlustur(kasa, sonuc, { rastgele = Math.random, hucreSayisi = SERIT_HUCRESI, hedefIndeks = HEDEF_INDEKSI } = {}) {
  const serit = Array.from({ length: hucreSayisi }, () => rastgeleOge(kasa, rastgele));
  serit[hedefIndeks] = odulOgesi(sonuc);
  return serit;
}

/** GIF'in oynama süresi (ms): mesajı ne zaman sonuca çevireceğimizi belirler. */
export function gifSuresi() {
  return KAYMA_KARESI * KAYMA_GECIKMESI * 10 + PARLAMA_KARESI * PARLAMA_GECIKMESI * 10;
}

const onaltilik = (sayi) => `#${sayi.toString(16).padStart(6, '0')}`;

// ── Canvas (isteğe bağlı) ─────────────────────────────────────────────────

let canvasModulu;

export async function canvasYukle() {
  if (canvasModulu !== undefined) return canvasModulu;
  try {
    canvasModulu = await import('@napi-rs/canvas');
  } catch {
    canvasModulu = null;
  }
  return canvasModulu;
}

/** Görsel indirici: URL → Buffer. İndirilemezse hata atar (çağıran yedeğe düşer). */
export async function varsayilanIndirici(url) {
  const yanit = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!yanit.ok) throw new Error(`görsel indirilemedi: HTTP ${yanit.status}`);
  return Buffer.from(await yanit.arrayBuffer());
}

/** Bellek içi görsel önbelleği: URL → Promise<Image|null>. */
const gorselOnbellegi = new Map();
const ONBELLEK_SINIRI = 300;

function gorselYukle(anahtar, getir, loadImage) {
  if (!gorselOnbellegi.has(anahtar)) {
    if (gorselOnbellegi.size >= ONBELLEK_SINIRI) gorselOnbellegi.delete(gorselOnbellegi.keys().next().value);
    const vaat = getir().then((tampon) => loadImage(tampon)).catch(() => {
      // Başarısızlık önbellekte kalmasın: sonraki açılışta yeniden denensin.
      gorselOnbellegi.delete(anahtar);
      return null;
    });
    gorselOnbellegi.set(anahtar, vaat);
  }
  return gorselOnbellegi.get(anahtar);
}

/** Testlerde önbelleği sıfırlamak için. */
export function onbellegiTemizle() {
  gorselOnbellegi.clear();
}

async function ogeGorseli(oge, { emojiBul, indir, loadImage }) {
  if (oge.tur === 'muz') {
    return gorselYukle('para', () => readFile(PARA_GORSELI), loadImage);
  }
  const emoji = oge.emojiAdi ? emojiBul(oge.emojiAdi) : null;
  const url = emoji?.imageURL?.({ extension: 'png', size: 64 });
  if (!url) return null;
  return gorselYukle(url, () => indir(url), loadImage);
}

// ── Çizim ─────────────────────────────────────────────────────────────────

const YAZI = '"DejaVu Sans", "Segoe UI", sans-serif';

function yuvarlakDikdortgen(ctx, x, y, g, y2, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, g, y2, r);
}

/** Görseli olmayan öğe: nadirlik renginde bir yedek simge (emoji yazı tipi varsa emojisiyle). */
function yedekCiz(ctx, oge, x, y, boyut) {
  const renk = onaltilik(NADIRLIKLER[oge.nadirlik].renk);
  const mx = x + boyut / 2;
  const my = y + boyut / 2;
  ctx.fillStyle = renk;
  ctx.globalAlpha = 0.85;
  if (oge.tur === 'kasa') {
    yuvarlakDikdortgen(ctx, x + boyut * 0.12, y + boyut * 0.3, boyut * 0.76, boyut * 0.5, 6);
  } else {
    ctx.beginPath();
    ctx.arc(mx, my, boyut * 0.4, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.font = `${Math.round(boyut * 0.5)}px "Noto Color Emoji", ${YAZI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(oge.yedek, mx, my + 2);
}

/** Parlak (✨) ödül hücresi: altın çerçeve ve köşelerde dört köşeli yıldız parıltıları. */
function parlakCiz(ctx, x) {
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 3;
  yuvarlakDikdortgen(ctx, x + 5, 5, HUCRE - 10, HUCRE - 10, 10);
  ctx.stroke();
  ctx.fillStyle = '#fff3a0';
  for (const [dx, dy, r] of [[0.2, 0.2, 9], [0.8, 0.28, 7], [0.72, 0.78, 8], [0.26, 0.72, 5]]) {
    const mx = x + HUCRE * dx;
    const my = HUCRE * dy;
    ctx.beginPath();
    ctx.moveTo(mx, my - r);
    ctx.quadraticCurveTo(mx, my, mx + r, my);
    ctx.quadraticCurveTo(mx, my, mx, my + r);
    ctx.quadraticCurveTo(mx, my, mx - r, my);
    ctx.quadraticCurveTo(mx, my, mx, my - r);
    ctx.fill();
  }
}

/** Tüm şeridi tek uzun tuvale çizer; kareler bu tuvalden kesit alır. */
async function seritTuvali(canvas, serit, ayarlar) {
  const { createCanvas } = canvas;
  const tuval = createCanvas(serit.length * HUCRE, HUCRE);
  const ctx = tuval.getContext('2d');
  const gorseller = await Promise.all(serit.map((oge) => ogeGorseli(oge, { ...ayarlar, loadImage: canvas.loadImage })));

  serit.forEach((oge, i) => {
    const x = i * HUCRE;
    const renk = onaltilik(NADIRLIKLER[oge.nadirlik].renk);
    // Hücre zemini ve altta nadirlik çizgisi
    ctx.fillStyle = '#2b2d31';
    yuvarlakDikdortgen(ctx, x + 4, 4, HUCRE - 8, HUCRE - 8, 10);
    ctx.fill();
    ctx.fillStyle = renk;
    ctx.fillRect(x + 12, HUCRE - 12, HUCRE - 24, 3);

    if (oge.parlak) parlakCiz(ctx, x);

    const gorsel = gorseller[i];
    if (gorsel) {
      const pay = 14;
      ctx.drawImage(gorsel, x + pay, pay - 2, HUCRE - pay * 2, HUCRE - pay * 2);
    } else {
      yedekCiz(ctx, oge, x + 12, 8, HUCRE - 24);
    }
  });
  return tuval;
}

/** Sabit arka plan: koyu zemin, üstte kasa adı ve sınıf rengi şeridi. */
function arkaPlanCiz(ctx, kasa) {
  const zemin = ctx.createLinearGradient(0, 0, 0, YUKSEKLIK);
  zemin.addColorStop(0, '#1e2124');
  zemin.addColorStop(1, '#17191c');
  ctx.fillStyle = zemin;
  ctx.fillRect(0, 0, GENISLIK, YUKSEKLIK);

  const renk = onaltilik(KASA_RENKLERI[kasa] ?? 0x99aab5);
  ctx.fillStyle = renk;
  ctx.fillRect(0, 0, GENISLIK, 4);

  ctx.font = `bold 20px ${YAZI}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = renk;
  ctx.fillText(esyaGetir(kasa).ad, 16, 22);
}

const SERIT_Y = 46;

/** Kenarlara doğru kararma ve ortadaki işaretçi (üstte/altta üçgen). */
function kaplamaCiz(ctx) {
  for (const [x0, x1] of [[0, 150], [GENISLIK, GENISLIK - 150]]) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(23,25,28,0.95)');
    g.addColorStop(1, 'rgba(23,25,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), SERIT_Y, 150, HUCRE);
  }
  const orta = GENISLIK / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(orta - 9, SERIT_Y - 9);
  ctx.lineTo(orta + 9, SERIT_Y - 9);
  ctx.lineTo(orta, SERIT_Y + 1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(orta - 9, SERIT_Y + HUCRE + 9);
  ctx.lineTo(orta + 9, SERIT_Y + HUCRE + 9);
  ctx.lineTo(orta, SERIT_Y + HUCRE - 1);
  ctx.closePath();
  ctx.fill();
}

/** Ödül hücresinin nadirlik renginde parlayan çerçevesi. `guc` 0..1. */
function parlamaCiz(ctx, renkSayisi, guc) {
  const renk = onaltilik(renkSayisi);
  const x = GENISLIK / 2 - HUCRE / 2;
  ctx.save();
  ctx.shadowColor = renk;
  ctx.shadowBlur = 10 + 14 * guc;
  ctx.strokeStyle = renk;
  ctx.lineWidth = 3 + 2 * guc;
  yuvarlakDikdortgen(ctx, x + 2, SERIT_Y + 2, HUCRE - 4, HUCRE - 4, 11);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 0.12 + 0.14 * guc;
  ctx.fillStyle = renk;
  yuvarlakDikdortgen(ctx, x + 4, SERIT_Y + 4, HUCRE - 8, HUCRE - 8, 10);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Kasa açılış GIF'ini üretir.
 *
 * @param {object} p
 * @param {string} p.kasa kasa kimliği
 * @param {object} p.sonuc `kasaAc` sonucu (`sonuc.sonuc`)
 * @param {(ad: string) => ({imageURL: Function}|null)} [p.emojiBul] sunucu emojisini adıyla bulur
 * @param {(url: string) => Promise<Buffer>} [p.indir] görsel indirici (testte ağsız verilir)
 * @param {() => number} [p.rastgele]
 * @returns {Promise<{gif: Buffer, png: Buffer, sureMs: number, kareSayisi: number} | null>}
 *   canvas yoksa ya da üretim hata verirse null
 */
export async function kasaGifiUret({
  kasa, sonuc, emojiBul = () => null, indir = varsayilanIndirici, rastgele = Math.random,
}) {
  const canvas = await canvasYukle();
  if (!canvas) return null;

  try {
    const { createCanvas } = canvas;
    const serit = seritOlustur(kasa, sonuc, { rastgele });
    // Tek tek indirme hataları yedek şekle düşer; indirici dışarıdan verilebilir.
    const tuval = await seritTuvali(canvas, serit, {
      emojiBul, indir: (url) => Promise.resolve().then(() => indir(url)),
    });

    const sayfa = createCanvas(GENISLIK, YUKSEKLIK);
    const ctx = sayfa.getContext('2d');
    const arka = createCanvas(GENISLIK, YUKSEKLIK);
    arkaPlanCiz(arka.getContext('2d'), kasa);
    // Parlak ödülde son parlama altın renkte olur.
    const nadirlikRengi = serit[HEDEF_INDEKSI].parlak ? 0xffd700 : NADIRLIKLER[serit[HEDEF_INDEKSI].nadirlik].renk;

    const kareCiz = (kayma, parlama = null) => {
      ctx.drawImage(arka, 0, 0);
      ctx.drawImage(tuval, Math.round(-kayma), SERIT_Y);
      kaplamaCiz(ctx);
      if (parlama !== null) parlamaCiz(ctx, nadirlikRengi, parlama);
      return ctx.getImageData(0, 0, GENISLIK, YUKSEKLIK).data;
    };

    // Kareler: önce kayma, sonra parlama. Aynı piksele düşen kareler birleştirilir.
    const kareler = [];
    let sonKayma = null;
    for (const ilerleme of kareIlerlemeleri()) {
      const kayma = Math.round(kaymaMiktari({ ilerleme }));
      if (kayma === sonKayma) {
        kareler.at(-1).gecikme += KAYMA_GECIKMESI;
      } else {
        kareler.push({ kayma, parlama: null, gecikme: KAYMA_GECIKMESI });
        sonKayma = kayma;
      }
    }
    const bitisKaymasi = sonKayma;
    for (let i = 0; i < PARLAMA_KARESI; i += 1) {
      const guc = (Math.sin((i / PARLAMA_KARESI) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      kareler.push({ kayma: bitisKaymasi, parlama: i === PARLAMA_KARESI - 1 ? 1 : guc, gecikme: PARLAMA_GECIKMESI });
    }
    kareler.at(-1).gecikme = SON_BEKLEME;

    // Genel palet: ilk, orta ve son karelerden örneklenir; kare başına paletten küçük dosya.
    const ornekler = [kareler[0], kareler[Math.floor(kareler.length / 3)], kareler.at(-1)]
      .map((k) => Uint8ClampedArray.from(kareCiz(k.kayma, k.parlama)));
    const ornek = new Uint8ClampedArray(ornekler.reduce((t, o) => t + o.length, 0));
    let sira = 0;
    for (const o of ornekler) {
      ornek.set(o, sira);
      sira += o.length;
    }
    const palet = quantize(ornek, 128, { format: 'rgb444' });

    const kodlayici = GIFEncoder();
    for (const k of kareler) {
      const indeksler = applyPalette(kareCiz(k.kayma, k.parlama), palet, 'rgb444');
      kodlayici.writeFrame(indeksler, GENISLIK, YUKSEKLIK, {
        palette: palet, delay: k.gecikme * 10, repeat: -1,
      });
      // Olay döngüsünü kareler arasında serbest bırak (bot başka etkileşimlere yanıt verebilsin).
      await siradaki();
    }
    kodlayici.finish();

    const gif = Buffer.from(kodlayici.bytes());
    if (gif.length > BOYUT_SINIRI) return null;
    // Son kare statik PNG olarak da döner: mesaj sonuca çevrilince GIF yerine bu görünür.
    kareCiz(bitisKaymasi, 1);
    const png = await sayfa.encode('png');
    return {
      gif,
      png,
      sureMs: kareler.reduce((t, k) => t + k.gecikme, 0) * 10 - SON_BEKLEME * 10,
      kareSayisi: kareler.length,
    };
  } catch {
    return null;
  }
}
