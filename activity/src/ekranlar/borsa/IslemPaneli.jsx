import { TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { GeriSayim, useSimdi } from '@/components/GeriSayim.jsx';
import { MiktarGirisi } from '@/components/MiktarGirisi.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Kart } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { SekmeIcerik, Sekmeler } from '@/components/ui/sekmeler.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { bicim, cn } from '@/lib/utils.js';
import { miktarTahmin, Satir } from '../finans/ortak.jsx';

const etkiYuzdesi = (v) => `${v >= 0 ? '+' : '−'}%${Math.abs(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
/** Yüklü emirde bildirimin sonuna fiyatın nereye gittiği. */
const etkiMetni = (r) => (Math.abs(r.etkiYuzde) >= 0.5 ? ` Emrin fiyatı ${etkiYuzdesi(r.etkiYuzde)} oynattı (yeni fiyat ${bicim(r.yeniFiyat)}).` : '');

function Mod({ mod, degisti }) {
  return (
    <div className="inline-flex rounded-lg border border-cizgi bg-zemin/50 p-0.5 text-xs font-medium">
      {[['adet', 'Adet'], ['tutar', 'Tutar']].map(([d, ad]) => (
        <button key={d} type="button" onClick={() => degisti(d)} className={cn('rounded-md px-3 py-1 transition-colors', mod === d ? 'bg-yuzey-3 text-metin' : 'text-soluk hover:text-metin')}>{ad}</button>
      ))}
    </div>
  );
}

function Form({ yon, sirket, veri, bekleHedef, bekle, yenile }) {
  const [mod, setMod] = useState('adet');
  const [giris, setGiris] = useState('');
  const [calistir, bekliyor] = useIslem();
  const simdi = useSimdi();
  const cuzdan = useUygulama((s) => s.bakiye) ?? veri.bakiye;
  const poz = veri.portfoy.pozisyonlar.find((x) => x.sembol === sirket.sembol) ?? null;
  const sahip = poz?.adet ?? 0;
  const al = yon === 'al';
  const fiyat = sirket.fiyat ?? 0;
  const komisyon = (t) => Math.ceil((t * veri.komisyonYuzde) / 100);
  const beklemede = bekleHedef > simdi;

  // Emir etkisi (app/lib/hisse.js emirEtkisi ile aynı): büyük emir fiyatı kaydırır, ortalamadan dolar.
  const etkiHesapla = (a) => {
    const b = Math.min(veri.etkiSiniri, (a * fiyat) / sirket.derinlik);
    const etki = al ? b : -b;
    return { etki, ortalama: etki === 0 ? fiyat : (fiyat * Math.expm1(etki)) / etki };
  };
  const alimToplami = (a) => {
    const brut = Math.round(a * etkiHesapla(a).ortalama);
    return brut + komisyon(brut);
  };
  const tutardanAdet = (tutar) => {
    let alt = 0;
    let ust = Math.floor(tutar / Math.max(1, fiyat)) + 1;
    while (alt < ust) {
      const orta = Math.ceil((alt + ust) / 2);
      if (alimToplami(orta) <= tutar) alt = orta; else ust = orta - 1;
    }
    return alt;
  };

  // Önizleme: adet, brüt, komisyon, toplam.
  let on = null;
  let uyari = null;
  if (al && mod === 'adet') {
    const a = miktarTahmin(giris, 0);
    if (a && a > 0) on = { adet: a };
  } else if (al) {
    const t = miktarTahmin(giris, cuzdan);
    if (t && t > 0) {
      const a = tutardanAdet(t);
      if (a > 0) on = { adet: a }; else uyari = '1 hisseye yetmiyor.';
    }
  } else {
    const a = miktarTahmin(giris, sahip);
    if (a && a > 0) {
      if (a > sahip) uyari = `Yalnız ${bicim(sahip)} hissen var.`; else on = { adet: a };
    }
  }
  if (on) {
    const e = etkiHesapla(on.adet);
    on.ortalama = e.ortalama;
    on.etkiYuzde = Math.expm1(e.etki) * 100;
    on.brut = Math.round(on.adet * e.ortalama);
    on.komisyon = komisyon(on.brut);
    on.toplam = al ? on.brut + on.komisyon : on.brut - on.komisyon;
    if (!al) {
      const maliyet = on.adet === sahip ? poz.maliyet : Math.floor((poz.maliyet * on.adet) / sahip);
      on.kar = on.toplam - maliyet;
    }
    if (al && on.toplam > cuzdan) uyari = 'Bakiyen yetmiyor.';
  }

  const gonder = () => calistir(async () => {
    if (al) {
      let govde;
      if (mod === 'adet') {
        const a = miktarTahmin(giris, 0);
        if (!a || a < 1) throw new Error('Kaç hisse alacağını yaz (örnek: 10).');
        govde = { sembol: sirket.sembol, adet: a };
      } else govde = { sembol: sirket.sembol, tutar: giris };
      const r = await api('/api/hisse/al', { govde });
      bildirimGoster(`**${bicim(r.adet)} ${sirket.sembol}** alındı: ortalama ${bicim(r.fiyat)} × ${bicim(r.adet)} + ${bicim(r.komisyon)} komisyon = **${bicim(r.toplam)}** muz.${etkiMetni(r)}`, 'basari');
    } else {
      const r = await api('/api/hisse/sat', { govde: { sembol: sirket.sembol, adet: giris } });
      bildirimGoster(`**${bicim(r.adet)} ${sirket.sembol}** satıldı: **${bicim(r.gelir)}** muz (${r.kar >= 0 ? '+' : '−'}${bicim(Math.abs(r.kar))} kâr/zarar).${etkiMetni(r)}`, r.kar >= 0 ? 'basari' : 'bilgi');
    }
    setGiris('');
    bekle(Date.now() + veri.beklemeMs);
    await yenile({ sessiz: true });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-soluk">Elindeki: <b className="sayi text-metin">{bicim(sahip)}</b> adet</span>
        {al && <Mod mod={mod} degisti={(m) => { setMod(m); setGiris(''); }} />}
      </div>
      <MiktarGirisi
        deger={giris}
        degisti={setGiris}
        onEnter={gonder}
        hizli={al ? (mod === 'adet' ? ['1', '10', '100', '1k'] : ['1k', '5k', 'yarı', 'hepsi']) : ['1', '10', 'yarı', 'hepsi']}
        yer={al ? (mod === 'adet' ? 'Kaç hisse: 10, 1k' : 'Ne kadar muz: 5000, yarı') : 'Kaç hisse: 50, yarı, hepsi'}
      />
      <div className="flex flex-col gap-1.5 rounded-xl border border-cizgi bg-zemin/40 p-3">
        <Satir etiket="Fiyat"><Muz miktar={fiyat} /></Satir>
        <Satir etiket="Adet">{on ? bicim(on.adet) : '—'}</Satir>
        <Satir etiket="Ortalama dolum">{on ? <Muz miktar={Math.round(on.ortalama)} /> : '—'}</Satir>
        <Satir etiket="Fiyat etkisi">{on ? <span className={cn('sayi', Math.abs(on.etkiYuzde) >= 1 && (al ? 'text-yesil' : 'text-kirmizi'))}>{etkiYuzdesi(on.etkiYuzde)}</span> : '—'}</Satir>
        <Satir etiket={`Komisyon (%${veri.komisyonYuzde})`}>{on ? <Muz miktar={on.komisyon} /> : '—'}</Satir>
        <div className="my-0.5 border-t border-cizgi" />
        <Satir etiket={al ? 'Toplam' : 'Gelir'} guclu>{on ? <Muz miktar={on.toplam} /> : '—'}</Satir>
        {on && !al && (
          <Satir etiket="Kâr / zarar"><Muz miktar={on.kar} isaretli /></Satir>
        )}
      </div>
      <Button tur={al ? 'basari' : 'tehlike'} boyut="lg" tam bekliyor={bekliyor} disabled={!giris.trim() || Boolean(uyari) || beklemede} onClick={gonder}>
        {al ? <TrendingUp /> : <TrendingDown />}{sirket.sembol} {al ? 'al' : 'sat'}
      </Button>
      <p className={cn('min-h-4 text-center text-xs', uyari ? 'text-kirmizi' : 'text-silik')}>
        {uyari ?? (beklemede
          ? <>İşlem beklemesi: <GeriSayim hedef={bekleHedef} bitince="hazır" className="sayi text-soluk" /></>
          : `Her işlemden sonra ${Math.round(veri.beklemeMs / 1000)} sn beklenir.`)}
      </p>
    </div>
  );
}

export default function IslemPaneli({ sirket, veri, yenile }) {
  const [yon, setYon] = useState('al');
  const baslangic = useMemo(() => Date.now() + (veri.beklemeKalanMs ?? 0), [veri]);
  const [yerel, setYerel] = useState(0);
  const bekleHedef = Math.max(baslangic, yerel);
  return (
    <Kart>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-[17px] font-semibold">Al / Sat</h3>
        <Rozet>En çok {bicim(veri.kisiBasiAdet)} adet</Rozet>
      </div>
      <Sekmeler deger={yon} degisti={setYon} listeSinifi="w-full sm:w-full [&>button]:flex-1 [&>button]:justify-center" liste={[{ deger: 'al', ad: 'Al', ikon: TrendingUp }, { deger: 'sat', ad: 'Sat', ikon: TrendingDown }]}>
        <SekmeIcerik deger="al"><Form yon="al" sirket={sirket} veri={veri} bekleHedef={bekleHedef} bekle={setYerel} yenile={yenile} /></SekmeIcerik>
        <SekmeIcerik deger="sat"><Form yon="sat" sirket={sirket} veri={veri} bekleHedef={bekleHedef} bekle={setYerel} yenile={yenile} /></SekmeIcerik>
      </Sekmeler>
    </Kart>
  );
}
