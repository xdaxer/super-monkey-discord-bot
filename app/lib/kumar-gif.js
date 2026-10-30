/**
 * Slot ve rulet GIF'leri: kasa açılışındaki gibi yavaşlayarak duran bir
 * animasyon, sonunda gerçek sonuç ve kazandıysa/kaybettiyse parlama.
 *
 * Slot: üç dikey makara, soldan sağa sırayla durur; ortadaki satır kazanç çizgisi.
 * Rulet: Avrupa çarkının sayı dizilimi yatay şerit olarak kayar, top (işaretçi)
 * çıkan sayının üstünde durur.
 *
 * Sonuç GIF'ten ÖNCE belirlenip yazılmıştır; GIF yalnız gösterimdir. Canvas
 * yüklenemez ya da çizim hata verirse üreticiler null döner ve çağıran düz
 * sonuç gömüsüne düşer.
 */

import { setImmediate as siradaki } from 'node:timers/promises';

import gifenc from 'gifenc';

import { canvasYukle, yavaslama } from './kasa-gif.js';
import { ATLAR, SLOT_SEMBOLLERI, ruletRengi } from './kumar.js';

const { GIFEncoder, applyPalette, quantize } = gifenc;

export const BOYUT_SINIRI = 2 * 1024 * 1024;
const YAZI = '"DejaVu Sans", "Segoe UI", sans-serif';
const EMOJI = '"Noto Color Emoji"';
const ZEMIN_UST = '#1e2124';
const ZEMIN_ALT = '#17191c';
const KAZANC_RENGI = '#ffd700';
const KAYIP_RENGI = '#e74c3c';
const virgullu = (sayi) => String(sayi).replace('.', ',');

// ── Ortak ─────────────────────────────────────────────────────────────────

/** Avrupa ruleti çarkındaki sayı sırası (0'dan saat yönünde). */
export const CARK_SIRASI = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

