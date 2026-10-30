import { Clock, Minus, Plus, Ticket, Trophy } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { HataKutusu } from '@/components/Durumlar.jsx';
import { useSimdi } from '@/components/GeriSayim.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { bicim, tarih } from '@/lib/utils.js';
import { GeriBloklar } from './ortak.jsx';

const olasilikMetni = (n) => `%${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

/** Bilet görünümlü havuz kartı: sol yanda havuz, perfore kenardan sonra geri sayım. */
function BiletKarti({ v }) {
  const simdi = useSimdi();
  const delik = 'absolute z-10 size-6 rounded-full border border-cizgi bg-zemin';
  return (
    <div className="yuzey-kart relative flex flex-col overflow-hidden border-muz/30 shadow-parilti md:flex-row">
      <div className="flex flex-1 flex-col justify-center gap-2 p-6">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muz"><Ticket className="size-4" />Haftalık havuz</p>
        <Muz miktar={v.havuz} canli boyut={40} className="font-display text-5xl font-bold text-muz" />
        <p className="text-sm text-soluk">{bicim(v.toplamBilet)} bilet satıldı. Tek kazanan havuzun tamamını alır.</p>
      </div>
      <div className="relative border-t-2 border-dashed border-cizgi-guclu p-6 md:w-[360px] md:border-l-2 md:border-t-0">
        <span className={`${delik} -left-3 -top-3`} />
        <span className={`${delik} -right-3 -top-3 md:hidden`} />
        <span className={`${delik} -bottom-3 -left-3 hidden md:block`} />
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-silik"><Clock className="size-3.5" />Çekilişe kalan</p>
        <GeriBloklar kalan={v.cekilis - simdi} />
        <p className="mt-3 text-xs text-silik">{tarih(v.cekilis)}</p>
      </div>
    </div>
  );
}

function BiletAl({ v, yenile }) {
  const kalan = Math.max(0, v.kisiBasi - v.benim);
  const [adet, setAdet] = useState(1);
  const [calistir, bekliyor] = useIslem();
  const a = Math.max(1, Math.min(kalan, adet));
  const al = () => calistir(async () => {
    const r = await api('/api/piyango/bilet', { govde: { adet: a } });
    bildirimGoster(`**${r.adet}** bilet aldın. Bu hafta toplam **${r.benim}** biletin var; havuz **${bicim(r.havuz)}**.`, 'basari');
    setAdet(1);
    await yenile({ sessiz: true });
  });
  return (
    <Kart>
      <KartBaslik ikon={Ticket} baslik="Biletlerim" aciklama={`Bilet ${bicim(v.biletFiyati)} muz · havuzun %${v.havuzYuzde}'ı biletlerden, ${bicim(v.tabanIkramiye)} taban`} />
      <div className="flex items-end justify-between gap-3">
        <p className="sayi font-display text-3xl font-semibold leading-none">{v.benim}<span className="text-lg text-soluk">/{v.kisiBasi}</span></p>
        <div className="text-right">
          <p className="text-xs text-silik">Kazanma olasılığı</p>
          <p className="sayi font-display text-xl font-semibold text-muz">{olasilikMetni(v.olasilik)}</p>
        </div>
      </div>
      <Ilerleme oran={v.kisiBasi > 0 ? v.benim / v.kisiBasi : 0} className="mt-3" />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-cizgi bg-zemin/50 p-1">
          <Button tur="hayalet" boyut="ikon" aria-label="Azalt" disabled={a <= 1 || kalan === 0} onClick={() => setAdet(a - 1)}><Minus /></Button>
          <span className="sayi w-10 text-center text-lg font-semibold">{kalan === 0 ? 0 : a}</span>
          <Button tur="hayalet" boyut="ikon" aria-label="Artır" disabled={a >= kalan} onClick={() => setAdet(a + 1)}><Plus /></Button>
        </div>
        <Button tur="hayalet" boyut="sm" disabled={kalan === 0} onClick={() => setAdet(kalan)}>En çok</Button>
        <span className="ml-auto text-sm text-soluk">Tutar <Muz miktar={kalan === 0 ? 0 : a * v.biletFiyati} className="ml-1 text-metin" /></span>
      </div>
      <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} disabled={kalan === 0} onClick={al} className="mt-4"><Ticket />Bilet al</Button>
      <p className="mt-2 text-center text-xs text-silik">{kalan === 0 ? 'Bu hafta için bilet sınırına ulaştın.' : `Bu hafta en çok ${kalan} bilet daha alabilirsin.`}</p>
    </Kart>
  );
}

function SonKazanan({ son }) {
  return (
    <Kart>
      <KartBaslik ikon={Trophy} baslik="Son kazanan" />
      {son ? (
        <div className="flex items-center gap-3">
          <Avatar uye={son.uye} boyut={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold">{son.uye.ad}</p>
            <p className="text-xs text-silik">{tarih(son.cekilis)} çekilişi</p>
          </div>
          <Muz miktar={son.havuz} className="text-lg font-semibold text-muz" />
        </div>
      ) : <p className="text-sm text-soluk">Henüz çekiliş yapılmadı.</p>}
    </Kart>
  );
}

export default function Piyango() {
  const {
    veri, hata, yukleniyor, yenile,
  } = useApi('/api/piyango', { aralik: 30_000 });
  if (yukleniyor && !veri) return <div className="flex flex-col gap-4"><Iskelet className="h-44" /><Iskelet className="h-64" /></div>;
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  return (
    <div className="flex flex-col gap-4">
      <BiletKarti v={veri} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <BiletAl v={veri} yenile={yenile} />
        <SonKazanan son={veri.sonKazanan} />
      </div>
    </div>
  );
}
