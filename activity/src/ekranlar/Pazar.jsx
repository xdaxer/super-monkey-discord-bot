import {
  HandCoins, Handshake, Lock, Store, Tag,
} from 'lucide-react';
import { useState } from 'react';

import { EkranBaslik } from '@/components/Bolum.jsx';
import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { Button } from '@/components/ui/button.jsx';
import { SekmeIcerik, Sekmeler } from '@/components/ui/sekmeler.jsx';
import { useApi } from '@/lib/kancalar.js';
import { Hesabim } from './pazar/Hesabim.jsx';
import { IstekFormu } from './pazar/IstekFormu.jsx';
import { KartSayfasi } from './pazar/KartSayfasi.jsx';
import { SatisFormu } from './pazar/SatisFormu.jsx';
import { Vitrin } from './pazar/Vitrin.jsx';

/**
 * Topluluk pazarı (Steam Topluluk Pazarı gibi): üyeler kartlarını birim
 * fiyatla ilana koyar, başkaları alır. `secenek.kart`: o kartın sayfasıyla açılır
 * (envanterdeki "Pazarda gör").
 */
export default function Ekran({ secenek }) {
  const [sekme, setSekme] = useState(secenek?.sekme === 'hesabim' ? 'hesabim' : 'vitrin');
  const [kart, setKart] = useState(secenek?.kart ?? null);
  const [satis, setSatis] = useState({ acik: false, kimlik: null });
  const [istek, setIstek] = useState({ acik: false, kimlik: null });
  const vitrin = useApi('/api/pazar', { aralik: 20_000 });
  const benim = useApi('/api/pazar/benim');

  const tazele = () => { vitrin.yenile({ sessiz: true }); benim.yenile({ sessiz: true }); };
  const satisAc = (kimlik) => setSatis({ acik: true, kimlik });
  const istekAc = (kimlik) => setIstek({ acik: true, kimlik });
  const acikIlan = benim.veri ? benim.veri.ilanlar.length + benim.veri.istekler.length : vitrin.veri?.acikIlanim ?? 0;
  const kapali = vitrin.veri?.acik === false;

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik
        ikon={Handshake}
        baslik="Topluluk Pazarı"
        aciklama="Kartlarını başka üyelere sat, eksik kartlarını onlardan al."
        sag={(
          <div className="flex flex-wrap gap-2">
            <Button disabled={kapali} onClick={() => istekAc(null)}><HandCoins />Alım isteği</Button>
            <Button tur="ana" disabled={kapali} onClick={() => satisAc(null)}><Tag />Kart sat</Button>
          </div>
        )}
      />
      {kapali && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-turuncu/40 bg-turuncu/10 p-4 text-sm">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-turuncu" />
          <span>
            <span className="font-semibold">Pazar şu an kapalı.</span>
            {' '}
            Yönetici açana kadar ilan açılamaz ve satın alınamaz; ilanlarını kaldırabilirsin.
          </span>
        </div>
      )}
      {vitrin.hata && !vitrin.veri && <HataKutusu hata={vitrin.hata} tekrar={vitrin.yenile} />}
      {vitrin.yukleniyor && !vitrin.veri && <Yukleniyor satir={3} />}
      {vitrin.veri && (
        <Sekmeler
          deger={sekme}
          degisti={setSekme}
          liste={[
            { deger: 'vitrin', ad: 'Pazar', ikon: Store },
            { deger: 'hesabim', ad: acikIlan > 0 ? `İlan ve isteklerim (${acikIlan})` : 'İlan ve isteklerim', ikon: Tag },
          ]}
        >
          <SekmeIcerik deger="vitrin"><Vitrin veri={vitrin.veri} ac={setKart} /></SekmeIcerik>
          <SekmeIcerik deger="hesabim">
            <Hesabim veri={benim.veri} hata={benim.hata} yenile={tazele} ac={setKart} satisAc={satisAc} istekAc={istekAc} />
          </SekmeIcerik>
        </Sekmeler>
      )}
      <KartSayfasi
        kimlik={kart}
        kapat={() => setKart(null)}
        satisAc={(k) => { setKart(null); satisAc(k); }}
        istekAc={(k) => { setKart(null); istekAc(k); }}
        degisti={tazele}
      />
      <IstekFormu
        acik={istek.acik}
        baslangic={istek.kimlik}
        degisti={(a) => setIstek((s) => ({ ...s, acik: a }))}
        bitti={() => { tazele(); setSekme('hesabim'); }}
      />
      <SatisFormu
        acik={satis.acik}
        baslangic={satis.kimlik}
        degisti={(a) => setSatis((s) => ({ ...s, acik: a }))}
        bitti={() => { tazele(); setSekme('hesabim'); }}
      />
    </div>
  );
}