/** Parlama kareleri için 0..1 nabız; son kare tam güç. */
function nabiz(i, adet) {
  if (i === adet - 1) return 1;
  return (Math.sin((i / adet) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
}

function arkaPlan(ctx, genislik, yukseklik, baslik, renk, sag = null) {
  const zemin = ctx.createLinearGradient(0, 0, 0, yukseklik);
  zemin.addColorStop(0, ZEMIN_UST);
  zemin.addColorStop(1, ZEMIN_ALT);
  ctx.fillStyle = zemin;
  ctx.fillRect(0, 0, genislik, yukseklik);
  ctx.fillStyle = renk;
  ctx.fillRect(0, 0, genislik, 4);
  ctx.font = `bold 20px ${YAZI}, ${EMOJI}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(baslik, 16, 22);
  if (sag) {
    ctx.font = `15px ${YAZI}, ${EMOJI}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#b9bbbe';
    ctx.fillText(sag, genislik - 16, 22);
  }
}

/** Parlayan çerçeve. `guc` 0..1. */
function parlama(ctx, x, y, g, h, renk, guc) {
  ctx.save();
  ctx.shadowColor = renk;
  ctx.shadowBlur = 10 + 14 * guc;
  ctx.strokeStyle = renk;
  ctx.lineWidth = 3 + 2 * guc;
  ctx.beginPath();
  ctx.roundRect(x, y, g, h, 11);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 0.1 + 0.14 * guc;
  ctx.fillStyle = renk;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, g - 4, h - 4, 10);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Kareleri tek paletle GIF'e kodlar. `kareler`: `{durum, gecikme}` (gecikme 1/100 sn);
 * `ciz(durum)` o karenin RGBA verisini döner.
 */
async function gifKodla({ kareler, ciz, genislik, yukseklik }) {
  const ornekler = [kareler[0], kareler[Math.floor(kareler.length / 2)], kareler.at(-1)]
    .map((k) => Uint8ClampedArray.from(ciz(k.durum)));
  const ornek = new Uint8ClampedArray(ornekler.reduce((t, o) => t + o.length, 0));
  let sira = 0;
  for (const o of ornekler) {
    ornek.set(o, sira);
    sira += o.length;
  }
  const palet = quantize(ornek, 256, { format: 'rgb565' });

  const kodlayici = GIFEncoder();
  for (const k of kareler) {
    const indeksler = applyPalette(ciz(k.durum), palet, 'rgb565');
    kodlayici.writeFrame(indeksler, genislik, yukseklik, { palette: palet, delay: k.gecikme * 10, repeat: -1 });
    // Olay döngüsünü kareler arasında serbest bırak.
    await siradaki();
  }
  kodlayici.finish();
  return Buffer.from(kodlayici.bytes());
}

/** Son bekleme hariç oynama süresi (ms). */
function oynamaSuresi(kareler) {
  return (kareler.reduce((t, k) => t + k.gecikme, 0) - kareler.at(-1).gecikme) * 10;
}

// ── Slot ──────────────────────────────────────────────────────────────────

export const SLOT_GENISLIK = 420;
export const SLOT_YUKSEKLIK = 304;
export const SLOT_HUCRE = 72;
const SLOT_MAKARA_G = 104;
const SLOT_ARALIK = 16;
const SLOT_Y = 48;
const SLOT_X = (SLOT_GENISLIK - (3 * SLOT_MAKARA_G + 2 * SLOT_ARALIK)) / 2;
/** Her makaranın durduğu kare (soldan sağa sırayla). */
export const SLOT_DURUSLARI = [16, 24, 32];
const SLOT_GECIKME = 6;
const SLOT_PARLAMA_KARESI = 10;
const SLOT_PARLAMA_GECIKMESI = 9;
const SON_BEKLEME = 200;

/**
 * Bir makaranın şeridi: rastgele semboller, sondan bir önceki hücrede sonuç.
 * Pencere üç satır gösterir; sonuç ortadaki satırda durur.
 */
export function makaraSeridi(sonuc, uzunluk, rastgele = Math.random) {
  const simgeler = SLOT_SEMBOLLERI.map((s) => s.simge);
  const serit = Array.from({ length: uzunluk }, () => simgeler[Math.floor(rastgele() * simgeler.length)]);
  serit[uzunluk - 2] = sonuc;
  return serit;
}

/** Makara kaydırması (px): pencerenin üst kenarının şeritteki konumu. */
export function makaraKaymasi(uzunluk, ilerleme) {
  return (uzunluk - 3) * SLOT_HUCRE * yavaslama(ilerleme);
}

/** Kazanç çizgisinde eşleşen makaralar (parlayacak olanlar). */
export function eslesenMakaralar(makaralar) {
  const [a, b, c] = makaralar;
  if (a === b && b === c) return [0, 1, 2];
  if (a === b) return [0, 1];
  if (a === c) return [0, 2];
  if (b === c) return [1, 2];
  return [];
}

function makaraTuvali(createCanvas, serit) {
  const tuval = createCanvas(SLOT_MAKARA_G, serit.length * SLOT_HUCRE);
  const ctx = tuval.getContext('2d');
  ctx.font = `${Math.round(SLOT_HUCRE * 0.66)}px ${EMOJI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  serit.forEach((simge, i) => {
    ctx.fillText(simge, SLOT_MAKARA_G / 2, i * SLOT_HUCRE + SLOT_HUCRE / 2 + 3);
  });
  return tuval;
}

/**
 * Slot GIF'i.
 * @param {object} p
 * @param {string[]} p.makaralar `slotCevir` sonucundaki üç simge
 * @param {number} p.carpan
 * @param {() => number} [p.rastgele]
 * @returns {Promise<{gif: Buffer, png: Buffer, sureMs: number, kareSayisi: number} | null>}
 */
export async function slotGifiUret({ makaralar, carpan, rastgele = Math.random }) {
  const canvas = await canvasYukle();
  if (!canvas) return null;

  try {
    const { createCanvas } = canvas;
    const uzunluklar = SLOT_DURUSLARI.map((d) => 10 + d);
    const tuvaller = makaralar.map((s, i) => makaraTuvali(createCanvas, makaraSeridi(s, uzunluklar[i], rastgele)));
    const eslesen = eslesenMakaralar(makaralar);
    const kazandi = carpan > 0;

    const arka = createCanvas(SLOT_GENISLIK, SLOT_YUKSEKLIK);
    const actx = arka.getContext('2d');
    arkaPlan(actx, SLOT_GENISLIK, SLOT_YUKSEKLIK, '🎰 Slot', KAZANC_RENGI);
    for (let i = 0; i < 3; i += 1) {
      const x = SLOT_X + i * (SLOT_MAKARA_G + SLOT_ARALIK);
      const g = actx.createLinearGradient(0, SLOT_Y, 0, SLOT_Y + 3 * SLOT_HUCRE);
      g.addColorStop(0, '#202225');
      g.addColorStop(0.5, '#3a3d43');
      g.addColorStop(1, '#202225');
      actx.fillStyle = g;
      actx.beginPath();
      actx.roundRect(x, SLOT_Y, SLOT_MAKARA_G, 3 * SLOT_HUCRE, 12);
      actx.fill();
    }

    const sayfa = createCanvas(SLOT_GENISLIK, SLOT_YUKSEKLIK);
    const ctx = sayfa.getContext('2d');
    const ortaY = SLOT_Y + SLOT_HUCRE;

    const ciz = ({ kare, guc }) => {
      ctx.drawImage(arka, 0, 0);
      for (let i = 0; i < 3; i += 1) {
        const x = SLOT_X + i * (SLOT_MAKARA_G + SLOT_ARALIK);
        const kayma = Math.round(makaraKaymasi(uzunluklar[i], Math.min(1, kare / SLOT_DURUSLARI[i])));
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, SLOT_Y, SLOT_MAKARA_G, 3 * SLOT_HUCRE, 12);
        ctx.clip();
        ctx.drawImage(tuvaller[i], x, SLOT_Y - kayma);
        // Üst ve alt satırı karart: göz kazanç çizgisine gitsin.
        for (const [y0, y1] of [[SLOT_Y, SLOT_Y + SLOT_HUCRE], [SLOT_Y + 3 * SLOT_HUCRE, SLOT_Y + 2 * SLOT_HUCRE]]) {
          const g = ctx.createLinearGradient(0, y0, 0, y1);
          g.addColorStop(0, 'rgba(23,25,28,0.92)');
          g.addColorStop(1, 'rgba(23,25,28,0.25)');
          ctx.fillStyle = g;
          ctx.fillRect(x, Math.min(y0, y1), SLOT_MAKARA_G, SLOT_HUCRE);
        }
        ctx.restore();
      }
      // Kazanç çizgisi okları
      ctx.fillStyle = '#ffffff';
      for (const [x, yon] of [[SLOT_X - 4, 1], [SLOT_GENISLIK - SLOT_X + 4, -1]]) {
        ctx.beginPath();
        ctx.moveTo(x - 10 * yon, ortaY + SLOT_HUCRE / 2 - 10);
        ctx.lineTo(x - 10 * yon, ortaY + SLOT_HUCRE / 2 + 10);
        ctx.lineTo(x, ortaY + SLOT_HUCRE / 2);
        ctx.closePath();
        ctx.fill();
      }
      if (guc !== null) {
        const renk = kazandi ? KAZANC_RENGI : KAYIP_RENGI;
        const parlayan = kazandi ? eslesen : [0, 1, 2];
        for (const i of parlayan) {
          const x = SLOT_X + i * (SLOT_MAKARA_G + SLOT_ARALIK);
          parlama(ctx, x + 2, ortaY + 2, SLOT_MAKARA_G - 4, SLOT_HUCRE - 4, renk, kazandi ? guc : guc * 0.5);
        }
        ctx.font = `bold 22px ${YAZI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = renk;
        const metin = kazandi ? `${String(carpan).replace('.', ',')}x` : 'Eşleşme yok';
        ctx.fillText(metin, SLOT_GENISLIK / 2, SLOT_Y + 3 * SLOT_HUCRE + 28);
      }
      return ctx.getImageData(0, 0, SLOT_GENISLIK, SLOT_YUKSEKLIK).data;
    };

    const kareler = [];
    for (let kare = 1; kare <= SLOT_DURUSLARI.at(-1); kare += 1) {
      // Makara durduğu karede biraz bekle: "tık" hissi.
      const duran = SLOT_DURUSLARI.includes(kare);
      kareler.push({ durum: { kare, guc: null }, gecikme: duran ? SLOT_GECIKME * 3 : SLOT_GECIKME });
    }
    const son = SLOT_DURUSLARI.at(-1);
    for (let i = 0; i < SLOT_PARLAMA_KARESI; i += 1) {
      kareler.push({ durum: { kare: son, guc: nabiz(i, SLOT_PARLAMA_KARESI) }, gecikme: SLOT_PARLAMA_GECIKMESI });
    }
    kareler.at(-1).gecikme = SON_BEKLEME;

    const gif = await gifKodla({ kareler, ciz, genislik: SLOT_GENISLIK, yukseklik: SLOT_YUKSEKLIK });
    if (gif.length > BOYUT_SINIRI) return null;
    ciz(kareler.at(-1).durum);
    const png = await sayfa.encode('png');
    return { gif, png, sureMs: oynamaSuresi(kareler), kareSayisi: kareler.length };
  } catch {
    return null;
  }
}

