import { ArrowLeft, Search, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Bos } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris } from '@/components/ui/giris.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { bicim, cn } from '@/lib/utils.js';
import { AdetSecici } from '../magaza/AdetSecici.jsx';
import {
  brutHesapla, kartBilgisi, KartAdi, KartKaresi, netHesapla,
} from './ortak.jsx';

const sayiyaCevir = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

/** Kart seçimi: elindeki serbest kartlar, aranabilir. */
function KartSecimi({ kartlar, sec }) {
  const [ara, setAra] = useState('');
  const liste = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr-TR');
    return kartlar
      .map((k) => ({ ...k, bilgi: kartBilgisi(k.kimlik) }))
      .filter((k) => !q || k.bilgi.ad.toLocaleLowerCase('tr-TR').includes(q))
      .sort((a, b) => b.bilgi.deger - a.bilgi.deger || a.bilgi.ad.localeCompare(b.bilgi.ad, 'tr'));
  }, [kartlar, ara]);

  if (kartlar.length === 0) {
    return <Bos ikon={Tag} baslik="Satılacak kartın yok" aciklama="Kasalardan kart çıkınca burada ilana koyabilirsin. Çalışan ya da seferdeki maymunlar satılamaz." />;
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silik" />
        <Giris value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Kart ara" className="pl-9" aria-label="Kart ara" />
      </label>
      <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
        {liste.map((k) => (
          <li key={k.kimlik}>
            <button type="button" onClick={() => sec(k)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-yuzey-2">
              <KartKaresi kimlik={k.kimlik} boyut={32} />
              <KartAdi kimlik={k.kimlik} alt={`elinde ${bicim(k.adet)}`} className="flex-1 text-sm" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Kart satış penceresi. Steam gibi iki alan: alıcının ödeyeceği ve sana
 * geçecek tutar; biri yazılınca öteki kesintiye göre hesaplanır.
 * `baslangic`: doğrudan bu kartla açılır (kart sayfasından "Sat").
 */
export function SatisFormu({
  acik, degisti, baslangic = null, bitti,
}) {
  const { veri: benim } = useApi(acik ? '/api/pazar/benim' : null);
  const [secili, setSecili] = useState(null);
  const [adet, setAdet] = useState(1);
  const [fiyatYazi, setFiyatYazi] = useState('');
  const [netYazi, setNetYazi] = useState('');
  const [calistir, bekliyor] = useIslem();

  // Açılınca: başlangıç kartı varsa ve elinde serbestse doğrudan o.
  useEffect(() => {
    if (!acik) { setSecili(null); setAdet(1); setFiyatYazi(''); setNetYazi(''); return; }
    if (baslangic && benim) setSecili(benim.kartlar.find((k) => k.kimlik === baslangic) ?? null);
  }, [acik, baslangic, benim]);

  const { veri: pazarVeri } = useApi(secili ? `/api/pazar/kart/${encodeURIComponent(secili.kimlik)}` : null);
  // Kart değişince bir önceki kartın yanıtı kullanılmasın.
  const pazar = pazarVeri?.kimlik === secili?.kimlik ? pazarVeri : null;
  const yuzde = benim?.kesintiYuzde ?? 10;
  const enDusuk = pazar?.ilanlar.find((i) => !i.benim)?.fiyat ?? null;
  const sonSatis = pazar?.sonSatislar[0]?.fiyat ?? null;
  const enYuksekIstek = pazar?.istekler[0]?.fiyat ?? null;

  const fiyatAyarla = (f) => { setFiyatYazi(f ? bicim(f) : ''); setNetYazi(f ? bicim(netHesapla(f, yuzde)) : ''); };
  // Kart seçilince öneri: en düşük ilanın 1 altı (tabandan aşağı değil), yoksa son satış, yoksa taban.
  useEffect(() => {
    if (!secili || !pazar || fiyatYazi) return;
    const { min, max } = secili.aralik;
    const oneri = enDusuk ? enDusuk - 1 : sonSatis ?? min;
    fiyatAyarla(Math.max(min, Math.min(max, oneri)));
  }, [pazar]);

  const fiyat = sayiyaCevir(fiyatYazi);
  const aralik = secili?.aralik;
  const hata = !secili || !fiyat ? null
    : fiyat < aralik.min ? `En az ${bicim(aralik.min)} muz (kartın sistem değeri).`
      : fiyat > aralik.max ? `En çok ${bicim(aralik.max)} muz.` : null;
  const maxAdet = Math.min(secili?.adet ?? 1, benim?.adetSiniri ?? 100);

  const gonder = () => calistir(async () => {
    const r = await api('/api/pazar/ilan', { govde: { kimlik: secili.kimlik, adet, fiyat } });
    const ad = kartBilgisi(secili.kimlik).ad;
    const parcalar = [];
    if (r.hemenSatilan > 0) parcalar.push(`${r.hemenSatilan} × **${ad}** alım isteklerine hemen satıldı (+${bicim(r.hemenNet)} muz)`);
    if (r.ilan.adet > 0) parcalar.push(`${r.ilan.adet} × **${ad}** pazara kondu: tanesi **${bicim(fiyat)}** muz`);
    bildirimGoster(`${parcalar.join('. ')}.`, 'basari');
    degisti(false);
    bitti?.();
  });

  const k = secili ? kartBilgisi(secili.kimlik) : null;
  return (
    <Pencere acik={acik} degisti={degisti} ikon={Tag} baslik="Pazarda sat" aciklama={secili ? 'Fiyatı belirle; kart satılana kadar ilanda bekler.' : 'Satmak istediğin kartı seç.'}>
      {!benim && <div className="h-40 animate-pulse rounded-xl bg-yuzey-2" />}
      {benim && !benim.acik && (
        <p className="rounded-xl border border-turuncu/40 bg-turuncu/10 p-3 text-sm">Pazar şu an kapalı; yönetici açana kadar ilan açılamaz.</p>
      )}
      {benim?.acik && !secili && <KartSecimi kartlar={benim.kartlar} sec={(x) => { setSecili(x); setAdet(1); setFiyatYazi(''); setNetYazi(''); }} />}
      {benim?.acik && secili && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {!baslangic && (
              <Button tur="hayalet" boyut="ikon" aria-label="Başka kart seç" onClick={() => setSecili(null)}><ArrowLeft /></Button>
            )}
            <KartKaresi kimlik={secili.kimlik} boyut={40} />
            <KartAdi kimlik={secili.kimlik} alt={`elinde ${bicim(secili.adet)}`} className="flex-1" />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              ['Sistem değeri', k.deger],
              ['En düşük ilan', enDusuk],
              ['Son satış', sonSatis],
            ].map(([ad, d]) => (
              <button
                key={ad}
                type="button"
                disabled={!d}
                onClick={() => fiyatAyarla(Math.max(aralik.min, Math.min(aralik.max, d)))}
                className="flex flex-col items-center gap-1 rounded-xl border border-cizgi bg-zemin/40 px-2 py-2 transition-colors enabled:hover:border-cizgi-guclu disabled:opacity-60"
                title={d ? 'Bu fiyatı kullan' : undefined}
              >
                <span className="text-silik">{ad}</span>
                {d ? <Muz miktar={d} boyut={13} className="text-sm" /> : <span className="text-sm text-silik">—</span>}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Alan etiket="Alıcı öder (tanesi)">
              <Giris
                inputMode="numeric"
                value={fiyatYazi}
                onChange={(e) => {
                  const f = sayiyaCevir(e.target.value);
                  setFiyatYazi(f ? bicim(f) : '');
                  setNetYazi(f ? bicim(netHesapla(f, yuzde)) : '');
                }}
                aria-invalid={Boolean(hata)}
              />
            </Alan>
            <Alan etiket="Sana geçer (tanesi)">
              <Giris
                inputMode="numeric"
                value={netYazi}
                onChange={(e) => {
                  const n = sayiyaCevir(e.target.value);
                  setNetYazi(n ? bicim(n) : '');
                  setFiyatYazi(n ? bicim(brutHesapla(n, yuzde)) : '');
                }}
              />
            </Alan>
          </div>
          <p className={cn('-mt-2 text-xs', hata ? 'text-kirmizi' : 'text-silik')}>
            {hata ?? (enYuksekIstek && fiyat <= enYuksekIstek
              ? `Bu fiyata ya da üstüne alım isteği var: o kopyalar hemen, isteğin fiyatından (${bicim(enYuksekIstek)} muza kadar) satılır. %${yuzde} kesinti düşülür.`
              : `Satıştan %${yuzde} pazar kesintisi düşülür. Fiyat aralığı ${bicim(aralik.min)}–${bicim(aralik.max)} muz. Satılınca sana DM gelir.`)}
          </p>

          {maxAdet > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-soluk">Kaç tane?</span>
              <AdetSecici deger={adet} degisti={setAdet} max={maxAdet} />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-cizgi bg-zemin/40 px-3.5 py-3">
            <span className="text-sm text-soluk">Hepsi satılınca eline geçer</span>
            <Muz miktar={fiyat ? netHesapla(fiyat, yuzde) * adet : 0} boyut={16} className="text-base" />
          </div>
          <Button tur="ana" boyut="lg" disabled={!fiyat || Boolean(hata)} bekliyor={bekliyor} onClick={gonder}>
            <Tag />{adet > 1 ? `${adet} tanesini ilana koy` : 'İlana koy'}
          </Button>
        </div>
      )}
    </Pencere>
  );
}
