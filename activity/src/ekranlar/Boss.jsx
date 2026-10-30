import { CalendarClock, Crosshair, Gift, Moon, Skull, Swords, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { EkranBaslik, Istatistik } from '@/components/Bolum.jsx';
import { HataKutusu } from '@/components/Durumlar.jsx';
import { useSimdi } from '@/components/GeriSayim.jsx';
import { Muz } from '@/components/Muz.jsx';
import { olayGoruldu } from '@/components/OlayPenceresi.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi } from '@/lib/kancalar.js';
import { git, nesne } from '@/lib/store.js';
import { bicim, tarih } from '@/lib/utils.js';
import { GeriBloklar } from './finans/ortak.jsx';
import Sahne from './boss/Sahne.jsx';
import Siralama from './boss/Siralama.jsx';
import { konfetiPatlat } from './prestij/konfeti.js';

function Yok({ veri }) {
  const simdi = useSimdi();
  const ozellikler = [
    [Moon, 'Haftalık çıkış', "Her Cumartesi 20:00'de yeni bir boss çıkar ve 48 saat kalır."],
    [Zap, 'Kart gücü', 'Envanterindeki en değerli kartlar hasarını artırır.'],
    [Gift, 'Ödüller', 'Boss yenilirse katılan herkes 1.000 muz + vurduğu hasarın 2 katı muz alır; üstüne kasa.'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <Kart className="flex flex-col items-center gap-5 py-9 text-center">
        <div className="grid size-16 place-items-center rounded-2xl border border-cizgi bg-yuzey-3 text-silik"><Skull className="size-8" /></div>
        <div>
          <h2 className="text-2xl font-bold">Şu an aktif boss yok</h2>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-soluk"><CalendarClock className="size-4" />Sıradaki boss: {tarih(veri.sonrakiCikis)}</p>
        </div>
        <GeriBloklar kalan={veri.sonrakiCikis - simdi} className="w-full max-w-md" />
      </Kart>
      <div className="grid gap-4 md:grid-cols-3">
        {ozellikler.map(([Ikon, b, a]) => (
          <div key={b} className="yuzey-kart flex flex-col gap-2 p-5">
            <Ikon className="size-5 text-muz" />
            <p className="font-display font-semibold">{b}</p>
            <p className="text-sm text-soluk">{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sonuc({ r, kapat }) {
  const yenildi = r.durum === 'yenildi';
  const o = r.odul;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="yuzey-kart flex flex-col items-center gap-3 border-muz/50 p-6 text-center shadow-parilti">
      <h3 className="text-2xl font-bold">{yenildi ? 'Boss yenildi!' : 'Boss kaçtı'}</h3>
      {r.sonVurus && <p className="flex items-center gap-1.5 font-medium text-muz"><Crosshair className="size-4" />Son vuruşu sen yaptın!</p>}
      {o && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-soluk">
          <span>Ödülün:</span><Muz miktar={o.muz} isaretli className="font-semibold" /><span>· {o.sira}. sıra</span>
          {o.kasalar?.length > 0 && <span>· Kasalar: {o.kasalar.map((k) => nesne(k)?.ad ?? k).join(', ')}</span>}
        </div>
      )}
      <Button tur="ikincil" boyut="sm" onClick={kapat}>Tamam</Button>
    </motion.div>
  );
}

export default function Ekran() {
  const {
    veri, hata, yukleniyor, yenile, setVeri,
  } = useApi('/api/boss', { aralik: 15_000 });
  const [sonuc, setSonuc] = useState(null);

  if (yukleniyor && !veri) {
    return <div className="flex flex-col gap-5"><EkranBaslik ikon={Skull} baslik="Boss" /><Iskelet className="h-96" /><Iskelet className="h-48" /></div>;
  }
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;

  const bitti = (r) => {
    // Sonucu burada gördü; bildirim penceresi aynı sonucu bir daha açmasın.
    if (veri.id) olayGoruldu(`boss-sonuc-${veri.id}`);
    setSonuc(r);
    if (r.durum === 'yenildi') konfetiPatlat(true);
    bildirimGoster(r.durum === 'yenildi' ? '**Boss yenildi!** Ödüllerin hesabına geçti.' : '**Boss kaçtı.**', 'basarim');
  };

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={Skull} baslik="Boss" aciklama="Herkes birlikte vurur; ne kadar vurursan o kadar muz." />
      {sonuc && <Sonuc r={sonuc} kapat={() => setSonuc(null)} />}
      {!veri.aktif ? <Yok veri={veri} /> : (
        <>
          <Sahne veri={veri} setVeri={setVeri} yenile={yenile} bitti={bitti} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Kart>
              <KartBaslik
                ikon={Swords}
                baslik="Gücün"
                aciklama={`Hasar ≈ ${bicim(100 + veri.guc)} (±%15, %10 ihtimalle kritik ×2)`}
                sag={<Button tur="ikincil" boyut="sm" onClick={() => git('envanter')}>Kartlarım</Button>}
              />
              <div className="grid grid-cols-2 gap-3">
                <Istatistik etiket="Kart gücü" deger={`+${bicim(veri.guc)}`} alt="En iyi 5 farklı kart" />
                <Istatistik etiket="Hasarım" deger={veri.ben.hasar > 0 ? bicim(veri.ben.hasar) : '—'} alt={`${bicim(veri.ben.saldiri)} saldırı`} />
                <Istatistik etiket="Sıram" deger={veri.ben.sira ? `${veri.ben.sira}. / ${veri.ben.katilimci}` : '—'} />
                <Istatistik etiket="Bekleme" deger={`${Math.round(veri.bekleme / 3_600_000)} saat`} alt="Saldırılar arası" />
              </div>
            </Kart>
            <Siralama veri={veri} />
          </div>
        </>
      )}
    </div>
  );
}