// ── Rulet ─────────────────────────────────────────────────────────────────

export const RULET_GENISLIK = 640;
export const RULET_YUKSEKLIK = 170;
export const RULET_HUCRE = 64;
const RULET_Y = 50;
/** Sonuç şeritte en az bu indekste durur (kayma mesafesi). */
export const RULET_EN_AZ_HEDEF = 60;
const RULET_KAYMA_KARESI = 34;
const RULET_GECIKME = 6;
const RULET_PARLAMA_KARESI = 10;
const RULET_PARLAMA_GECIKMESI = 9;

const RULET_RENKLERI = { kirmizi: '#c0392b', siyah: '#23272a', yesil: '#1e8449' };

/**
 * Çark sırasından şerit: rastgele bir noktadan başlar, `sayi` en az
 * `RULET_EN_AZ_HEDEF` indeksinde bir kez daha gelir ve orada durur.
 * @returns {{serit: number[], hedef: number}}
 */
export function ruletSeridi(sayi, rastgele = Math.random) {
  const baslangic = Math.floor(rastgele() * CARK_SIRASI.length);
  const konum = CARK_SIRASI.indexOf(sayi);
  // baslangic + hedef ≡ konum (mod 37) ve hedef ≥ EN_AZ
  let hedef = (konum - baslangic + CARK_SIRASI.length) % CARK_SIRASI.length;
  while (hedef < RULET_EN_AZ_HEDEF) hedef += CARK_SIRASI.length;
  const uzunluk = hedef + 7;
  const serit = Array.from({ length: uzunluk }, (_, i) => CARK_SIRASI[(baslangic + i) % CARK_SIRASI.length]);
  return { serit, hedef };
}

