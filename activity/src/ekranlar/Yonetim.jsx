import {
  BellRing, CalendarClock, ChartNoAxesColumn, ClipboardCheck, Clock, Handshake, Megaphone, ScrollText, Settings2, ShieldBan, ShieldCheck, ShoppingBag, Skull, Store, TicketPercent, Users,
} from 'lucide-react';
import { useState } from 'react';

import { EkranBaslik } from '@/components/Bolum.jsx';
import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { SekmeIcerik, Sekmeler } from '@/components/ui/sekmeler.jsx';
import { useApi } from '@/lib/kancalar.js';
import Bildirimler from './yonetim/Bildirimler.jsx';
import BossCagir from './yonetim/BossCagir.jsx';
import Etkinlikler from './yonetim/Etkinlikler.jsx';
import Genel from './yonetim/Genel.jsx';
import Grev from './yonetim/Grev.jsx';
import Hareketler from './yonetim/Hareketler.jsx';
import Kullanim from './yonetim/Kullanim.jsx';
import MagazaRolleri from './yonetim/MagazaRolleri.jsx';
import PazarYonetimi from './yonetim/PazarYonetimi.jsx';
import Promo from './yonetim/Promo.jsx';
import Satislar from './yonetim/Satislar.jsx';
import Sistem from './yonetim/Sistem.jsx';
import Uyeler from './yonetim/Uyeler.jsx';
import Uzaklastirma from './yonetim/Uzaklastirma.jsx';
import Yoklama from './yonetim/Yoklama.jsx';

const SEKMELER = [
  { deger: 'genel', ad: 'Genel bakış', ikon: ChartNoAxesColumn },
  { deger: 'hareketler', ad: 'Hareketler', ikon: ScrollText },
  { deger: 'uyeler', ad: 'Üyeler', ikon: Users },
  {
    deger: 'uzaklastirma', ad: 'Uzaklaştırma', ikon: ShieldBan, yeni: true,
  },
  {
    deger: 'satislar', ad: 'Satışlar', ikon: ShoppingBag, yeni: true,
  },
  {
    deger: 'pazar', ad: 'Pazar', ikon: Handshake, yeni: true,
  },
  {
    deger: 'promo', ad: 'Promo kodları', ikon: TicketPercent, yeni: true,
  },
  {
    deger: 'bildirim', ad: 'Bildirim gönder', ikon: BellRing, yeni: true,
  },
  { deger: 'kullanim', ad: 'Kullanım', ikon: Clock },
  { deger: 'etkinlik', ad: 'Etkinlikler', ikon: CalendarClock },
  { deger: 'boss', ad: 'Boss', ikon: Skull },
  { deger: 'grev', ad: 'Grev', ikon: Megaphone },
  {
    deger: 'yoklama', ad: 'Yoklama', ikon: ClipboardCheck, yeni: true,
  },
  { deger: 'magaza', ad: 'Mağaza', ikon: Store },
  { deger: 'sistem', ad: 'Sistem', ikon: Settings2 },
];

/** Yönetici paneli: yalnız Discord'da Yönetici izni olanlar görür (sunucu da denetler). */
export default function Ekran({ secenek }) {
  const [sekme, setSekme] = useState(SEKMELER.some((s) => s.deger === secenek?.sekme) ? secenek.sekme : 'genel');
  const { veri, hata, yukleniyor, yenile } = useApi('/api/yonetim');

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={ShieldCheck} baslik="Yönetim" aciklama="Ekonomiyi izle, üyelere muz ver, etkinlik ve boss başlat." />
      {hata && <HataKutusu hata={hata} tekrar={yenile} />}
      {yukleniyor && !veri && <Yukleniyor satir={2} />}
      {veri && (
        <Sekmeler deger={sekme} degisti={setSekme} liste={SEKMELER}>
          <SekmeIcerik deger="genel"><Genel veri={veri} /></SekmeIcerik>
          <SekmeIcerik deger="hareketler"><Hareketler /></SekmeIcerik>
          <SekmeIcerik deger="uyeler"><Uyeler /></SekmeIcerik>
          <SekmeIcerik deger="uzaklastirma"><Uzaklastirma /></SekmeIcerik>
          <SekmeIcerik deger="satislar"><Satislar /></SekmeIcerik>
          <SekmeIcerik deger="pazar"><PazarYonetimi /></SekmeIcerik>
          <SekmeIcerik deger="promo"><Promo /></SekmeIcerik>
          <SekmeIcerik deger="bildirim"><Bildirimler /></SekmeIcerik>
          <SekmeIcerik deger="kullanim"><Kullanim /></SekmeIcerik>
          <SekmeIcerik deger="etkinlik"><Etkinlikler veri={veri} yenile={() => yenile({ sessiz: true })} /></SekmeIcerik>
          <SekmeIcerik deger="boss"><BossCagir veri={veri} yenile={() => yenile({ sessiz: true })} /></SekmeIcerik>
          <SekmeIcerik deger="grev"><Grev /></SekmeIcerik>
          <SekmeIcerik deger="yoklama"><Yoklama /></SekmeIcerik>
          <SekmeIcerik deger="magaza"><MagazaRolleri veri={veri} yenile={() => yenile({ sessiz: true })} /></SekmeIcerik>
          <SekmeIcerik deger="sistem"><Sistem veri={veri} /></SekmeIcerik>
        </Sekmeler>
      )}
    </div>
  );
}
