import { Target, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EkranBaslik } from '@/components/Bolum.jsx';
import { Sekmeler, SekmeIcerik } from '@/components/ui/sekmeler.jsx';
import { BasarimlarSekmesi } from './gorevler/BasarimlarSekmesi.jsx';
import { GorevlerSekmesi } from './gorevler/GorevlerSekmesi.jsx';

const SEKMELER = [
  { deger: 'gorevler', ad: 'Görevler', ikon: Target },
  { deger: 'basarimlar', ad: 'Başarımlar', ikon: Trophy },
];

export default function Ekran({ secenek }) {
  const [sekme, setSekme] = useState(secenek?.sekme === 'basarimlar' ? 'basarimlar' : 'gorevler');
  useEffect(() => {
    if (secenek?.sekme) setSekme(secenek.sekme === 'basarimlar' ? 'basarimlar' : 'gorevler');
  }, [secenek]);
  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={Target} baslik="Görevler" aciklama="Günlük hedefler ve uzun vadeli ödüller" />
      <Sekmeler deger={sekme} degisti={setSekme} liste={SEKMELER}>
        <SekmeIcerik deger="gorevler"><GorevlerSekmesi /></SekmeIcerik>
        <SekmeIcerik deger="basarimlar"><BasarimlarSekmesi /></SekmeIcerik>
      </Sekmeler>
    </div>
  );
}
