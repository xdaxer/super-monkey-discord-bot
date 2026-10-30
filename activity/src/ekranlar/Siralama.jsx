import {
  Coins, Flame, Landmark, Layers, Star, Dices, TrendingUp, Trophy,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { EkranBaslik } from '@/components/Bolum.jsx';
import { Bos, HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { Md } from '@/components/Md.jsx';
import { Sekmeler } from '@/components/ui/sekmeler.jsx';
import { useApi } from '@/lib/kancalar.js';
import { cn, tarih } from '@/lib/utils.js';
import { Podyum } from './siralama/Podyum.jsx';

const IKON = {
  muz: Coins, toplam: Landmark, seviye: TrendingUp, koleksiyon: Layers, seri: Flame, prestij: Star, kumar: Dices,
};

/** Darda ad ve değer alt alta (uzun değer adı kesmesin), genişte yan yana. */
function Satir({ s }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', s.ben ? 'border border-muz/35 bg-muz/[0.08]' : 'border border-transparent')}>
      <span className="sayi w-8 shrink-0 text-center text-sm font-semibold text-silik">#{s.sira}</span>
      <Avatar uye={s.uye} boyut={36} />
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
        <span className={cn('min-w-0 truncate font-medium sm:flex-1', s.ben && 'text-muz')}>{s.uye.ad}{s.ben ? ' (sen)' : ''}</span>
        <span className="sayi text-[13px] text-soluk sm:shrink-0 sm:text-sm"><Md metin={s.degerMetni.replaceAll('**', '')} /></span>
      </div>
    </li>
  );
}

export default function Ekran() {
  const [tur, setTur] = useState('muz');
  const [turler, setTurler] = useState(null);
  const { veri, hata, yukleniyor, yenile } = useApi(`/api/siralama?tur=${encodeURIComponent(tur)}`);
  if (veri && !turler) setTurler(veri.turler);

  const liste = (turler ?? [{ kimlik: 'muz', ad: 'Muz' }]).map((t) => ({ deger: t.kimlik, ad: t.ad, ikon: IKON[t.kimlik] ?? Trophy }));
  const guncel = veri?.tur === tur ? veri : null;
  const ilk3 = guncel?.satirlar.filter((s) => s.sira <= 3) ?? [];
  const geri = guncel?.satirlar.filter((s) => s.sira > 3) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={Trophy} baslik="Sıralama" aciklama="Sunucunun en iyileri" />
      <Sekmeler deger={tur} degisti={setTur} liste={liste} className="gap-5" listeSinifi="sm:max-w-full">
        {hata && !guncel && <HataKutusu hata={hata} tekrar={() => yenile()} />}
        {!hata && !guncel && yukleniyor && <Yukleniyor satir={1} />}
        {guncel && (
          guncel.satirlar.length === 0
            ? <Bos ikon={Trophy} baslik="Henüz kimse yok" aciklama={<Md metin={guncel.bos} />} />
            : (
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                <p className="text-sm text-soluk first-letter:uppercase">{guncel.baslik}</p>
                <Podyum satirlar={ilk3} />
                {(geri.length > 0 || guncel.kendi) && (
                  <ul className="yuzey-kart flex flex-col gap-0.5 p-2">
                    {geri.map((s) => <Satir key={s.sira} s={s} />)}
                    {guncel.kendi && guncel.kendi.sira > guncel.satirlar.length && (
                      <>
                        <li className="py-1 text-center text-silik" aria-hidden="true">···</li>
                        <Satir s={guncel.kendi} />
                      </>
                    )}
                  </ul>
                )}
                {guncel.haftaBaslangic && (
                  <p className="text-xs text-silik">{tarih(guncel.haftaBaslangic)} tarihinden (Pazartesi 00:00) beri bahis ve kumar kazancı farkı; kasa ödülleri sayılmaz.</p>
                )}
              </div>
            )
        )}
      </Sekmeler>
    </div>
  );
}
