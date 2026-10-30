import { nadirlikRengi } from '../magaza/nadirlikRenk.js';
import { Muz } from '@/components/Muz.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';

import { useUygulama } from '@/lib/store.js';
import { bicim } from '@/lib/utils.js';

/** Koleksiyon özeti: puan, farklı/toplam ilerleme, nadirlik sayaçları. */
export function Ozet({ veri }) {
  const nadirlikler = useUygulama((s) => s.katalog?.nadirlikler) ?? [];
  const k = veri.koleksiyon;
  return (
    <div className="yuzey-kart grid gap-5 p-5 lg:grid-cols-[auto_1fr_2fr] lg:items-center lg:gap-8">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-silik">Koleksiyon puanı</div>
        <Muz miktar={k.puan} boyut={24} className="mt-1 text-2xl font-semibold text-muz" />
      </div>
      <div>
        <div className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-silik">
          <span>Farklı kart</span>
          <span className="sayi text-sm normal-case text-metin">{k.farkli}<span className="text-silik">/{k.toplam}</span></span>
        </div>
        <Ilerleme oran={k.farkli / k.toplam} className="mt-2.5" />
        <div className="mt-1.5 text-xs text-soluk"><span className="sayi">{bicim(k.kartSayisi)}</span> kart toplam</div>
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {[...nadirlikler].reverse().map((n) => {
          const kd = k.kademeler.find((x) => x.nadirlik === n.kimlik);
          const renk = nadirlikRengi(n.kimlik);
          return (
            <div key={n.kimlik} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-cizgi bg-zemin/40 px-1.5 py-2 sm:px-2.5">
              <span className="truncate text-[11px] font-medium" style={{ color: renk }}>{n.ad}</span>
              <span className="sayi text-base font-semibold leading-none">{kd?.sahip ?? 0}<span className="text-xs font-normal text-silik">/{kd?.toplam ?? 0}</span></span>
              <Ilerleme oran={(kd?.sahip ?? 0) / (kd?.toplam || 1)} renk={renk} yukseklik={3} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
