import {
  ArrowLeft, HandCoins, Search,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris } from '@/components/ui/giris.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { bicim, cn } from '@/lib/utils.js';
import { AdetSecici } from '../magaza/AdetSecici.jsx';
import { kartBilgisi, KartAdi, KartKaresi } from './ortak.jsx';

const sayiyaCevir = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

/** Katalogdaki bütün kartlar (normal ve parlak), aranabilir: pazarda ilanı olmayan kart da istenebilir. */
function KartSecimi({ sec }) {
  const kartlar = useUygulama((s) => s.katalog?.kartlar ?? []);
  const [ara, setAra] = useState('');
  const liste = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr-TR');
    return kartlar
      .map((k) => kartBilgisi(k.kimlik))
      .filter((k) => !q || k.ad.toLocaleLowerCase('tr-TR').includes(q))
      .sort((a, b) => b.deger - a.deger || a.ad.localeCompare(b.ad, 'tr') || Number(a.parlak) - Number(b.parlak));
  }, [kartlar, ara]);
  return (
    <div className="flex flex-col gap-3">
      <label className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silik" />
        <Giris value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Hangi kartı istiyorsun?" className="pl-9" aria-label="Kart ara" />
      </label>
      <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
        {liste.map((k) => (
          <li key={k.kimlik}>
            <button type="button" onClick={() => sec(k.kimlik)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-yuzey-2">
              <KartKaresi kimlik={k.kimlik} boyut={32} />
              <KartAdi kimlik={k.kimlik} className="flex-1 text-sm" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Alım isteği penceresi (Steam'deki "satın alma talebi"): tanesi en çok kaç
 * muza, kaç tane. Toplam bakiyeden emanete alınır; bu fiyata ya da altına
 * ilan varsa önce onlar alınır. `baslangic`: doğrudan bu kartla açılır.
 */
export function IstekFormu({
  acik, degisti, baslangic = null, bitti,
}) {
  const bakiye = useUygulama((s) => s.bakiye);
  const [kimlik, setKimlik] = useState(null);
  const [adet, setAdet] = useState(1);
  const [fiyatYazi, setFiyatYazi] = useState('');
  const [calistir, bekliyor] = useIslem();

  useEffect(() => {
    if (!acik) { setKimlik(null); setAdet(1); setFiyatYazi(''); return; }
    if (baslangic) setKimlik(baslangic);
  }, [acik, baslangic]);

  const { veri: pazarVeri } = useApi(kimlik ? `/api/pazar/kart/${encodeURIComponent(kimlik)}` : null);
  const pazar = pazarVeri?.kimlik === kimlik ? pazarVeri : null;
  const enDusuk = pazar?.ilanlar.find((i) => !i.alinamaz)?.fiyat ?? null;
  const enYuksek = pazar?.istekler[0]?.fiyat ?? null;

  // Öneri: en yüksek isteğin 1 üstü (öne geçsin), yoksa sistem değeri.
  useEffect(() => {
    if (!pazar || fiyatYazi) return;
    const { min, max } = pazar.aralik;
    setFiyatYazi(bicim(Math.max(min, Math.min(max, enYuksek ? enYuksek + 1 : min))));
  }, [pazar]);

  const fiyat = sayiyaCevir(fiyatYazi);
  const aralik = pazar?.aralik;
  const toplam = fiyat * adet;
  const hata = !aralik || !fiyat ? null
    : fiyat < aralik.min ? `En az ${bicim(aralik.min)} muz (kartın sistem değeri).`
      : fiyat > aralik.max ? `En çok ${bicim(aralik.max)} muz.`
        : typeof bakiye === 'number' && toplam > bakiye ? `Bakiyen yetmiyor: ${bicim(toplam)} muz gerekiyor.` : null;
  // Bu fiyata ya da altına kaç kopya hemen alınır (alınabilir ilanlar).
  const hemen = pazar ? Math.min(adet, pazar.ilanlar.filter((i) => !i.alinamaz && i.fiyat <= fiyat).reduce((t, i) => t + i.adet, 0)) : 0;

  const gonder = () => calistir(async () => {
    const r = await api('/api/pazar/istek', { govde: { kimlik, adet, fiyat } });
    const ad = kartBilgisi(kimlik).ad;
    const parcalar = [];
    if (r.hemenAlinan > 0) parcalar.push(`${r.hemenAlinan} × **${ad}** hemen alındı (−${bicim(r.hemenOdenen)} muz)`);
    if (r.istek) parcalar.push(`${r.istek.adet} kopya için alım isteğin açıldı; **${bicim(r.emanet)}** muz emanette`);
    bildirimGoster(`${parcalar.join('. ')}.`, 'basari');
    degisti(false);
    bitti?.();
  });

  return (
    <Pencere acik={acik} degisti={degisti} ikon={HandCoins} baslik="Alım isteği ver" aciklama={kimlik ? 'Satan çıkınca kart kendiliğinden sana geçer.' : 'Almak istediğin kartı seç; pazarda ilanı olmasa da olur.'}>
      {!kimlik && <KartSecimi sec={setKimlik} />}
      {kimlik && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {!baslangic && <Button tur="hayalet" boyut="ikon" aria-label="Başka kart seç" onClick={() => { setKimlik(null); setFiyatYazi(''); }}><ArrowLeft /></Button>}
            <KartKaresi kimlik={kimlik} boyut={40} />
            <KartAdi kimlik={kimlik} className="flex-1" />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              ['Sistem değeri', kartBilgisi(kimlik).deger],
              ['En düşük ilan', enDusuk],
              ['En yüksek istek', enYuksek],
            ].map(([ad, d]) => (
              <div key={ad} className="flex flex-col items-center gap-1 rounded-xl border border-cizgi bg-zemin/40 px-2 py-2">
                <span className="text-silik">{ad}</span>
                {d ? <Muz miktar={d} boyut={13} className="text-sm" /> : <span className="text-sm text-silik">—</span>}
              </div>
            ))}
          </div>

          <Alan etiket="Tanesine en çok ödeyeceğin">
            <Giris
              inputMode="numeric"
              value={fiyatYazi}
              onChange={(e) => { const f = sayiyaCevir(e.target.value); setFiyatYazi(f ? bicim(f) : ''); }}
              aria-invalid={Boolean(hata)}
            />
          </Alan>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-soluk">Kaç tane?</span>
            <AdetSecici deger={adet} degisti={setAdet} max={pazar?.adetSiniri ?? 100} />
          </div>
          <p className={cn('-mt-1 text-xs', hata ? 'text-kirmizi' : 'text-silik')}>
            {hata ?? (hemen > 0
              ? `Bu fiyata ya da altına ${hemen} kopya ilanda: onlar hemen ilan fiyatından alınır, kalanı için istek açılır.`
              : 'Toplam tutar bakiyenden emanete alınır; isteği kaldırınca kalan geri döner.')}
          </p>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-cizgi bg-zemin/40 px-3.5 py-3">
            <span className="text-sm text-soluk">En çok ödeyeceğin</span>
            <Muz miktar={toplam} boyut={16} className="text-base" />
          </div>
          <Button tur="ana" boyut="lg" disabled={!fiyat || Boolean(hata) || !pazar} bekliyor={bekliyor} onClick={gonder}>
            <HandCoins />İsteği ver
          </Button>
        </div>
      )}
    </Pencere>
  );
}
