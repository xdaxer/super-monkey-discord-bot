import { List, ShoppingBag } from 'lucide-react';
import { useState } from 'react';

import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { Ipucu } from '@/components/ui/ipucu.jsx';
import { api } from '@/lib/api.js';
import { useIslem } from '@/lib/kancalar.js';
import { git } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';
import { AdetSecici } from '../magaza/AdetSecici.jsx';
import { GorselAlani } from '../magaza/UrunKarti.jsx';
import { KasaIcerikPenceresi } from '../magaza/KasaIcerik.jsx';
import { CokluSonuc } from './CokluSonuc.jsx';
import { KasaAcilis } from './KasaAcilis.jsx';

function KasaKarti({ k, tek, coklu, icerik }) {
  const enCok = Math.min(k.adet, 10);
  const [n, setN] = useState(enCok);
  const [calistir, bekliyor] = useIslem();
  const adet = Math.min(n, enCok);
  const bos = k.adet < 1;
  return (
    <div className={cn('yuzey-kart flex flex-col gap-4 p-5', bos && 'opacity-80')}>
      <GorselAlani g={k.gorsel}>
        <Rozet tur={bos ? 'notr' : 'muz'} className="absolute right-2.5 top-2.5"><span className="sayi">×{k.adet}</span></Rozet>
      </GorselAlani>
      <h3 className="text-base font-semibold leading-tight">{k.ad}</h3>
      <div className="mt-auto flex flex-col gap-3">
        {!bos && (
          <Button tur="ana" tam onClick={() => tek(k)}>Aç</Button>
        )}
        {k.adet > 1 && (
          <div className="flex items-center gap-2">
            <AdetSecici deger={adet} degisti={setN} min={2} max={enCok} />
            <Button tur="ikincil" className="flex-1" bekliyor={bekliyor} onClick={() => calistir(() => coklu(k, adet))}>×{adet} aç</Button>
          </div>
        )}
        {/* Ana (sarı) düğme yalnız açılabilecek kasada; boş kasada mağaza yolu ikincil. */}
        {bos && <Button tur="ikincil" tam onClick={() => git('magaza', { sekme: 'kasa' })}><ShoppingBag />Mağazadan al</Button>}
        <div className="flex items-center justify-between">
          <Button tur="hayalet" boyut="sm" onClick={() => icerik(k)}><List />İçerik</Button>
          {!bos && k.kimlik !== 'kasa-gunluk' && <Button tur="hayalet" boyut="sm" onClick={() => git('magaza', { sekme: 'kasa' })}>Mağazadan al</Button>}
        </div>
      </div>
    </div>
  );
}

export function Kasalar({ veri, yenile }) {
  const [tekKasa, setTekKasa] = useState(null);
  const [cokluSonuc, setCokluSonuc] = useState(null);
  const [icerik, setIcerik] = useState(null);

  const coklu = async (k, adet) => {
    const r = await api('/api/kasa/ac', { govde: { kasa: k.kimlik, adet } });
    setCokluSonuc(r);
    yenile({ sessiz: true });
  };
  const aktifEtkiler = veri.etkiler.filter((e) => e.bitis > Date.now());
  const digerVar = veri.rozetler.length > 0 || veri.seriKoruyucu > 0 || aktifEtkiler.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Elindeki kasalar önde; sıra kendi içinde korunur. */}
        {[...veri.kasalar].sort((a, b) => Number(b.adet > 0) - Number(a.adet > 0)).map((k) => <KasaKarti key={k.kimlik} k={k} tek={setTekKasa} coklu={coklu} icerik={(x) => setIcerik(x)} />)}
      </div>
      {digerVar && (
        <div className="yuzey-kart flex flex-col gap-4 p-5">
          <h3 className="text-[17px] font-semibold">Eşyalarım</h3>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {veri.rozetler.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-silik">Rozetler</span>
                {veri.rozetler.map((r) => <Ipucu key={r.kimlik} metin={r.ad}><span><Gorsel g={r.gorsel} boyut={28} /></span></Ipucu>)}
              </div>
            )}
            {veri.seriKoruyucu > 0 && <Rozet tur="mavi">Seri koruyucu ×{veri.seriKoruyucu}</Rozet>}
            {aktifEtkiler.map((e) => (
              <div key={e.kimlik} className="flex items-center gap-2 text-sm">
                <Gorsel g={e.gorsel} boyut={24} />
                <span className="font-medium">{e.ad}</span>
                <span className="text-soluk">kalan <GeriSayim hedef={e.bitis} bitince="bitti" className="sayi text-yesil" /></span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tekKasa && <KasaAcilis kasa={tekKasa} kapat={() => { setTekKasa(null); yenile({ sessiz: true }); }} />}
      <CokluSonuc r={cokluSonuc} kapat={() => setCokluSonuc(null)} />
      <KasaIcerikPenceresi kasa={icerik} degisti={setIcerik} />
    </div>
  );
}
