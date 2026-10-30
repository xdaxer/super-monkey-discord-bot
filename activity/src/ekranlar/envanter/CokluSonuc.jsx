import { Sparkles, Target } from 'lucide-react';
import { useEffect } from 'react';

import { Muz } from '@/components/Muz.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { konfeti } from './konfeti.js';
import { GarantiYazisi } from './GarantiYazisi.jsx';
import { SonucKarti } from './SonucKarti.jsx';

/** Çoklu açılış: sonuç kartları sırayla belirir, en iyi önce. `r` = /api/kasa/ac yanıtı. */
export function CokluSonuc({ r, kapat }) {
  const sonuclar = r?.sonuclar ?? [];
  useEffect(() => {
    if (!r) return undefined;
    const en = r.sonuclar[0]?.nadirlik;
    const t = setTimeout(() => konfeti(en), 300);
    return () => clearTimeout(t);
  }, [r]);
  const muz = sonuclar.filter((s) => s.tur === 'muz').reduce((t, s) => t + s.miktar, 0);
  const yeni = sonuclar.filter((s) => s.yeniKart).length;
  const parlak = sonuclar.filter((s) => s.parlak).length;
  const garantili = sonuclar.filter((s) => s.garanti).length;
  return (
    <Pencere acik={Boolean(r)} degisti={(a) => { if (!a) kapat(); }} genis baslik={r ? `${sonuclar.length} × ${r.kasa.ad}` : ''} aciklama="En iyi ödüller önce">
      {r && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sonuclar.map((s, i) => <SonucKarti key={i} s={s} gecikme={Math.min(i * 0.09, 1.2)} />)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cizgi pt-4 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              {muz > 0 && <Muz miktar={muz} isaretli />}
              {yeni > 0 && <Rozet tur="yesil">{yeni} yeni kart</Rozet>}
              {parlak > 0 && <Rozet tur="muz"><Sparkles />{parlak} parlak</Rozet>}
              {garantili > 0 && <Rozet tur="mor"><Target />{garantili} garanti</Rozet>}
            </span>
            <span className="flex flex-wrap items-center gap-3 text-soluk">
              {r.garanti && <GarantiYazisi g={r.garanti} />}
              <span>Kalan: <span className="sayi text-metin">{r.kalan}</span> tane</span>
            </span>
          </div>
        </div>
      )}
    </Pencere>
  );
}
