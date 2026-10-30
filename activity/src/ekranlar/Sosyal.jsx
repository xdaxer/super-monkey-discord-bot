import { Handshake, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EkranBaslik } from '@/components/Bolum.jsx';
import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { Sekmeler, SekmeIcerik } from '@/components/ui/sekmeler.jsx';
import { DuelloSekmesi } from './sosyal/Duello.jsx';
import { useSosyal } from './sosyal/kancalar.js';
import { TakasSekmesi } from './sosyal/Takas.jsx';

/** Düello ve takas: kayıtlar Discord'daki `/duello` ve `/takas` ile ortaktır. */
export default function Ekran({ secenek }) {
  const [sekme, setSekme] = useState(secenek?.sekme === 'takas' ? 'takas' : 'duello');
  const {
    veri, gecmis, hata, yenile, beklet,
  } = useSosyal();
  // Davet penceresinden ya da komuttan gelindiyse sekmeye geç ve listeyi tazele (yeni davet görünsün).
  useEffect(() => {
    if (!secenek?.sekme) return;
    setSekme(secenek.sekme === 'takas' ? 'takas' : 'duello');
    yenile();
  }, [secenek]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!veri) return <Yukleniyor />;

  const adet = (n) => (n > 0 ? <Rozet tur="kirmizi" className="px-1.5">{n}</Rozet> : null);
  const liste = [
    { deger: 'duello', ad: 'Düello', ikon: Swords, rozet: adet(veri.duello.gelen.length) },
    { deger: 'takas', ad: 'Takas', ikon: Handshake, rozet: adet(veri.takas.gelen.length) },
  ];
  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={Swords} baslik="Düello ve takas" aciklama="Üyelerle bahse gir ya da eşya takas et" />
      <Sekmeler deger={sekme} degisti={setSekme} liste={liste}>
        <SekmeIcerik deger="duello" forceMount hidden={sekme !== 'duello'}>
          <DuelloSekmesi veri={veri} gecmis={gecmis} yenile={yenile} beklet={beklet} />
        </SekmeIcerik>
        <SekmeIcerik deger="takas"><TakasSekmesi veri={veri} gecmis={gecmis} yenile={yenile} /></SekmeIcerik>
      </Sekmeler>
    </div>
  );
}
