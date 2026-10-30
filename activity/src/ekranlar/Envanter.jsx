import {
  Backpack, Layers, Package, WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { EkranBaslik } from '@/components/Bolum.jsx';
import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { SekmeIcerik, Sekmeler } from '@/components/ui/sekmeler.jsx';
import { useApi } from '@/lib/kancalar.js';
import { Kartlar } from './envanter/Kartlar.jsx';
import { Kasalar } from './envanter/Kasalar.jsx';
import { Ozet } from './envanter/Ozet.jsx';
import { Setler } from './envanter/Setler.jsx';

const SEKMELER = ['kasalar', 'kartlar', 'setler'];
const gecerli = (s) => (SEKMELER.includes(s) ? s : 'kasalar');

export default function Ekran({ secenek }) {
  const {
    veri, hata, yukleniyor, yenile,
  } = useApi('/api/envanter');
  const [sekme, setSekme] = useState(gecerli(secenek?.sekme));
  useEffect(() => { if (secenek?.sekme) setSekme(gecerli(secenek.sekme)); }, [secenek?.sekme]);

  if (yukleniyor && !veri) return <Yukleniyor />;
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;

  const kasaSayisi = veri.kasalar.reduce((t, k) => t + k.adet, 0);
  const liste = [
    { deger: 'kasalar', ad: 'Kasalar', ikon: Package, rozet: kasaSayisi > 0 ? <Rozet tur="muz" className="sayi">{kasaSayisi}</Rozet> : null },
    { deger: 'kartlar', ad: 'Kartlar', ikon: WalletCards },
    { deger: 'setler', ad: 'Setler', ikon: Layers },
  ];
  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={Backpack} baslik="Envanter" aciklama="Kasaların ve kart koleksiyonun." />
      <Ozet veri={veri} />
      <Sekmeler deger={sekme} degisti={setSekme} liste={liste}>
        <SekmeIcerik deger="kasalar"><Kasalar veri={veri} yenile={yenile} /></SekmeIcerik>
        <SekmeIcerik deger="kartlar"><Kartlar veri={veri} yenile={yenile} /></SekmeIcerik>
        <SekmeIcerik deger="setler"><Setler yenileEnvanter={yenile} /></SekmeIcerik>
      </Sekmeler>
    </div>
  );
}
