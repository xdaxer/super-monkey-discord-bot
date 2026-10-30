/**
 * Hisse fiyat grafiği: son saatlerin çizgi grafiği (PNG). @napi-rs/canvas yoksa
 * ya da çizim hata verirse `null` döner; komut o zaman `metinOzeti` kullanır.
 */

import { bicimle } from './ekonomi.js';

/** Noktaların kapsadığı süre: "12 saat", "45 dk" (fiyat adımı 5 dk). */
function kapsam(noktalar) {
  const dk = Math.round((noktalar.at(-1).saat - noktalar[0].saat) / 60_000);
  return dk >= 60 ? `${Math.round(dk / 60)} saat` : `${dk} dk`;
}

export const GENISLIK = 800;
export const YUKSEKLIK = 360;

let canvasModulu;

async function canvasYukle() {
  if (canvasModulu !== undefined) return canvasModulu;
  try {
    canvasModulu = await import('@napi-rs/canvas');
  } catch {
    canvasModulu = null;
  }
  return canvasModulu;
}

const YAZI = '"Segoe UI", "DejaVu Sans", sans-serif';

/** Noktaların özeti (saf): ilk, son, en düşük, en yüksek ve değişim %. */
export function ozet(noktalar) {
  if (noktalar.length === 0) return null;
  const fiyatlar = noktalar.map((n) => n.fiyat);
  const ilk = fiyatlar[0];
  const son = fiyatlar.at(-1);
  return {
    ilk, son, en: Math.min(...fiyatlar), yuksek: Math.max(...fiyatlar), degisimYuzde: ilk > 0 ? ((son - ilk) / ilk) * 100 : 0,
  };
}

const BLOKLAR = '▁▂▃▄▅▆▇█';

/** Canvas yokken kullanılan metin özeti: küçük çizgi + özet satırı. */
export function metinOzeti(sirket, noktalar) {
  const o = ozet(noktalar);
  if (!o) return `${sirket.sembol}: henüz fiyat geçmişi yok.`;
  const aralik = o.yuksek - o.en || 1;
  const cizgi = noktalar
    .map((n) => BLOKLAR[Math.min(BLOKLAR.length - 1, Math.floor(((n.fiyat - o.en) / aralik) * BLOKLAR.length))])
    .join('');
  const isaret = o.degisimYuzde >= 0 ? '+' : '';
  return `**${sirket.sembol}** son ${kapsam(noktalar)}\n\`${cizgi}\`\n`
    + `Şimdi **${bicimle(o.son)}** · en düşük ${bicimle(o.en)} · en yüksek ${bicimle(o.yuksek)} · `
    + `değişim ${isaret}${o.degisimYuzde.toFixed(1).replace('.', ',')}%`;
}

/**
 * @param {{sirket: object, noktalar: Array<{saat: number, fiyat: number}>}} p
 * @returns {Promise<Buffer|null>} PNG; kütüphane yoksa, veri yetersizse ya da hata olursa null
 */
