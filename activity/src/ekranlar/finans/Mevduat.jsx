import { Lock, PiggyBank, Plus, Timer } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { GeriSayim, useSimdi } from '@/components/GeriSayim.jsx';
import { MiktarGirisi } from '@/components/MiktarGirisi.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { bicim, cn, tarih } from '@/lib/utils.js';
import { faizDegeri, miktarTahmin, VadeKartlari } from './ortak.jsx';

const ORNEK = 10_000;

/** Kilitli/tavan çubuğu ve aktif mevduat sayacı (5 parça). */
function Ozet({ v }) {
  const oran = v.tavan > 0 ? v.kilitli / v.tavan : 0;
  const kalan = Math.max(0, v.tavan - v.kilitli);
  return (
    <Kart className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-silik"><Lock className="size-3.5" />Kilitli tutar</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Muz miktar={v.kilitli} boyut={22} className="font-display text-2xl font-semibold" />
              <span className="sayi text-sm text-soluk">/ {bicim(v.tavan)}</span>
            </p>
          </div>
          <span className="sayi text-sm text-soluk">%{Math.round(oran * 100)}</span>
        </div>
        <Ilerleme oran={oran} yukseklik={10} renk={oran >= 1 ? 'var(--color-kirmizi)' : 'var(--color-muz)'} />
        <p className="text-xs text-silik">
          Tavan seviyenle artar ({bicim(v.tavanKurali.taban)} + {bicim(v.tavanKurali.seviyeBasina)} × seviye).
          {kalan > 0 ? ` ${bicim(kalan)} muz daha kilitleyebilirsin.` : ' Tavana ulaştın.'}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        <p className="text-xs font-medium uppercase tracking-wide text-silik">Aktif mevduat</p>
        <div className="flex items-center gap-3">
          <span className="sayi font-display text-3xl font-semibold leading-none">{v.aktifSayisi}<span className="text-lg text-soluk">/{v.aktifSiniri}</span></span>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: v.aktifSiniri }, (_, i) => (
              <span key={i} className={cn('h-6 w-2.5 rounded-full', i < v.aktifSayisi ? 'bg-muz' : 'bg-yuzey-3')} />
            ))}
          </div>
        </div>
      </div>
    </Kart>
  );
}

function YeniMevduat({ v, yenile }) {
  const [miktar, setMiktar] = useState('');
  const [vade, setVade] = useState('84sa');
  const [calistir, bekliyor] = useIslem();
  const bakiye = v.bakiye;
  const deger = miktarTahmin(miktar, bakiye);
  const secili = v.vadeler.find((x) => x.kimlik === vade) ?? v.vadeler[0];
  const dolu = v.aktifSayisi >= v.aktifSiniri;

  const onizleme = (x) => {
    const m = deger && deger > 0 ? deger : ORNEK;
    return { girdi: m, cikti: m + faizDegeri(m, x.yuzde), ornek: !(deger && deger > 0) };
  };

  let uyari = null;
  if (dolu) uyari = `Aynı anda en çok ${v.aktifSiniri} mevduatın olabilir.`;
  else if (deger !== null && deger < v.min) uyari = `En az ${bicim(v.min)} muz yatırabilirsin.`;
  else if (deger !== null && v.kilitli + deger > v.tavan) uyari = `Tavanı aşıyor: en çok ${bicim(Math.max(0, v.tavan - v.kilitli))} muz daha.`;
  else if (deger !== null && deger > bakiye) uyari = 'Bakiyen yetmiyor.';

  const yatir = () => calistir(async () => {
    const r = await api('/api/banka/yatir', { govde: { miktar, vade } });
    bildirimGoster(`**${bicim(r.mevduat.anapara)}** muz ${secili.ad} vadeyle kilitlendi. Vade sonunda **${bicim(r.vadeSonuTutar)}** alacaksın.`, 'basari');
    setMiktar('');
    await yenile({ sessiz: true });
  });

  return (
    <Kart>
      <KartBaslik ikon={Plus} baslik="Yeni mevduat" aciklama="Muzunu kilitle, vade sonunda faiziyle geri al." />
      <div className="flex flex-col gap-4">
        <MiktarGirisi deger={miktar} degisti={setMiktar} hizli={['1k', '5k', '10k', 'yarı', 'hepsi']} yer={`En az ${bicim(v.min)}: 5000, 2.5k, yarı`} onEnter={yatir} />
        <VadeKartlari vadeler={v.vadeler} secili={vade} degisti={setVade} onizleme={onizleme} />
        <div className="flex flex-col gap-2">
          <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} disabled={dolu || !miktar.trim() || Boolean(uyari)} onClick={yatir}>
            <PiggyBank />Yatır
          </Button>
          {uyari
            ? <p className="text-center text-xs text-kirmizi">{uyari}</p>
            : <p className="text-center text-xs text-silik">Vadesinden önce bozarsan faiz yok, anaparadan %{v.erkenCezaYuzde} ceza kesilir.</p>}
        </div>
      </div>
    </Kart>
  );
}

