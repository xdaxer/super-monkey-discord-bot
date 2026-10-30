import {
  ChevronLeft, ChevronRight, HandCoins, Pencil, Receipt, Tag, Trash2, Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris } from '@/components/ui/giris.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart } from '@/components/ui/kart.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { bicim, cn, tarih } from '@/lib/utils.js';
import { AdetSecici } from '../../magaza/AdetSecici.jsx';
import { kartBilgisi } from '../../pazar/ortak.jsx';
import {
  DONEMLER, DURUM_ADLARI, durumAdi, DurumRozeti, KartHucre, Secmeli, UyeAdi,
} from './ortak.jsx';

const sayiyaCevir = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

const TURLER = {
  ilan: {
    yol: '/api/yonetim/pazar/ilanlar', ikon: Tag, bos: 'Bu süzgeçle ilan yok.', kisi: 'satici', kisiAd: 'Satıcı',
  },
  istek: {
    yol: '/api/yonetim/pazar/istekler', ikon: HandCoins, bos: 'Bu süzgeçle alım isteği yok.', kisi: 'alici', kisiAd: 'Alıcı',
  },
  satis: {
    yol: '/api/yonetim/pazar/satislar', ikon: Receipt, bos: 'Bu süzgeçle satış yok.',
  },
};

const durumSecenekleri = (tur) => [{ kimlik: null, ad: 'Hepsi' }, ...Object.keys(DURUM_ADLARI).map((kimlik) => ({ kimlik, ad: durumAdi(kimlik, tur) }))];

/** Yönetici işlem penceresi: ilan düzenle / ilan kaldır / istek kaldır / satış geri al. */
function IslemPenceresi({ islem, kapat, bitti }) {
  const [fiyatYazi, setFiyatYazi] = useState('');
  const [adet, setAdet] = useState(1);
  const [iade, setIade] = useState(true);
  const [sebep, setSebep] = useState('');
  const [calistir, bekliyor] = useIslem();
  useEffect(() => {
    if (!islem) return;
    setFiyatYazi(islem.satir.fiyat ? bicim(islem.satir.fiyat) : '');
    setAdet(islem.satir.adet ?? 1);
    setIade(true);
    setSebep('');
  }, [islem]);
  if (!islem) return null;
  const { tur, satir } = islem;
  const k = kartBilgisi(satir.kart);

  const yap = () => calistir(async () => {
    if (tur === 'duzenle') {
      const r = await api(`/api/yonetim/pazar/ilan/${satir.id}/duzenle`, { govde: { fiyat: sayiyaCevir(fiyatYazi), adet } });
      bildirimGoster(r.degisti ? 'İlan düzenlendi; satıcıya DM gitti.' : 'Değişiklik yok.', 'basari');
    } else if (tur === 'kaldir') {
      await api(`/api/yonetim/pazar/ilan/${satir.id}/kaldir`, { govde: { iade, sebep: sebep || undefined } });
      bildirimGoster(`İlan kaldırıldı${iade ? '; kartlar satıcıya döndü' : '; kartlara el konuldu'}.`, 'basari');
    } else if (tur === 'istek') {
      const r = await api(`/api/yonetim/pazar/istek/${satir.id}/kaldir`, { govde: { sebep: sebep || undefined } });
      bildirimGoster(`Alım isteği kaldırıldı; ${bicim(r.iade)} muz alıcıya döndü.`, 'basari');
    } else {
      const r = await api(`/api/yonetim/pazar/satis/${satir.id}/geri-al`, { govde: { sebep: sebep || undefined } });
      bildirimGoster(`Satış geri alındı: alıcıya ${bicim(r.toplam)} muz döndü, satıcıdan ${bicim(r.net)} muz alındı.`, 'basari');
    }
    kapat();
    bitti();
  });

  const basliklar = {
    duzenle: 'İlanı düzenle', kaldir: 'İlanı kaldır', istek: 'Alım isteğini kaldır', geri: 'Satışı geri al',
  };
  const sebepAlani = (
    <Alan etiket="Sebep (isteğe bağlı)" ipucu="Üyeye giden DM'de ve işlem kayıtlarında görünür.">
      <Giris value={sebep} onChange={(e) => setSebep(e.target.value.slice(0, 300))} placeholder="ör. alt hesap şüphesi" />
    </Alan>
  );

  return (
    <Pencere acik degisti={(a) => { if (!a) kapat(); }} baslik={basliklar[tur]} aciklama={`${satir.adet} × ${k.ad}${k.parlak ? ' (parlak)' : ''}`}>
      <div className="flex flex-col gap-4">
        {tur === 'duzenle' && (
          <>
            <Alan etiket="Birim fiyat" ipucu={`Kartın aralığı: ${bicim(k.deger)}–${bicim(k.deger * islem.tavan)} muz.`}>
              <Giris inputMode="numeric" value={fiyatYazi} onChange={(e) => { const f = sayiyaCevir(e.target.value); setFiyatYazi(f ? bicim(f) : ''); }} />
            </Alan>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-soluk">İlandaki kopya <span className="text-xs text-silik">(yalnız azalır; fark satıcıya döner)</span></span>
              <AdetSecici deger={adet} degisti={setAdet} max={satir.adet} />
            </div>
          </>
        )}
        {tur === 'kaldir' && (
          <>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cizgi bg-zemin/40 p-3 text-sm">
              <input type="checkbox" checked={iade} onChange={(e) => setIade(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-muz)]" />
              <span>
                <span className="block font-medium">Kartları satıcıya iade et</span>
                <span className="block text-xs text-silik">İşareti kaldırırsan {satir.adet} kopyaya el konur (geri getirilemez).</span>
              </span>
            </label>
            {sebepAlani}
          </>
        )}
        {tur === 'istek' && (
          <>
            <p className="text-sm text-soluk">Emanetteki <span className="font-medium text-metin">{bicim(satir.emanet)} muz</span> alıcıya iade edilir.</p>
            {sebepAlani}
          </>
        )}
        {tur === 'geri' && (
          <>
            <ul className="flex flex-col gap-1.5 rounded-xl border border-cizgi bg-zemin/40 p-3 text-sm text-soluk">
              <li>Alıcı <span className="text-metin">{satir.alici.ad}</span>: ödediği <span className="sayi text-metin">{bicim(satir.toplam)}</span> muz geri döner, {satir.adet} kart elinden alınır.</li>
              <li>Satıcı <span className="text-metin">{satir.satici.ad}</span>: eline geçen <span className="sayi text-metin">{bicim(satir.toplam - satir.kesinti)}</span> muz alınır, kartlar envanterine döner.</li>
              <li>Alıcıda kart ya da satıcıda muz kalmadıysa hiçbir şey değişmez.</li>
            </ul>
            {sebepAlani}
          </>
        )}
        <Button tur={tur === 'duzenle' ? 'ana' : 'tehlike'} bekliyor={bekliyor} onClick={yap}>
          {tur === 'duzenle' ? <><Pencil />Kaydet</> : tur === 'geri' ? <><Undo2 />Geri al</> : <><Trash2 />Kaldır</>}
        </Button>
      </div>
    </Pencere>
  );
}

