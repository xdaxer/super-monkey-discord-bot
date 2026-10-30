import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { useApi } from '@/lib/kancalar.js';
import { CalisKart } from './ana/CalisKart.jsx';
import { GonderKart } from './ana/GonderKart.jsx';
import { GunlukKart } from './ana/GunlukKart.jsx';
import { Kahraman } from './ana/Kahraman.jsx';
import { PromoKart } from './ana/PromoKart.jsx';
import {
  BorcUyarisi, KartlarKart, KasaHatirlatma, RozetKart, TakviyeKart,
} from './ana/Vitrin.jsx';

/** Cüzdan: profil, günlük ödül, çalış, muz gönder ve vitrin. */
export default function Ekran() {
  const { veri, hata, yukleniyor, yenile } = useApi('/api/ozet');
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={() => yenile()} />;
  if (yukleniyor && !veri) return <Yukleniyor />;
  const sessiz = () => yenile({ sessiz: true });
  return (
    <div className="flex flex-col gap-4">
      <Kahraman o={veri} />
      <BorcUyarisi borc={veri.borc} />
      <KasaHatirlatma adet={veri.acilmamisKasa} />
      {/* Çalış asıl gelir: en üstte, tam genişlikte. */}
      <CalisKart o={veri} yenile={sessiz} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <GunlukKart o={veri} yenile={sessiz} />
        <GonderKart o={veri} yenile={sessiz} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <RozetKart rozetler={veri.rozetler} bonus={veri.rozetBonus} />
        <TakviyeKart o={veri} />
      </div>
      <KartlarKart profil={veri.profil} />
      <PromoKart yenile={sessiz} />
    </div>
  );
}
