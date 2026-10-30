import { ChevronLeft, Dices } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';

import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { EkranBaslik } from '@/components/Bolum.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Md } from '@/components/Md.jsx';
import { Lobi } from './kumar/Lobi.jsx';
import { OYUNLAR } from './kumar/oyunlar.js';
import { useApi } from '@/lib/kancalar.js';
import { bicim, depo } from '@/lib/utils.js';

function OyunYukleniyor() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Iskelet className="h-96" />
      <Iskelet className="h-72" />
    </div>
  );
}

export default function Ekran({ secenek }) {
  const {
    veri, hata, yukleniyor, yenile,
  } = useApi('/api/kumar');
  const [oyun, setOyun] = useState(secenek?.oyun ?? undefined);
  const [bahis, setBahisMetni] = useState(() => depo.oku('kumar-bahis', '100'));
  const setBahis = (b) => { setBahisMetni(b); depo.yaz('kumar-bahis', b); };
  // Lobi ile oyun arasında geçişte yeni görünüm baştan başlar (lobinin kaydırması taşınmaz).
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [oyun]);

  if (yukleniyor && !veri) return <Yukleniyor />;
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;

  // İlk açılışta süren oyun varsa doğrudan oraya.
  const secili = oyun === undefined ? (veri.mines ? 'mines' : veri.blackjack ? 'blackjack' : null) : oyun;
  const tanim = OYUNLAR.find((o) => o.kimlik === secili);

  const lobiyeDon = () => { setOyun(null); yenile({ sessiz: true }); };

  if (!tanim) {
    return (
      <div className="flex flex-col gap-6">
        <EkranBaslik
          ikon={Dices}
          baslik="Kumarhane"
          aciklama={`Bahis tavanın ${bicim(veri.tavan)} muz, en az ${bicim(veri.min)}.`}
        />
        {veri.borclu && (
          <div className="rounded-2xl border border-kirmizi/30 bg-kirmizi/10 p-4 text-sm text-metin/90">
            <Md metin="Vadesi geçmiş kredi borcun var; ödeyene kadar kumar oynayamazsın. **Banka → Kredi**" />
          </div>
        )}
        <Lobi oyunlar={OYUNLAR} veri={veri} ac={setOyun} />
      </div>
    );
  }

  const Ikon = tanim.ikon;
  const Bilesen = tanim.Bilesen;
  return (
    <div className="flex flex-col gap-5">
      {/* Geri gezinme: başta, okla; eylem düğmesi gibi değil (HIG gezinme çubuğu). */}
      <div className="flex flex-col items-start gap-1">
        <Button tur="hayalet" boyut="sm" onClick={lobiyeDon} className="-ml-2 gap-1 px-2 text-muz hover:text-muz-acik [&_svg]:size-5"><ChevronLeft />Lobi</Button>
        <div className="flex items-center gap-2.5">
          <Ikon className="size-6 text-muz" />
          <h1 className="text-2xl font-bold leading-none sm:text-[28px]">{tanim.ad}</h1>
        </div>
      </div>
      <Suspense fallback={<OyunYukleniyor />}>
        <Bilesen key={tanim.kimlik} ctx={{ veri, bahis, setBahis }} />
      </Suspense>
    </div>
  );
}