/** Satırın eylem düğmeleri (yalnız açık ilan/istek ve geri alınmamış satış). */
function Eylemler({ tur, satir, ac }) {
  if (tur === 'ilan' && satir.durum === 'acik') {
    return (
      <span className="flex shrink-0 gap-1">
        <Button tur="hayalet" boyut="ikon" aria-label="İlanı düzenle" title="Düzenle" onClick={() => ac('duzenle', satir)}><Pencil /></Button>
        <Button tur="hayalet" boyut="ikon" aria-label="İlanı kaldır" title="Kaldır" className="text-kirmizi hover:text-kirmizi" onClick={() => ac('kaldir', satir)}><Trash2 /></Button>
      </span>
    );
  }
  if (tur === 'istek' && satir.durum === 'acik') {
    return <Button tur="hayalet" boyut="ikon" aria-label="İsteği kaldır" title="Kaldır" className="text-kirmizi hover:text-kirmizi" onClick={() => ac('istek', satir)}><Trash2 /></Button>;
  }
  if (tur === 'satis' && !satir.geriZaman) {
    return <Button tur="hayalet" boyut="sm" onClick={() => ac('geri', satir)}><Undo2 />Geri al</Button>;
  }
  return <span className="w-9 shrink-0" />;
}

/**
 * Yönetici listesi: ilanlar, alım istekleri ya da satışlar; süzgeç (durum /
 * dönem, üye, kart), sayfa ve satır eylemleri.
 */