/** Şeridin sola kayması (px): ilerleme 1'de hedef hücre tam ortada. */
export function ruletKaymasi(hedef, ilerleme) {
  return ((hedef + 0.5) * RULET_HUCRE - RULET_GENISLIK / 2) * yavaslama(ilerleme);
}

function ruletTuvali(createCanvas, serit) {
  const tuval = createCanvas(serit.length * RULET_HUCRE, RULET_HUCRE);
  const ctx = tuval.getContext('2d');
  ctx.font = `bold 24px ${YAZI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  serit.forEach((sayi, i) => {
    const x = i * RULET_HUCRE;
    ctx.fillStyle = RULET_RENKLERI[ruletRengi(sayi)];
    ctx.beginPath();
    ctx.roundRect(x + 3, 3, RULET_HUCRE - 6, RULET_HUCRE - 6, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(sayi), x + RULET_HUCRE / 2, RULET_HUCRE / 2 + 1);
  });
  return tuval;
}

/**
 * Rulet GIF'i.
 * @param {object} p
 * @param {number} p.sayi çıkan sayı
 * @param {number} p.carpan
 * @param {string} [p.secimMetni] sağ üstte gösterilecek seçim ("Seçim: Kırmızı")
 * @param {() => number} [p.rastgele]
 */
export async function ruletGifiUret({ sayi, carpan, secimMetni = null, rastgele = Math.random }) {
  const canvas = await canvasYukle();
  if (!canvas) return null;

  try {
    const { createCanvas } = canvas;
    const { serit, hedef } = ruletSeridi(sayi, rastgele);
    const tuval = ruletTuvali(createCanvas, serit);
    const kazandi = carpan > 0;

    const arka = createCanvas(RULET_GENISLIK, RULET_YUKSEKLIK);
    arkaPlan(arka.getContext('2d'), RULET_GENISLIK, RULET_YUKSEKLIK, '🎡 Rulet', '#1e8449', secimMetni);

    const sayfa = createCanvas(RULET_GENISLIK, RULET_YUKSEKLIK);
    const ctx = sayfa.getContext('2d');
    const orta = RULET_GENISLIK / 2;

    const ciz = ({ kayma, guc }) => {
      ctx.drawImage(arka, 0, 0);
      ctx.drawImage(tuval, Math.round(-kayma), RULET_Y);
      for (const [x0, x1] of [[0, 160], [RULET_GENISLIK, RULET_GENISLIK - 160]]) {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, 'rgba(23,25,28,0.95)');
        g.addColorStop(1, 'rgba(23,25,28,0)');
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(x0, x1), RULET_Y, 160, RULET_HUCRE);
      }
      // İşaretçi: üstte top, altta üçgen
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(orta, RULET_Y - 10, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(orta - 9, RULET_Y + RULET_HUCRE + 10);
      ctx.lineTo(orta + 9, RULET_Y + RULET_HUCRE + 10);
      ctx.lineTo(orta, RULET_Y + RULET_HUCRE);
      ctx.closePath();
      ctx.fill();
      if (guc !== null) {
        const renk = kazandi ? KAZANC_RENGI : KAYIP_RENGI;
        parlama(ctx, orta - RULET_HUCRE / 2, RULET_Y, RULET_HUCRE, RULET_HUCRE, renk, guc);
        ctx.font = `bold 18px ${YAZI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = renk;
        ctx.fillText(kazandi ? `Kazandın · ${carpan}x` : 'Kasa kazandı', orta, RULET_Y + RULET_HUCRE + 30);
      }
      return ctx.getImageData(0, 0, RULET_GENISLIK, RULET_YUKSEKLIK).data;
    };

    const kareler = [];
    let sonKayma = null;
    for (let i = 1; i <= RULET_KAYMA_KARESI; i += 1) {
      const kayma = Math.round(ruletKaymasi(hedef, i / RULET_KAYMA_KARESI));
      if (kayma === sonKayma) {
        kareler.at(-1).gecikme += RULET_GECIKME;
      } else {
        kareler.push({ durum: { kayma, guc: null }, gecikme: RULET_GECIKME });
        sonKayma = kayma;
      }
    }
    for (let i = 0; i < RULET_PARLAMA_KARESI; i += 1) {
      kareler.push({ durum: { kayma: sonKayma, guc: nabiz(i, RULET_PARLAMA_KARESI) }, gecikme: RULET_PARLAMA_GECIKMESI });
    }
    kareler.at(-1).gecikme = SON_BEKLEME;

    const gif = await gifKodla({ kareler, ciz, genislik: RULET_GENISLIK, yukseklik: RULET_YUKSEKLIK });
    if (gif.length > BOYUT_SINIRI) return null;
    ciz(kareler.at(-1).durum);
    const png = await sayfa.encode('png');
    return { gif, png, sureMs: oynamaSuresi(kareler), kareSayisi: kareler.length };
  } catch {
    return null;
  }
}