function MevduatSatiri({ m, v, yenile }) {
  const simdi = useSimdi(15_000);
  const [calistir, bekliyor] = useIslem();
  const oran = (simdi - m.baslangic) / Math.max(1, m.vade - m.baslangic);
  const ceza = Math.floor((m.anapara * v.erkenCezaYuzde) / 100);
  const sureAdi = v.vadeler.find((x) => x.yuzde === m.faizYuzde)?.ad;

  const boz = async () => {
    const evet = await onayIste({
      baslik: 'Mevduatı boz',
      metin: `Vadesinden önce bozarsan faiz alamazsın ve **${bicim(ceza)}** muz ceza kesilir. Hesabına **${bicim(m.anapara - ceza)}** muz geçer.`,
      evet: 'Boz',
      tehlikeli: true,
    });
    if (!evet) return;
    await calistir(async () => {
      const r = await api('/api/banka/boz', { govde: { id: m.id } });
      bildirimGoster(`Mevduat bozuldu: **${bicim(r.iade)}** muz iade, **${bicim(r.ceza)}** muz ceza.`, 'bilgi');
      await yenile({ sessiz: true });
    });
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="yuzey-kart flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Muz miktar={m.anapara} boyut={20} className="text-lg font-semibold" />
          <Rozet tur="muz">%{m.faizYuzde}{sureAdi ? ` · ${sureAdi}` : ''}</Rozet>
        </div>
        <Button tur="cizgili" boyut="sm" bekliyor={bekliyor} onClick={boz} className="text-kirmizi hover:text-kirmizi">Boz</Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Ilerleme oran={oran} yukseklik={6} />
        <div className="flex items-center justify-between gap-3 text-xs text-soluk">
          <span className="inline-flex items-center gap-1"><Timer className="size-3.5" /><GeriSayim hedef={m.vade} bitince="ödeniyor" onBitti={() => yenile({ sessiz: true })} className="sayi" /></span>
          <span className="sayi text-silik">{tarih(m.vade)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-cizgi pt-3 text-sm">
        <span className="text-soluk">Vade sonu</span>
        <span className="flex flex-wrap items-center justify-end gap-x-2">
          <Muz miktar={m.vadeSonuTutar} className="font-semibold" />
          <span className="sayi text-xs font-medium text-yesil">+{bicim(m.faiz)}</span>
        </span>
      </div>
    </motion.div>
  );
}

export default function Mevduat() {
  const {
    veri, hata, yukleniyor, yenile,
  } = useApi('/api/banka');
  const goruldu = useRef(new Set());

  useEffect(() => {
    for (const o of veri?.odenenler ?? []) {
      if (goruldu.current.has(o.id)) continue;
      goruldu.current.add(o.id);
      bildirimGoster(`Mevduatın vadesini doldurdu: **${bicim(o.anapara + o.faiz)}** muz hesabına geçti.`, 'basari');
    }
  }, [veri]);

  if (yukleniyor && !veri) {
    return <div className="flex flex-col gap-4"><Iskelet className="h-32" /><Iskelet className="h-80" /></div>;
  }
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;

  return (
    <div className="flex flex-col gap-4">
      <Ozet v={veri} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <YeniMevduat v={veri} yenile={yenile} />
        <div className="flex flex-col gap-3">
          <h3 className="px-1 text-[17px] font-semibold">Aktif mevduatlar</h3>
          {veri.aktif.length === 0 ? (
            <div className="yuzey-kart"><Bos ikon={PiggyBank} baslik="Henüz mevduatın yok" aciklama="Bir miktar ve vade seçip yatır; faiz vade sonunda hesabına geçer." /></div>
          ) : veri.aktif.map((m) => <MevduatSatiri key={m.id} m={m} v={veri} yenile={yenile} />)}
        </div>
      </div>
    </div>
  );
}
