import { useUygulama } from '@/lib/store.js';

/**
 * Nadirlik rengi (katalogdan hex). stil.css'teki --color-<nadirlik> değişkenleri
 * kullanılmadıkça Tailwind tarafından çıktıya alınmadığı için değişkene güvenmiyoruz.
 */
const YEDEK = {
  siradan: '#a1a1aa', nadir: '#60a5fa', destansi: '#c084fc', efsanevi: '#fbbf24', mitik: '#f87171',
};
export const nadirlikRengi = (kimlik) => {
  if (!kimlik) return 'var(--color-cizgi)';
  const n = useUygulama.getState().katalog?.nadirlikler.find((x) => x.kimlik === kimlik);
  return n?.renk ?? YEDEK[kimlik] ?? 'var(--color-cizgi)';
};