// ── At yarışı ─────────────────────────────────────────────────────────────

export const AT_GENISLIK = 640;
const AT_KULVAR = 44;
const AT_Y = 48;
const AT_ALT_PAY = 36;
const AT_BASLANGIC = 176;
const AT_BITIS = 606;
const AT_BOYUT = 40;
const AT_ETIKET_G = AT_BASLANGIC - 24;
export const AT_KOSU_KARESI = 40;
const AT_GECIKME = 7;
const AT_PARLAMA_KARESI = 10;
const AT_PARLAMA_GECIKMESI = 9;

/** Kulvar sayısına göre GIF yüksekliği. */
export const atYuksekligi = (kulvar) => AT_Y + kulvar * AT_KULVAR + AT_ALT_PAY;

/**
 * Her karede her atın konumu (0 = başlangıç, 1 = bitiş). Konumlar hiç geri
 * gitmez; kazanan yalnız son karede 1'e varır, diğerleri 1'in altında kalır.
 * Ortada dalgalanma vardır: önde giden yarış boyunca değişebilir.
 * @param {number} kazananIndeks kazanan kulvar (0'dan)
 * @returns {number[][]} kare × kulvar
 */
export function yarisKonumlari(kazananIndeks, { atSayisi = ATLAR.length, kare = AT_KOSU_KARESI, rastgele = Math.random } = {}) {
  const atlar = Array.from({ length: atSayisi }, (_, i) => ({
    kazanan: i === kazananIndeks,
    sure: i === kazananIndeks ? 1 : 1.06 + rastgele() * 0.2,
    genlik: 0.05 + rastgele() * 0.05,
    faz: rastgele() * Math.PI * 2,
    frekans: Math.PI * 2 * (1 + rastgele()),
  }));
  const enIleri = atlar.map(() => 0);
  return Array.from({ length: kare }, (_, i) => {
    const t = (i + 1) / kare;
    return atlar.map((a, j) => {
      let konum = t / a.sure + a.genlik * Math.sin(a.faz + a.frekans * t) * 4 * t * (1 - t);
      if (a.kazanan) konum = i === kare - 1 ? 1 : Math.min(konum, 0.995);
      else konum = Math.min(konum, 0.97);
      enIleri[j] = Math.max(enIleri[j], konum, 0);
      return enIleri[j];
    });
  });
}

