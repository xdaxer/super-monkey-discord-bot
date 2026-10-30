import { Landmark, PiggyBank, Ticket, HandCoins } from 'lucide-react';
import { useState } from 'react';

import { EkranBaslik } from '@/components/Bolum.jsx';
import { SekmeIcerik, Sekmeler } from '@/components/ui/sekmeler.jsx';
import Kredi from './finans/Kredi.jsx';
import Mevduat from './finans/Mevduat.jsx';
import Piyango from './finans/Piyango.jsx';

const SEKMELER = [
  { deger: 'mevduat', ad: 'Mevduat', ikon: PiggyBank },
  { deger: 'kredi', ad: 'Kredi', ikon: HandCoins },
  { deger: 'piyango', ad: 'Piyango', ikon: Ticket },
];

export default function Ekran({ secenek }) {
  const [sekme, setSekme] = useState(SEKMELER.some((s) => s.deger === secenek?.sekme) ? secenek.sekme : 'mevduat');
  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={Landmark} baslik="Banka" aciklama="Mevduat, kredi ve haftalık piyango." />
      <Sekmeler deger={sekme} degisti={setSekme} liste={SEKMELER}>
        <SekmeIcerik deger="mevduat"><Mevduat /></SekmeIcerik>
        <SekmeIcerik deger="kredi"><Kredi /></SekmeIcerik>
        <SekmeIcerik deger="piyango"><Piyango /></SekmeIcerik>
      </Sekmeler>
    </div>
  );
}