export function Kayitlar({
  tur, suzgec, uyeSec, kartSec, degisti,
}) {
  const t = TURLER[tur];
  const [durum, setDurum] = useState(tur === 'satis' ? null : 'acik');
  const [donem, setDonem] = useState('30g');
  const [sayfa, setSayfa] = useState(1);
  const [islem, setIslem] = useState(null);
  useEffect(() => { setSayfa(1); }, [suzgec.uye, suzgec.kart, durum, donem]);

  const p = new URLSearchParams({ sayfa: String(sayfa) });
  if (tur === 'satis') p.set('donem', donem);
  else if (durum) p.set('durum', durum);
  if (suzgec.uye) p.set('uye', suzgec.uye.id);
  if (suzgec.kart) p.set('kart', suzgec.kart);
  const {
    veri: v, hata, yukleniyor, yenile,
  } = useApi(`${t.yol}?${p}`, { aralik: 30_000 });
  const tazele = () => { yenile({ sessiz: true }); degisti(); };

  return (
    <div className="flex flex-col gap-3">
      {tur === 'satis'
        ? <Secmeli liste={DONEMLER} deger={donem} degisti={setDonem} etiket="Dönem" />
        : <Secmeli liste={durumSecenekleri(tur)} deger={durum} degisti={setDurum} etiket="Durum" />}
      <Kart className="p-3 sm:p-4">
        {hata && !v && <HataKutusu hata={hata} tekrar={yenile} />}
        {!v && !hata && <Iskelet className="h-48" />}
        {v && v.satirlar.length === 0 && <Bos ikon={t.ikon} baslik="Kayıt yok" aciklama={t.bos} className="py-8" />}
        {v && v.satirlar.length > 0 && (
          <div className={cn('flex flex-col transition-opacity', yukleniyor && 'opacity-60')}>
            <p className="mb-1 px-1 text-xs text-silik">{bicim(v.toplam)} kayıt</p>
            <ul className="flex flex-col divide-y divide-cizgi">
              {v.satirlar.map((s) => (
                // Dar: üstte kart + fiyat, altta üye + eylemler; geniş: tek satır.
                <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 text-sm sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto_auto]">
                  <span className="order-1 min-w-0"><KartHucre kimlik={s.kart} sec={kartSec} /></span>
                  {tur === 'satis' ? (
                    <span className="order-3 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] sm:order-2">
                      <UyeAdi uye={s.satici} sec={uyeSec} />
                      <span className="text-silik">→</span>
                      <UyeAdi uye={s.alici} sec={uyeSec} />
                    </span>
                  ) : (
                    <span className="order-3 min-w-0 text-[13px] sm:order-2"><UyeAdi uye={s[t.kisi]} sec={uyeSec} /></span>
                  )}
                  <span className="order-2 flex shrink-0 flex-col items-end sm:order-3">
                    <span className="flex items-center gap-1"><span className="sayi text-xs text-soluk">{s.adet}{tur !== 'satis' && s.ilkAdet !== s.adet ? `/${s.ilkAdet}` : ''} ×</span><Muz miktar={s.fiyat} boyut={13} className="text-sm" /></span>
                    <span className="flex flex-wrap items-center justify-end gap-1">
                      {tur === 'satis' ? (
                        <>
                          {s.istekId && <span className="rounded-md bg-mavi/15 px-1.5 py-px text-[11px] font-semibold text-mavi">İstekten</span>}
                          {s.pahali && <span className="rounded-md bg-turuncu/15 px-1.5 py-px text-[11px] font-semibold text-turuncu">Pahalı</span>}
                          {s.geriZaman && <span className="rounded-md bg-kirmizi/15 px-1.5 py-px text-[11px] font-semibold text-kirmizi">Geri alındı</span>}
                        </>
                      ) : <DurumRozeti durum={s.durum} tur={tur} />}
                      <span className="sayi text-[11px] text-silik">{tarih(tur === 'satis' ? s.zaman : s.olusturma)}</span>
                    </span>
                  </span>
                  <span className="order-4 flex justify-end">
                    <Eylemler tur={tur} satir={s} ac={(islemTuru, satir) => setIslem({ tur: islemTuru, satir, tavan: v.aralikCarpani })} />
                  </span>
                </li>
              ))}
            </ul>
            {v.sayfaSayisi > 1 && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <Button boyut="sm" disabled={v.sayfa <= 1 || yukleniyor} onClick={() => setSayfa(v.sayfa - 1)}><ChevronLeft />Önceki</Button>
                <span className="sayi text-sm text-soluk">Sayfa {v.sayfa} / {v.sayfaSayisi}</span>
                <Button boyut="sm" disabled={v.sayfa >= v.sayfaSayisi || yukleniyor} onClick={() => setSayfa(v.sayfa + 1)}>Sonraki<ChevronRight /></Button>
              </div>
            )}
          </div>
        )}
      </Kart>
      <IslemPenceresi islem={islem} kapat={() => setIslem(null)} bitti={tazele} />
    </div>
  );
}
