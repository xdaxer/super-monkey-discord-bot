import {
  ArrowDownUp, ChevronRight, History, Search, Store,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Giris, girisSinifi } from '@/components/ui/giris.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { useUygulama } from '@/lib/store.js';
import { bicim, cn, tarih } from '@/lib/utils.js';
import { nadirlikRengi } from '../magaza/nadirlikRenk.js';
import { kartBilgisi, KartAdi, KartKaresi } from './ortak.jsx';

const SIRALAMALAR = [
  { kimlik: 'populer', ad: 'En çok satılan', fn: (a, b) => b.satis24 - a.satis24 || b.adet - a.adet },
  { kimlik: 'ucuz', ad: 'En ucuz', fn: (a, b) => (a.enDusuk ?? Infinity) - (b.enDusuk ?? Infinity) },
  { kimlik: 'pahali', ad: 'En pahalı', fn: (a, b) => (b.enDusuk ?? -1) - (a.enDusuk ?? -1) },
  { kimlik: 'adet', ad: 'En çok ilan', fn: (a, b) => b.adet - a.adet },
  { kimlik: 'ad', ad: 'Ada göre', fn: (a, b) => a.bilgi.ad.localeCompare(b.bilgi.ad, 'tr') },
];

/** Vitrin satırı (Steam'deki pazar listesi): kart, satıştaki adet, başlangıç fiyatı. */
function Satir({ v, ac }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => ac(v.kimlik)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-yuzey-2 active:bg-yuzey-2 pointer-coarse:py-2.5"
      >
        <KartKaresi kimlik={v.kimlik} boyut={36} />
        <KartAdi
          kimlik={v.kimlik}
          alt={v.satis24 > 0 ? `24 saatte ${bicim(v.satis24)} satış` : null}
          className="flex-1 text-sm"
        />
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {v.enDusuk
            ? <><span className="text-[11px] text-silik">başlangıç</span><Muz miktar={v.enDusuk} boyut={14} className="text-sm" /></>
            : <span className="text-xs text-silik">İlan yok</span>}
          {v.adet > 0 && <span className="sayi text-[11px] text-silik">{bicim(v.adet)} adet</span>}
          {v.enYuksekIstek && <span className="sayi text-[11px] text-yesil">istek {bicim(v.enYuksekIstek)}</span>}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-silik" />
      </button>
    </li>
  );
}

/** Pazar vitrini: arama, nadirlik süzgeci, sıralama; yanda son satışlar. */
export function Vitrin({ veri, ac }) {
  const katalog = useUygulama((s) => s.katalog);
  const [ara, setAra] = useState('');
  const [nadirlik, setNadirlik] = useState(null);
  const [siralama, setSiralama] = useState('populer');

  const liste = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr-TR');
    const sira = SIRALAMALAR.find((s) => s.kimlik === siralama)?.fn ?? SIRALAMALAR[0].fn;
    return veri.vitrin
      .map((v) => ({ ...v, bilgi: kartBilgisi(v.kimlik) }))
      .filter((v) => (!nadirlik || v.bilgi.nadirlik === nadirlik) && (!q || v.bilgi.ad.toLocaleLowerCase('tr-TR').includes(q)))
      .sort(sira);
  }, [veri.vitrin, ara, nadirlik, siralama]);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Kart className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-48 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silik" />
              <Giris value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Pazarda ara" className="pl-9" aria-label="Pazarda ara" />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-soluk">
              <ArrowDownUp aria-hidden className="size-4" />
              <select value={siralama} onChange={(e) => setSiralama(e.target.value)} className={cn(girisSinifi, 'w-auto pr-8')} aria-label="Sıralama">
                {SIRALAMALAR.map((s) => <option key={s.kimlik} value={s.kimlik}>{s.ad}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nadirlik">
            {[{ kimlik: null, ad: 'Hepsi' }, ...(katalog?.nadirlikler ?? [])].map((n) => (
              <button
                key={n.kimlik ?? 'hepsi'}
                type="button"
                aria-pressed={nadirlik === n.kimlik}
                onClick={() => setNadirlik(n.kimlik)}
                className={cn(
                  'flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors pointer-coarse:min-h-11',
                  nadirlik === n.kimlik ? 'border-muz/50 bg-muz/10 font-medium text-metin' : 'border-cizgi text-soluk hover:border-cizgi-guclu hover:text-metin',
                )}
              >
                {n.kimlik && <span aria-hidden className="size-2 rounded-full" style={{ background: nadirlikRengi(n.kimlik) }} />}
                {n.ad}
              </button>
            ))}
          </div>
        </div>

        {veri.vitrin.length === 0 ? (
          <Bos ikon={Store} baslik="Pazar henüz boş" aciklama="İlk ilanı sen aç: elindeki kartlardan birini fiyatını belirleyip sat." className="py-8" />
        ) : liste.length === 0 ? (
          <p className="py-8 text-center text-sm text-silik">Bu aramayla eşleşen kart yok.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {liste.map((v) => <Satir key={v.kimlik} v={v} ac={ac} />)}
          </ul>
        )}
      </Kart>

      <Kart className="p-4 sm:p-5">
        <KartBaslik ikon={History} baslik="Son satışlar" />
        {veri.sonSatislar.length === 0 ? (
          <p className="py-4 text-center text-sm text-silik">Henüz satış olmadı.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {veri.sonSatislar.map((s, i) => (
              // Dar ekranda liste vitrinin altına düşer; orada kısa kalsın.
              <li key={s.id} className={cn(i >= 6 && 'max-lg:hidden')}>
                <button type="button" onClick={() => ac(s.kart)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-yuzey-2">
                  <KartKaresi kimlik={s.kart} boyut={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{kartBilgisi(s.kart).ad}{s.adet > 1 ? ` ×${s.adet}` : ''}</span>
                    <span className="flex items-center gap-1 text-xs text-silik">
                      <Avatar uye={s.alici} boyut={14} /><span className="truncate">{s.alici.ad}</span><span className="shrink-0">· {tarih(s.zaman)}</span>
                    </span>
                  </span>
                  <Muz miktar={s.fiyat} boyut={13} className="shrink-0 text-sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </div>
  );
}
