import { Banknote, HandCoins, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { HataKutusu } from '@/components/Durumlar.jsx';
import { GeriSayim } from '@/components/GeriSayim.jsx';
import { MiktarGirisi } from '@/components/MiktarGirisi.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { bicim, cn, tarih } from '@/lib/utils.js';
import { faizDegeri, miktarTahmin, VadeKartlari, Satir } from './ortak.jsx';

const ORNEK = 5_000;

function YeniKredi({ v, yenile }) {
  const [miktar, setMiktar] = useState('');
  const [vade, setVade] = useState('7g');
  const [calistir, bekliyor] = useIslem();
  const deger = miktarTahmin(miktar, v.bakiye);
  const secili = v.vadeler.find((x) => x.kimlik === vade) ?? v.vadeler[0];
  const gecerli = deger && deger > 0;

  let uyari = null;
  if (v.seviye < v.minSeviye) uyari = `Kredi Sv ${v.minSeviye}'te açılır; sen Sv ${v.seviye}'sin.`;
  else if (deger !== null && deger < v.min) uyari = `En az ${bicim(v.min)} çekebilirsin.`;
  else if (deger !== null && deger > v.limit) uyari = `Limitin ${bicim(v.limit)} muz.`;

  const onizleme = (x) => {
    const m = gecerli ? deger : ORNEK;
    return { girdi: m, cikti: m + faizDegeri(m, x.yuzde), ornek: !gecerli };
  };

  const al = () => calistir(async () => {
    const r = await api('/api/kredi/al', { govde: { miktar, vade } });
    bildirimGoster(`Kredi verildi: **${bicim(r.kredi.anapara)}** muz hesabında. Vade sonunda **${bicim(r.odenecek)}** ödeyeceksin.`, 'basari');
    setMiktar('');
    await yenile({ sessiz: true });
  });

  return (
    <Kart>
      <KartBaslik
        ikon={HandCoins}
        baslik="Kredi çek"
        aciklama="Aynı anda tek kredi alabilirsin."
        sag={<Rozet tur="muz">Limit {bicim(v.limit)}</Rozet>}
      />
      <div className="flex flex-col gap-4">
        <MiktarGirisi deger={miktar} degisti={setMiktar} hizli={['1k', '2.5k', '5k', bicim(v.limit)]} yer={`En az ${bicim(v.min)}: 5000, 2.5k`} onEnter={al} />
        <VadeKartlari vadeler={v.vadeler} secili={vade} degisti={setVade} onizleme={onizleme} />
        {gecerli && !uyari && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-cizgi bg-zemin/40 p-3">
            <Satir etiket={`Faiz (%${secili.yuzde})`}><Muz miktar={faizDegeri(deger, secili.yuzde)} /></Satir>
            <Satir etiket="Geri ödeme" guclu><Muz miktar={deger + faizDegeri(deger, secili.yuzde)} /></Satir>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} disabled={!miktar.trim() || Boolean(uyari)} onClick={al}><Banknote />Kredi çek</Button>
          {uyari && <p className="text-center text-xs text-kirmizi">{uyari}</p>}
        </div>
      </div>
    </Kart>
  );
}

function Kurallar({ v }) {
  const k = v.kurallar;
  return (
    <Kart>
      <KartBaslik ikon={TriangleAlert} baslik="Nasıl işler?" />
      <ul className="flex flex-col gap-2.5 text-sm text-soluk">
        <li>Faiz vade sonunda bir kez anaparaya eklenir; vadeden önce ödersen yalnız geçen güne kadar faiz ödersin.</li>
        <li>Vade geçerse cüzdanından tahsil edilir, kalanı borç olur: gelirinin <b className="text-metin">%{k.borcKesintiYuzde}</b>&apos;i borca gider, kumar ve muz gönderme kapanır.</li>
        <li>Gecikmede her gün için <b className="text-metin">%{k.cezaGunlukYuzde}</b> ceza işler (en çok %{k.cezaTavanYuzde}).</li>
        <li>Kredi <b className="text-metin">Sv {v.minSeviye}</b>&apos;ten itibaren çekilebilir.</li>
        <li>Limit: {bicim(k.limitTaban)} + {bicim(k.limitSeviyeBasina)} × seviye (en çok {bicim(k.limitMaks)}).</li>
      </ul>
    </Kart>
  );
}

function AktifKredi({ v, yenile }) {
  const k = v.kredi;
  const o = k.borc;
  const [miktar, setMiktar] = useState('');
  const [calistir, bekliyor] = useIslem();
  const gec = o.gecikmis;
  const toplam = o.anapara + o.faiz + o.ceza;

  const ode = () => calistir(async () => {
    const bos = !miktar.trim();
    const r = await api('/api/kredi/ode', { govde: bos ? {} : { miktar } });
    bildirimGoster(r.kapandi ? `**${bicim(r.odenen)}** muz ödedin, borcun **kapandı**.` : `**${bicim(r.odenen)}** muz ödedin. Kalan borç: **${bicim(r.kalan)}**.`, 'basari');
    setMiktar('');
    await yenile({ sessiz: true });
  });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Kart className={cn(gec && 'border-kirmizi/40')}>
        <KartBaslik
          ikon={Banknote}
          baslik={`Kredi #${k.id}`}
          aciklama={`Faiz oranı %${k.faizYuzde} · vade ${tarih(k.vade)}`}
          sag={gec
            ? <Rozet tur="kirmizi">Vadesi geçti</Rozet>
            : <Rozet tur="notr"><GeriSayim hedef={k.vade} bitince="doldu" className="sayi" /></Rozet>}
        />
        {gec && (
          <div className="mb-4 flex gap-3 rounded-xl border border-kirmizi/30 bg-kirmizi/10 p-3 text-sm text-kirmizi">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p><b>Gecikmiş borcun var.</b> <span className="text-metin/85">Ödeyene kadar kumar oynayamaz, muz gönderemezsin; gelirinin yarısı otomatik borca gider.</span></p>
          </div>
        )}
        <p className="text-xs font-medium uppercase tracking-wide text-silik">{gec ? 'Kalan borç' : 'Şimdi ödersen'}</p>
        <Muz miktar={o.kalan} boyut={28} className={cn('mt-1 font-display text-4xl font-semibold', gec && 'text-kirmizi')} />
        <Ilerleme oran={toplam > 0 ? o.odenen / toplam : 0} yukseklik={6} className="mt-4" renk="var(--color-yesil)" />
        <div className="mt-4 flex flex-col gap-2 border-t border-cizgi pt-4">
          <Satir etiket="Anapara"><Muz miktar={o.anapara} /></Satir>
          <Satir etiket={gec ? 'Faiz' : 'İşleyen faiz'}><Muz miktar={o.faiz} /></Satir>
          {o.ceza > 0 && <Satir etiket="Gecikme cezası"><Muz miktar={o.ceza} className="text-kirmizi" /></Satir>}
          <Satir etiket="Ödenen"><Muz miktar={o.odenen} className="text-yesil" /></Satir>
        </div>
      </Kart>
      <div className="flex flex-col gap-4">
        <Kart>
          <KartBaslik ikon={HandCoins} baslik="Borç öde" aciklama="Miktar boşsa borcun hepsi ödenir." />
          <div className="flex flex-col gap-4">
            <MiktarGirisi deger={miktar} degisti={setMiktar} hizli={['1k', '5k', 'yarı', 'hepsi']} yer="Boşsa hepsi: 500, 2.5k, yarı" onEnter={ode} />
            <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} onClick={ode}>{miktar.trim() ? 'Öde' : 'Hepsini öde'}</Button>
          </div>
        </Kart>
        <Kurallar v={v} />
      </div>
    </div>
  );
}

export default function Kredi() {
  const {
    veri, hata, yukleniyor, yenile,
  } = useApi('/api/kredi');
  if (yukleniyor && !veri) return <div className="flex flex-col gap-4"><Iskelet className="h-80" /></div>;
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (veri.kredi) return <AktifKredi v={veri} yenile={yenile} />;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <YeniKredi v={veri} yenile={yenile} />
      <Kurallar v={veri} />
    </div>
  );
}
