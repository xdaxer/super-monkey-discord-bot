import {
  ChartLine, HandCoins, History, ShoppingCart, Tag,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ipucu } from '@/components/ui/ipucu.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { bicim, cn, tarih } from '@/lib/utils.js';
import { AdetSecici } from '../magaza/AdetSecici.jsx';
import { FiyatGrafigi, kartBilgisi, KartKaresi } from './ortak.jsx';

const baslikSinifi = 'mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-silik';

/** Tek ilan satırı: satıcı, kalan adet, birim fiyat ve satın al. */
function IlanSatiri({
  ilan, kimlik, sonra, oncelikli,
}) {
  const bakiye = useUygulama((s) => s.bakiye);
  const [adet, setAdet] = useState(1);
  const [calistir, bekliyor] = useIslem();
  const toplam = ilan.fiyat * adet;
  const yetmez = typeof bakiye === 'number' && bakiye < toplam;
  const k = kartBilgisi(kimlik);

  const al = () => calistir(async () => {
    if (!await onayIste({
      baslik: 'Satın al',
      metin: `**${ilan.satici.ad}** üyesinden ${adet} × **${k.ad}${k.parlak ? ' (parlak)' : ''}** alınacak: **${bicim(toplam)} muz**.`,
      evet: 'Satın al',
    })) return;
    const r = await api('/api/pazar/al', { govde: { id: ilan.id, adet } });
    bildirimGoster(`${r.adet} × **${k.ad}** envanterine eklendi (−${bicim(r.toplam)} muz).`, 'basari');
    setAdet(1);
    sonra();
  });

  let eylem;
  if (ilan.benim) {
    eylem = <span className="text-xs font-medium text-silik">Senin ilanın</span>;
  } else if (ilan.alinamaz) {
    eylem = (
      <Ipucu metin={ilan.alinamaz}>
        <span tabIndex={0} className="cursor-help text-xs font-medium text-silik underline decoration-dotted underline-offset-2">Alınamaz</span>
      </Ipucu>
    );
  } else {
    eylem = (
      <Button tur={oncelikli && !yetmez ? 'basari' : 'ikincil'} disabled={yetmez} bekliyor={bekliyor} onClick={al}>
        <ShoppingCart />Satın al
      </Button>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Avatar uye={ilan.satici} boyut={26} />
        <span className="min-w-0">
          <span className="block truncate text-sm">{ilan.satici.ad}</span>
          <span className="sayi block text-xs text-silik">{bicim(ilan.adet)} adet<span className="hidden sm:inline"> · {tarih(ilan.olusturma)}</span></span>
        </span>
      </span>
      <span className="flex items-center gap-2">
        {!ilan.benim && !ilan.alinamaz && ilan.adet > 1 && <AdetSecici deger={adet} degisti={setAdet} max={ilan.adet} />}
        <span className="flex min-w-24 flex-col items-end">
          <Muz miktar={ilan.fiyat} boyut={15} />
          {adet > 1 && <span className="sayi text-[11px] text-silik">toplam {bicim(toplam)}</span>}
          {/* Sebep yalnız üzerine gelince değil, her zaman görünsün (HIG). */}
          {yetmez && !ilan.benim && !ilan.alinamaz && <span className="text-[11px] text-kirmizi">bakiye yetmiyor</span>}
        </span>
        {eylem}
      </span>
    </li>
  );
}

/**
 * Alım istekleri (fiyat basamakları, alıcı adı yok) ve elinde kart varsa
 * isteklere hemen satış: seçilen adet en yüksek basamaktan aşağı doldurulur.
 */
function IstekBolumu({
  v, kimlik, sonra, istekAc,
}) {
  const [adet, setAdet] = useState(1);
  const [calistir, bekliyor] = useIslem();
  const toplamIstek = v.istekler.reduce((t, i) => t + i.adet, 0);
  const enCok = Math.min(v.sahip, toplamIstek);
  const kac = Math.min(adet, Math.max(1, enCok));
  // Seçilen adedi karşılayan en düşük basamak ve toplam brüt.
  let kalan = kac;
  let brut = 0;
  let enAz = v.istekler[0]?.fiyat ?? 0;
  for (const i of v.istekler) {
    if (kalan === 0) break;
    const m = Math.min(kalan, i.adet);
    brut += m * i.fiyat;
    enAz = i.fiyat;
    kalan -= m;
  }
  const net = brut - Math.floor((brut * v.kesintiYuzde) / 100);
  const k = kartBilgisi(kimlik);

  const sat = () => calistir(async () => {
    if (!await onayIste({
      baslik: 'Alım isteklerine sat',
      metin: `${kac} × **${k.ad}** en yüksek alım isteklerine satılacak. %${v.kesintiYuzde} kesintiden sonra eline yaklaşık **${bicim(net)} muz** geçer.`,
      evet: 'Sat',
    })) return;
    const r = await api('/api/pazar/isteklere-sat', { govde: { kimlik, adet: kac, enAz } });
    bildirimGoster(`${r.adet} × **${k.ad}** satıldı: **+${bicim(r.net)}** muz.`, 'basari');
    setAdet(1);
    sonra();
  });

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={cn(baslikSinifi, 'mb-0')}><HandCoins className="size-3.5" />Alım istekleri</h3>
        <Button boyut="sm" onClick={() => istekAc(kimlik)} disabled={!v.acik}><HandCoins />İstek ver</Button>
      </div>
      {v.istekler.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cizgi py-5 text-center text-sm text-silik">Bu kart için alım isteği yok. İlk isteği sen ver.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-y divide-cizgi rounded-xl border border-cizgi bg-zemin/40 px-3">
            {v.istekler.map((i) => (
              <li key={i.fiyat} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Muz miktar={i.fiyat} boyut={14} />
                <span className="sayi text-soluk">{bicim(i.adet)} adet{i.istek > 1 ? ` · ${i.istek} istek` : ''}</span>
              </li>
            ))}
          </ul>
          {v.sahip > 0 && v.acik && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yesil/30 bg-yesil/5 px-3 py-2.5">
              <span className="min-w-0 text-sm">
                <span className="block font-medium">Hemen sat</span>
                <span className="block text-xs text-soluk">Eline geçer: <span className="sayi text-metin">{bicim(net)}</span> muz</span>
              </span>
              <span className="flex items-center gap-2">
                {enCok > 1 && <AdetSecici deger={kac} degisti={setAdet} max={enCok} />}
                <Button tur="basari" bekliyor={bekliyor} onClick={sat}><Tag />Sat</Button>
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Kartın pazar sayfası (Steam'deki eşya sayfası): ilanlar ucuzdan pahalıya,
 * 30 günlük fiyat geçmişi, son satışlar; elinde varsa "Sat".
 */
export function KartSayfasi({
  kimlik, kapat, satisAc, istekAc, degisti,
}) {
  const { veri: v, yenile } = useApi(kimlik ? `/api/pazar/kart/${encodeURIComponent(kimlik)}` : null);
  const k = kimlik ? kartBilgisi(kimlik) : null;
  const sonra = () => { yenile({ sessiz: true }); degisti?.(); };
  const gecerli = v && v.kimlik === kimlik;

  const enDusuk = gecerli ? v.ilanlar[0]?.fiyat ?? null : null;
  const toplamAdet = gecerli ? v.ilanlar.reduce((t, i) => t + i.adet, 0) : 0;

  return (
    <Pencere acik={Boolean(kimlik)} degisti={(a) => { if (!a) kapat(); }} genis baslik={k?.ad ?? ''} aciklama={k ? `${k.nadirlikAd}${k.parlak ? ' · Parlak' : ''} · Topluluk pazarı` : ''}>
      {k && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <KartKaresi kimlik={kimlik} boyut={72} className="rounded-2xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-1.5 text-sm text-soluk">Sistem değeri <Muz miktar={k.deger} boyut={14} className="text-metin" /></span>
              {gecerli && <span className="text-sm text-soluk">Elinde serbest: <span className="sayi text-metin">{bicim(v.sahip)}</span></span>}
            </div>
            {gecerli && v.sahip > 0 && <Button tur="ana" disabled={!v.acik} onClick={() => satisAc(kimlik)}><Tag />İlana koy</Button>}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['En düşük ilan', enDusuk ? <Muz miktar={enDusuk} boyut={14} /> : '—'],
              ['En yüksek istek', gecerli && v.istekler[0] ? <Muz miktar={v.istekler[0].fiyat} boyut={14} /> : '—'],
              ['Satışta', gecerli ? <span className="sayi">{bicim(toplamAdet)} adet</span> : '—'],
              ['Son satış', gecerli && v.sonSatislar[0] ? <Muz miktar={v.sonSatislar[0].fiyat} boyut={14} /> : '—'],
            ].map(([ad, d]) => (
              <div key={ad} className="flex flex-col gap-1 rounded-xl border border-cizgi bg-zemin/40 px-3 py-2">
                <span className="text-xs text-silik">{ad}</span>
                <span className="text-sm font-medium">{d}</span>
              </div>
            ))}
          </div>

          <section>
            <h3 className={baslikSinifi}><ShoppingCart className="size-3.5" />Satış ilanları</h3>
            {!gecerli && <Iskelet className="h-24" />}
            {gecerli && v.ilanlar.length === 0 && (
              <p className="rounded-xl border border-dashed border-cizgi py-6 text-center text-sm text-silik">Şu an bu kartın ilanı yok.</p>
            )}
            {gecerli && v.ilanlar.length > 0 && (
              <ul className="divide-y divide-cizgi">
                {v.ilanlar.map((i) => (
                  <IlanSatiri key={i.id} ilan={i} kimlik={kimlik} sonra={sonra} oncelikli={i.id === v.ilanlar.find((x) => !x.benim && !x.alinamaz)?.id} />
                ))}
              </ul>
            )}
          </section>

          {gecerli ? <IstekBolumu v={v} kimlik={kimlik} sonra={sonra} istekAc={istekAc} /> : <Iskelet className="h-20" />}

          <section>
            <h3 className={baslikSinifi}><ChartLine className="size-3.5" />Son 30 gün</h3>
            {gecerli ? <FiyatGrafigi gecmis={v.gecmis} /> : <Iskelet className="h-40" />}
          </section>

          {gecerli && v.sonSatislar.length > 0 && (
            <section>
              <h3 className={baslikSinifi}><History className="size-3.5" />Son satışlar</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {v.sonSatislar.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Avatar uye={s.alici} boyut={20} />
                    <span className="min-w-0 flex-1 truncate text-soluk"><span className="text-metin">{s.alici.ad}</span> aldı{s.adet > 1 ? ` (${s.adet} adet)` : ''}</span>
                    <Muz miktar={s.fiyat} boyut={13} className="text-sm" />
                    <span className="sayi w-24 shrink-0 text-right text-xs text-silik">{tarih(s.zaman)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Pencere>
  );
}
