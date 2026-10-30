import { nadirlikRengi } from '../magaza/nadirlikRenk.js';
import { Target } from 'lucide-react';

/** Kasa garantisi: "En geç 3 kasa içinde Destansı garanti". `g` = {nadirlik, nadirlikAd, esik, kalan}. */
export function GarantiYazisi({ g }) {
  const renk = nadirlikRengi(g.nadirlik);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-soluk">
      <Target className="size-3.5" style={{ color: renk }} />
      {g.kalan <= 1 ? 'Sıradaki kasada' : <>En geç <b className="sayi text-metin">{g.kalan}</b> kasa içinde</>}
      <b style={{ color: renk }}>{g.nadirlikAd}</b> garanti
    </span>
  );
}
