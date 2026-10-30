import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind sınıflarını birleştirir; çakışanlarda sonuncusu kazanır. */
export function cn(...girdiler) {
  return twMerge(clsx(girdiler));
}

export const bicim = (n) => Number(n ?? 0).toLocaleString('tr-TR');

/** Kısa biçim: 1.250 → 1,25B · 2.500.000 → 2,5M (dar alanlar için). */
export function kisa(n) {
  const x = Number(n ?? 0);
  const m = Math.abs(x);
  const f = (v, e) => `${v.toLocaleString('tr-TR', { maximumFractionDigits: v < 10 ? 2 : 1 })}${e}`;
  if (m >= 1e6) return f(x / 1e6, 'M');
  if (m >= 1e4) return f(x / 1e3, 'B');
  return bicim(x);
}

/** Süre metni: "2 sa 5 dk", "40 sn". */
export function sure(ms) {
  const sn = Math.max(0, Math.ceil(ms / 1000));
  const g = Math.floor(sn / 86400);
  const sa = Math.floor((sn % 86400) / 3600);
  const dk = Math.floor((sn % 3600) / 60);
  const s = sn % 60;
  if (g > 0) return `${g} g ${sa} sa`;
  if (sa > 0) return `${sa} sa ${dk} dk`;
  if (dk > 0) return `${dk} dk${dk < 10 && s > 0 ? ` ${s} sn` : ''}`;
  return `${s} sn`;
}

/** Zaman damgası → "19.10 21:00" (Türkiye saati). */
export function tarih(ms, { yil = false } = {}) {
  return new Date(ms).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', ...(yil ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit',
  });
}

export const carpanMetni = (c) => `${Number(c).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}x`;

export const yuzde = (v, basamak = 1) => `${v >= 0 ? '+' : ''}${Number(v).toLocaleString('tr-TR', { maximumFractionDigits: basamak, minimumFractionDigits: basamak })}%`;

/** localStorage: gizli pencerede ya da kapalıyken sessizce geçer. */
export const depo = {
  oku(anahtar, varsayilan = null) {
    try {
      const v = localStorage.getItem(anahtar);
      return v === null ? varsayilan : JSON.parse(v);
    } catch {
      return varsayilan;
    }
  },
  yaz(anahtar, deger) {
    try {
      localStorage.setItem(anahtar, JSON.stringify(deger));
    } catch {
      // Yalnız kolaylık.
    }
  },
};