function atGorseli(createCanvas) {
  const tuval = createCanvas(AT_BOYUT + 8, AT_BOYUT + 8);
  const ctx = tuval.getContext('2d');
  // Emoji sola bakar; aynalayıp sağa koşturuyoruz.
  ctx.translate(tuval.width, 0);
  ctx.scale(-1, 1);
  ctx.font = `${AT_BOYUT}px ${EMOJI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏇', tuval.width / 2, tuval.height / 2 + 2);
  return tuval;
}

/** Metni genişliğe sığdırır, sığmazsa sonuna "…" koyar. */
function sigdir(ctx, metin, genislik) {
  if (ctx.measureText(metin).width <= genislik) return metin;
  let kisa = metin;
  while (kisa.length > 1 && ctx.measureText(`${kisa}…`).width > genislik) kisa = kisa.slice(0, -1);
  return `${kisa}…`;
}

/**
 * Genel yarış GIF'i.
 * @param {object} p
 * @param {{baslik: string, alt?: string, vurgulu?: boolean}[]} p.kulvarlar
 * @param {number} p.kazananIndeks
 * @param {string} [p.sagUst] başlığın sağındaki yazı
 * @param {string} p.sonMetin sonda altta yazılacak
 * @param {string} p.sonRenk
 */
async function yarisGifiUret({
  kulvarlar, kazananIndeks, sagUst = null, sonMetin, sonRenk, rastgele = Math.random,
}) {
  const canvas = await canvasYukle();
  if (!canvas) return null;

  try {
    const { createCanvas } = canvas;
    const yukseklik = atYuksekligi(kulvarlar.length);
    const konumlar = yarisKonumlari(kazananIndeks, { atSayisi: kulvarlar.length, rastgele });
    const at = atGorseli(createCanvas);
    const kulvarY = (i) => AT_Y + i * AT_KULVAR;

    const arka = createCanvas(AT_GENISLIK, yukseklik);
    const actx = arka.getContext('2d');
    arkaPlan(actx, AT_GENISLIK, yukseklik, '🏇 At yarışı', '#a0693b', sagUst);
    kulvarlar.forEach((k, i) => {
      const y = kulvarY(i);
      actx.fillStyle = i % 2 === 0 ? '#2b2d31' : '#26282c';
      actx.fillRect(0, y, AT_GENISLIK, AT_KULVAR);
      if (k.vurgulu) {
        actx.fillStyle = 'rgba(255,215,0,0.10)';
        actx.fillRect(0, y, AT_GENISLIK, AT_KULVAR);
        actx.fillStyle = KAZANC_RENGI;
        actx.fillRect(0, y, 4, AT_KULVAR);
      }
      actx.textBaseline = 'middle';
      actx.textAlign = 'left';
      actx.fillStyle = '#ffffff';
      actx.font = `bold 16px ${YAZI}, ${EMOJI}`;
      actx.fillText(sigdir(actx, k.baslik, AT_ETIKET_G), 14, y + AT_KULVAR / 2 - (k.alt ? 7 : 0));
      if (k.alt) {
        actx.fillStyle = '#8e9297';
        actx.font = `12px ${YAZI}`;
        actx.fillText(k.alt, 14, y + AT_KULVAR / 2 + 10);
      }
    });
    // Başlangıç çizgisi ve damalı bitiş
    const altY = kulvarY(kulvarlar.length);
    actx.fillStyle = 'rgba(255,255,255,0.25)';
    actx.fillRect(AT_BASLANGIC, AT_Y, 2, altY - AT_Y);
    const dama = 6;
    for (let y = AT_Y, r = 0; y < altY; y += dama, r += 1) {
      for (let c = 0; c < 2; c += 1) {
        actx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
        actx.fillRect(AT_BITIS + c * dama, y, dama, Math.min(dama, altY - y));
      }
    }

    const sayfa = createCanvas(AT_GENISLIK, yukseklik);
    const ctx = sayfa.getContext('2d');

    const ciz = ({ kare, guc }) => {
      ctx.drawImage(arka, 0, 0);
      if (guc !== null) {
        parlama(ctx, 2, kulvarY(kazananIndeks) + 1, AT_GENISLIK - 4, AT_KULVAR - 2, KAZANC_RENGI, guc);
      }
      konumlar[kare].forEach((konum, i) => {
        // Burun konumda: at görseli onun soluna çizilir.
        const burun = AT_BASLANGIC + konum * (AT_BITIS - AT_BASLANGIC);
        ctx.drawImage(at, Math.round(burun - at.width + 4), kulvarY(i) + (AT_KULVAR - at.height) / 2);
      });
      if (guc !== null) {
        ctx.font = `bold 20px ${YAZI}, ${EMOJI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = sonRenk;
        ctx.fillText(sigdir(ctx, sonMetin, AT_GENISLIK - 32), AT_GENISLIK / 2, yukseklik - 20);
      }
      return ctx.getImageData(0, 0, AT_GENISLIK, yukseklik).data;
    };

    const kareler = konumlar.map((_, k) => ({ durum: { kare: k, guc: null }, gecikme: AT_GECIKME }));
    const son = konumlar.length - 1;
    for (let i = 0; i < AT_PARLAMA_KARESI; i += 1) {
      kareler.push({ durum: { kare: son, guc: nabiz(i, AT_PARLAMA_KARESI) }, gecikme: AT_PARLAMA_GECIKMESI });
    }
    kareler.at(-1).gecikme = SON_BEKLEME;

    const gif = await gifKodla({ kareler, ciz, genislik: AT_GENISLIK, yukseklik });
    if (gif.length > BOYUT_SINIRI) return null;
    ciz(kareler.at(-1).durum);
    const png = await sayfa.encode('png');
    return { gif, png, sureMs: oynamaSuresi(kareler), kareSayisi: kareler.length };
  } catch {
    return null;
  }
}