export async function fiyatGrafigi({ sirket, noktalar, ikon = null }) {
  const canvas = await canvasYukle();
  if (!canvas || noktalar.length < 2) return null;
  const ikonResmi = ikon ? await canvas.loadImage(ikon).catch(() => null) : null;

  try {
    const yuzey = canvas.createCanvas(GENISLIK, YUKSEKLIK);
    const ctx = yuzey.getContext('2d');
    const o = ozet(noktalar);
    const artis = o.son >= o.ilk;
    const renk = artis ? '#57f287' : '#ed4245';

    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, GENISLIK, YUKSEKLIK);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 24px ${YAZI}`;
    // Şirket ikonu (sunucu emojisi) varsa başlığın soluna.
    if (ikonResmi) ctx.drawImage(ikonResmi, 22, 12, 34, 34);
    ctx.fillText(`${sirket.sembol} · ${sirket.ad}`, ikonResmi ? 66 : 24, 38);
    ctx.font = `bold 22px ${YAZI}`;
    ctx.fillStyle = renk;
    const isaret = o.degisimYuzde >= 0 ? '+' : '';
    ctx.textAlign = 'right';
    ctx.fillText(`${bicimle(o.son)}  (${isaret}${o.degisimYuzde.toFixed(1).replace('.', ',')}%)`, GENISLIK - 24, 38);
    ctx.textAlign = 'left';

    const sol = 70;
    const sag = GENISLIK - 24;
    const ust = 64;
    const alt = YUKSEKLIK - 40;
    const kenar = Math.max((o.yuksek - o.en) * 0.1, o.son * 0.005, 1);
    const min = o.en - kenar;
    const maks = o.yuksek + kenar;
    const x = (i) => sol + (i / (noktalar.length - 1)) * (sag - sol);
    const y = (f) => alt - ((f - min) / (maks - min)) * (alt - ust);

    ctx.font = `13px ${YAZI}`;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const deger = min + ((maks - min) * i) / 4;
      ctx.strokeStyle = '#3a3c43';
      ctx.beginPath();
      ctx.moveTo(sol, y(deger));
      ctx.lineTo(sag, y(deger));
      ctx.stroke();
      ctx.fillStyle = '#9aa0a6';
      ctx.fillText(bicimle(deger), 10, y(deger) + 4);
    }
    ctx.fillStyle = '#9aa0a6';
    ctx.fillText(`${kapsam(noktalar)} önce`, sol, YUKSEKLIK - 14);
    ctx.textAlign = 'right';
    ctx.fillText('şimdi', sag, YUKSEKLIK - 14);
    ctx.textAlign = 'left';

    // Alan dolgusu + çizgi.
    ctx.beginPath();
    ctx.moveTo(x(0), alt);
    noktalar.forEach((n, i) => ctx.lineTo(x(i), y(n.fiyat)));
    ctx.lineTo(x(noktalar.length - 1), alt);
    ctx.closePath();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = renk;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    noktalar.forEach((n, i) => (i === 0 ? ctx.moveTo(x(i), y(n.fiyat)) : ctx.lineTo(x(i), y(n.fiyat))));
    ctx.strokeStyle = renk;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x(noktalar.length - 1), y(o.son), 5, 0, Math.PI * 2);
    ctx.fillStyle = renk;
    ctx.fill();

    return yuzey.toBuffer('image/png');
  } catch {
    return null;
  }
}

// ── Piyasa panosu ──────────────────────────────────────────────────────────

export const PANO_GENISLIK = 960;
export const PANO_YUKSEKLIK = 600;
const SUTUN = 3;
const BOSLUK = 16;
const BASLIK_YUKSEKLIGI = 76;

/** Yuvarlak köşeli dikdörtgen yolu. */
function yuvarlakDikdortgen(ctx, x, y, g, y2, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + g, y, x + g, y + y2, r);
  ctx.arcTo(x + g, y + y2, x, y + y2, r);
  ctx.arcTo(x, y + y2, x, y, r);
  ctx.arcTo(x, y, x + g, y, r);
  ctx.closePath();
}

/** Kart içine küçük çizgi grafik (eksensiz) çizer. */
function miniGrafik(ctx, noktalar, { x, y, g, h }, renk) {
  if (noktalar.length < 2) return;
  const fiyatlar = noktalar.map((n) => n.fiyat);
  const en = Math.min(...fiyatlar);
  const yuksek = Math.max(...fiyatlar);
  const aralik = Math.max(yuksek - en, yuksek * 0.01, 1);
  const px = (i) => x + (i / (noktalar.length - 1)) * g;
  const py = (f) => y + h - ((f - en) / aralik) * h;

  ctx.beginPath();
  ctx.moveTo(px(0), y + h);
  fiyatlar.forEach((f, i) => ctx.lineTo(px(i), py(f)));
  ctx.lineTo(px(fiyatlar.length - 1), y + h);
  ctx.closePath();
  const dolgu = ctx.createLinearGradient(0, y, 0, y + h);
  dolgu.addColorStop(0, `${renk}55`);
  dolgu.addColorStop(1, `${renk}00`);
  ctx.fillStyle = dolgu;
  ctx.fill();

  ctx.beginPath();
  fiyatlar.forEach((f, i) => (i === 0 ? ctx.moveTo(px(i), py(f)) : ctx.lineTo(px(i), py(f))));
  ctx.strokeStyle = renk;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * Bütün şirketlerin tek resimde panosu: her şirket bir kart (ikon, sembol,
 * ad, fiyat, 24 sa değişim, son saatlerin mini grafiği).
 *
 * @param {object} p
 * @param {Array<{sirket: object, fiyat: number|null, degisimYuzde: number|null, noktalar: Array<{fiyat: number}>}>} p.satirlar
 * @param {(sirket: object) => Promise<Buffer|null>} [p.ikon] şirket ikonunun PNG'si (yoksa null)
 * @param {string} [p.altYazi] alt satır (ör. güncelleme zamanı)
 * @returns {Promise<Buffer|null>} PNG; canvas yoksa ya da hata olursa null
 */
export async function piyasaPanosu({ satirlar, ikon = async () => null, altYazi = '' }) {
  const canvas = await canvasYukle();
  if (!canvas || satirlar.length === 0) return null;

  try {
    const yuzey = canvas.createCanvas(PANO_GENISLIK, PANO_YUKSEKLIK);
    const ctx = yuzey.getContext('2d');
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, PANO_GENISLIK, PANO_YUKSEKLIK);

    ctx.fillStyle = '#ffd166';
    ctx.font = `bold 30px ${YAZI}`;
    ctx.fillText('Muz Borsası', 24, 48);
    ctx.fillStyle = '#9aa0a6';
    ctx.font = `15px ${YAZI}`;
    ctx.textAlign = 'right';
    ctx.fillText(altYazi, PANO_GENISLIK - 24, 46);
    ctx.textAlign = 'left';

    const satirSayisi = Math.ceil(satirlar.length / SUTUN);
    const kartG = (PANO_GENISLIK - BOSLUK * (SUTUN + 1)) / SUTUN;
    const kartY = (PANO_YUKSEKLIK - BASLIK_YUKSEKLIGI - BOSLUK * satirSayisi) / satirSayisi;

    const ikonlar = await Promise.all(satirlar.map(async ({ sirket }) => {
      try {
        const veri = await ikon(sirket);
        return veri ? await canvas.loadImage(veri) : null;
      } catch {
        return null;
      }
    }));

    satirlar.forEach(({ sirket, fiyat, degisimYuzde, noktalar }, i) => {
      const x = BOSLUK + (i % SUTUN) * (kartG + BOSLUK);
      const y = BASLIK_YUKSEKLIGI + Math.floor(i / SUTUN) * (kartY + BOSLUK);
      const artis = (degisimYuzde ?? 0) >= 0;
      const renk = degisimYuzde === null ? '#9aa0a6' : artis ? '#57f287' : '#ed4245';

      yuvarlakDikdortgen(ctx, x, y, kartG, kartY, 14);
      ctx.fillStyle = '#2b2d31';
      ctx.fill();
      // Sol kenarda yön şeridi.
      ctx.save();
      ctx.clip();
      ctx.fillStyle = renk;
      ctx.fillRect(x, y, 5, kartY);
      ctx.restore();

      const ic = x + 18;
      if (ikonlar[i]) ctx.drawImage(ikonlar[i], ic, y + 16, 40, 40);
      else {
        ctx.font = `30px ${YAZI}`;
        ctx.fillText(sirket.yedek ?? '📈', ic, y + 48);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 22px ${YAZI}`;
      ctx.fillText(sirket.sembol, ic + 52, y + 36);
      ctx.fillStyle = '#b5bac1';
      ctx.font = `13px ${YAZI}`;
      let ad = sirket.ad;
      while (ctx.measureText(ad).width > kartG - 90 && ad.length > 4) ad = `${ad.slice(0, -2)}…`;
      ctx.fillText(ad, ic + 52, y + 55);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 26px ${YAZI}`;
      ctx.fillText(fiyat === null ? '—' : bicimle(fiyat), ic, y + 96);
      ctx.fillStyle = renk;
      ctx.font = `bold 16px ${YAZI}`;
      const yuzde = degisimYuzde === null
        ? 'yeni'
        : `${artis ? '▲' : '▼'} ${Math.abs(degisimYuzde).toFixed(1).replace('.', ',')}%`;
      ctx.textAlign = 'right';
      ctx.fillText(yuzde, x + kartG - 16, y + 94);
      ctx.textAlign = 'left';

      miniGrafik(ctx, noktalar, { x: ic, y: y + 112, g: kartG - 34, h: kartY - 128 }, renk);
    });

    return yuzey.toBuffer('image/png');
  } catch {
    return null;
  }
}
