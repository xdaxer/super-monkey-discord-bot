import { CircleCheck, Flame, Gift } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';
import {
  carpanSatirlari, KasaEtiketi, konfeti, Sayac, SeriIzi, seriDolu,
} from './ortak.jsx';

/** Günlük ödül: alınabiliyorsa tek büyük eylem; alınınca kutlama; alındıysa geri sayım. */
export function GunlukKart({ o, yenile }) {
  const para = useUygulama((s) => s.katalog?.para);
  const [sonuc, setSonuc] = useState(null);
  const [yerel, setYerel] = useState(null);
  const [calistir, bekliyor] = useIslem();

  const alindi = Boolean(yerel) || o.gunlukAlindi;
  const sonrakiGun = yerel?.sonrakiGunMs ?? o.sonrakiGunMs;
  const seri = yerel?.seri ?? o.seri;

  const al = () => calistir(async () => {
    const r = await api('/api/gunluk', { govde: {} });
    if (!r.verildi) {
      setYerel({ sonrakiGunMs: r.sonrakiGunMs, seri: o.seri });
      bildirimGoster('Bugünkü günlük ödülünü zaten almışsın.', 'bilgi');
      return;
    }
    setYerel({ sonrakiGunMs: r.sonrakiGunMs, seri: r.seri });
    setSonuc(r);
    konfeti();
    yenile();
  });

  const bitti = () => {
    setYerel(null);
    setSonuc(null);
    yenile();
  };

  const rozet = seri > 0 && (
    <Rozet tur="muz"><Flame />Seri {seri}</Rozet>
  );

  if (sonuc) {
    const satirlar = carpanSatirlari(sonuc);
    return (
      <Kart vurgu className="flex flex-col gap-4">
        <KartBaslik
          ikon={Gift}
          baslik={sonuc.haftalik ? 'Haftalık çift ödül' : 'Günlük ödül alındı'}
          aciklama={sonuc.haftalik ? 'Seri 7. güne ulaştı.' : `${sonuc.seri}. gün serisi`}
          className="mb-0"
        />
        <div className="flex items-center justify-center gap-2.5 py-1 text-yesil">
          <Gorsel g={para} boyut={40} />
          <span className="sayi text-4xl font-semibold">
            +<Sayac hedef={sonuc.toplam} />
          </span>
        </div>
        <motion.dl
          initial="gizli"
          animate="goster"
          variants={{ goster: { transition: { staggerChildren: 0.08, delayChildren: 0.5 } } }}
          className="flex flex-col divide-y divide-cizgi rounded-xl border border-cizgi bg-zemin/40 px-3.5 text-sm"
        >
          <Satir etiket="Taban" deger={<Muz miktar={sonuc.taban} boyut={14} />} />
          {satirlar.map(([e, d, ton]) => (
            <Satir key={e} etiket={e} deger={d} ton={ton} />
          ))}
        </motion.dl>
        <div className="flex flex-col gap-2">
          <SeriIzi dolu={seriDolu(sonuc.seri)} />
          <p className="text-xs text-soluk">
            {sonuc.haftalik ? 'Seri sürüyor, yarın yeni hafta başlıyor.' : `Çift ödüle ${sonuc.kalanGun} gün kaldı.`}
          </p>
        </div>
        {sonuc.kasalar.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {sonuc.kasalar.map((k, i) => (
              <motion.span
                key={`${k.kimlik}-${i}`}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.1 + i * 0.2, type: 'spring', stiffness: 260, damping: 16 }}
              >
                <KasaEtiketi kasa={k} />
              </motion.span>
            ))}
            <span className="text-xs text-soluk">envanterine eklendi</span>
          </div>
        )}
        <Button tur="ana" tam onClick={() => { setSonuc(null); }}>Tamam</Button>
      </Kart>
    );
  }

  if (alindi) {
    return (
      <Kart className="flex flex-col gap-4">
        <KartBaslik ikon={Gift} baslik="Günlük ödül" aciklama="Her gün gece yarısı yenilenir" sag={rozet || null} className="mb-0" />
        <div className="flex items-center gap-3 rounded-xl border border-cizgi bg-zemin/40 p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-yesil/12 text-yesil"><CircleCheck className="size-5" /></div>
          <div className="min-w-0">
            <p className="font-medium">Bugünkü ödülünü aldın</p>
            <p className="text-sm text-soluk">
              Yenisi <GeriSayim hedef={sonrakiGun} bitince="hazır" onBitti={bitti} className="sayi font-medium text-metin" /> sonra
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SeriIzi dolu={seriDolu(seri)} />
          <p className="text-xs text-silik">7. günde ödül ikiye katlanır ve Ahşap Kasa gelir.</p>
        </div>
      </Kart>
    );
  }

  return (
    <Kart vurgu className="flex flex-col gap-4">
      <KartBaslik ikon={Gift} baslik="Günlük ödül" aciklama={seri > 0 ? `Serin ${seri} gün; bugün alırsan ${seri + 1}. güne çıkar.` : 'Her gün al, serin büyüsün.'} sag={rozet || null} className="mb-0" />
      <div className="flex flex-col gap-2">
        <SeriIzi dolu={seriDolu(seri)} />
        <p className="text-xs text-silik">7. günde ödül ikiye katlanır ve Ahşap Kasa gelir.</p>
      </div>
      <div className="relative mt-auto">
        <div className="pointer-events-none absolute -inset-1 animate-parla rounded-2xl bg-muz/25 blur-xl" aria-hidden="true" />
        <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} onClick={al} className="relative h-14 text-base font-semibold">
          <Gift className="!size-5" />Günlük ödülü al
        </Button>
      </div>
    </Kart>
  );
}

function Satir({ etiket, deger, ton }) {
  return (
    <motion.div
      variants={{ gizli: { opacity: 0, y: 6 }, goster: { opacity: 1, y: 0 } }}
      className="flex items-center justify-between gap-3 py-2"
    >
      <dt className="text-soluk">{etiket}</dt>
      <dd className={cn('sayi font-medium', ton === 'kirmizi' && 'text-kirmizi')}>{deger}</dd>
    </motion.div>
  );
}