/**
 * Kumar at yarışı GIF'i: beş at, oyuncunun atı vurgulu.
 * @param {object} p
 * @param {number} p.secim oyuncunun atı (1–5)
 * @param {number} p.kazanan kazanan at
 * @param {number} p.carpan
 * @param {() => number} [p.rastgele]
 */
export function atGifiUret({ secim, kazanan, carpan, rastgele = Math.random }) {
  const secilen = ATLAR.find((a) => a.no === secim);
  const kazananAt = ATLAR.find((a) => a.no === kazanan);
  return yarisGifiUret({
    kulvarlar: ATLAR.map((a) => ({
      baslik: `${a.no} ${a.ad}`, alt: `${virgullu(a.carpan)}x · %${a.sans}`, vurgulu: a.no === secim,
    })),
    kazananIndeks: ATLAR.indexOf(kazananAt),
    sagUst: `Seçim: ${secilen.no} ${secilen.ad}`,
    sonMetin: carpan > 0 ? `🏆 Kazandın · ${virgullu(carpan)}x` : `Kazanan: ${kazananAt.no} ${kazananAt.ad}`,
    sonRenk: carpan > 0 ? KAZANC_RENGI : KAYIP_RENGI,
    rastgele,
  });
}

/**
 * Düello at yarışı GIF'i: iki kulvar, iki oyuncu.
 * @param {object} p
 * @param {[string, string]} p.adlar meydan okuyan ve rakibin görünen adları
 * @param {'meydan'|'rakip'} p.kazanan
 */
export function duelloAtGifiUret({ adlar, kazanan, rastgele = Math.random }) {
  const kazananIndeks = kazanan === 'meydan' ? 0 : 1;
  return yarisGifiUret({
    kulvarlar: adlar.map((ad, i) => ({ baslik: ad, alt: i === 0 ? 'meydan okuyan' : 'rakip' })),
    kazananIndeks,
    sagUst: '⚔️ Düello',
    sonMetin: `🏆 ${adlar[kazananIndeks]} kazandı`,
    sonRenk: KAZANC_RENGI,
    rastgele,
  });
}
