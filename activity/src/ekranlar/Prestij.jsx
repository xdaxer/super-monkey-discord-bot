import {
  Boxes, Coins, Crown, FlaskConical, Flame, Gift, Layers, LibraryBig, Lock, Package, Repeat, ShieldAlert, ShieldCheck, Sparkles,
  Trash2, Tractor,
} from 'lucide-react';
import { useState } from 'react';

import { EkranBaslik } from '@/components/Bolum.jsx';
import { HataKutusu } from '@/components/Durumlar.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Md } from '@/components/Md.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { bicim } from '@/lib/utils.js';
import Amblem from './prestij/Amblem.jsx';
import { konfetiPatlat } from './prestij/konfeti.js';

const IKON = {
  bakiye: Coins, kartlar: Layers, kasalar: Package, stok: Boxes, takviyeler: FlaskConical, setler: LibraryBig, seri: Flame,
};

const carpanMetni = (c) => `×${Number(c).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
const artis = (c) => `+%${Math.round((c - 1) * 100)}`;

function Liste({ baslik, ikon: Ikon, ogeler, ogeIkon, ton }) {
  return (
    <Kart>
      <KartBaslik ikon={Ikon} baslik={baslik} />
      <ul className="flex flex-col gap-2.5">
        {ogeler.map((o) => {
          const OgeIkon = ogeIkon(o);
          return (
            <li key={o.kod ?? o} className="flex items-start gap-2.5 text-sm text-metin/90">
              <OgeIkon className={`mt-0.5 size-4 shrink-0 ${ton}`} />
              <span>{o.ad ?? o}</span>
            </li>
          );
        })}
      </ul>
    </Kart>
  );
}

export default function Ekran() {
  const {
    veri, hata, yukleniyor, yenile,
  } = useApi('/api/prestij');
  const [calistir, bekliyor] = useIslem();
  const [kutlama, setKutlama] = useState(null);

  if (yukleniyor && !veri) return <div className="flex flex-col gap-5"><EkranBaslik ikon={Crown} baslik="Prestij" /><Iskelet className="h-72" /><Iskelet className="h-56" /></div>;
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;

  const engelli = veri.engeller.length > 0;
  const yeterli = !veri.enUst && veri.emek >= veri.esik;
  const oran = veri.esik ? veri.emek / veri.esik : 1;

  const yap = async () => {
    const ilk = await onayIste({
      baslik: `Prestij ${veri.seviye + 1} yapılsın mı?`,
      metin: (
        <div className="flex flex-col gap-3">
          <p>Muz kazancın <b>{carpanMetni(veri.sonrakiCarpan)}</b> ({artis(veri.sonrakiCarpan)}) olur ve bir <b>{veri.odulKasa.ad}</b> kazanırsın.</p>
          <div>
            <p className="mb-1 font-semibold text-kirmizi">Kaybedeceklerin</p>
            <ul className="list-disc space-y-0.5 pl-5 text-soluk">
              {veri.sifirlanacaklar.map((s) => <li key={s.kod}>{s.ad}</li>)}
              <li>Cüzdanındaki <b className="sayi text-metin">{bicim(veri.bakiye)}</b> muz</li>
            </ul>
          </div>
          {veri.ciftlikDevri > 0 && (
            <p className="text-soluk">Çiftliklerin satılır; <b className="sayi text-yesil">{bicim(veri.ciftlikDevri)}</b> muz yeni cüzdanına geçer.</p>
          )}
        </div>
      ),
      evet: 'Devam',
      tehlikeli: true,
    });
    if (!ilk) return;
    const son = await onayIste({
      baslik: 'Son onay',
      metin: 'Kartların, kasaların ve cüzdanın **sıfırlanacak**. Bu işlem **geri alınamaz**. Emin misin?',
      evet: 'Evet, prestij yap',
      tehlikeli: true,
    });
    if (!son) return;
    await calistir(async () => {
      const r = await api('/api/prestij/yap', { govde: { beklenenSeviye: veri.seviye } });
      setKutlama(r);
      konfetiPatlat(true);
      await yenile({ sessiz: true });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={Crown} baslik="Prestij" aciklama="Yeterince emek gelirin olunca ilerlemeni sıfırla, kalıcı muz çarpanı kazan." />

      <Kart vurgu={veri.seviye > 0} className="grid items-center gap-6 md:grid-cols-[auto_1fr] md:gap-10 md:p-7">
        <Amblem seviye={veri.seviye} maks={veri.maksPrestij} />
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-silik">Muz kazanç çarpanın</p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="font-display text-5xl font-bold text-muz">{carpanMetni(veri.carpan)}</span>
              <Rozet tur="muz">{artis(veri.carpan)}</Rozet>
            </p>
            <p className="mt-2 text-sm text-soluk">Her prestij kalıcı +%{veri.carpanYuzde} kazandırır (en çok +%{veri.carpanYuzde * veri.maksPrestij}). Günlük ödül, sohbet, meslek, görev ve sefer muzuna ve çiftliklerin üretimine uygulanır; kumar, satış, faiz ve kasa ödülleri etkilenmez.</p>
          </div>

          {veri.enUst ? (
            <div className="flex items-center gap-3 rounded-2xl border border-muz/30 bg-muz/[0.07] p-4">
              <Sparkles className="size-6 shrink-0 text-muz" />
              <div>
                <p className="font-display font-semibold">En üst prestijdesin</p>
                <p className="text-sm text-soluk">Daha fazla prestij yok; çarpanın kalıcı.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-cizgi bg-zemin/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display font-semibold">Sonraki: Prestij {veri.seviye + 1}</p>
                <Rozet tur="muz">{carpanMetni(veri.sonrakiCarpan)}</Rozet>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-soluk">Emek gelirin <Muz miktar={veri.emek} className="ml-1 font-semibold text-metin" /></span>
                <span className="text-soluk">Eşik <Muz miktar={veri.esik} className="ml-1 text-metin" /></span>
              </div>
              <Ilerleme oran={oran} yukseklik={8} renk={yeterli ? 'var(--color-yesil)' : 'var(--color-muz)'} />
              <p className="text-xs text-silik">{yeterli ? 'Hazırsın. Bedel yok.' : `%${Math.min(100, Math.floor(oran * 100))} hazır · ${bicim(veri.esik - veri.emek)} muz daha kazan`} · son prestijinden beri günlük, sohbet, meslek, görev ve sefer muzu sayılır.</p>
              <div className="flex items-center gap-3 rounded-xl border border-cizgi bg-zemin/40 p-3 text-sm">
                {veri.odulKasa.gorsel ? <Gorsel g={veri.odulKasa.gorsel} boyut={40} className="shrink-0" /> : <Gift className="size-6 shrink-0 text-muz" />}
                <span className="text-soluk">Prestij ödülü: <b className="text-metin">{veri.odulKasa.ad}</b>{veri.ciftlikDevri > 0 && <> · çiftliklerinden <Muz miktar={veri.ciftlikDevri} className="text-yesil" /> yeni cüzdanına geçer</>}</span>
              </div>
              <Button tur="tehlike" boyut="lg" tam bekliyor={bekliyor} disabled={!yeterli || engelli} onClick={yap}><Crown />Prestij yap</Button>
              {engelli && <p className="text-center text-xs text-kirmizi">Önce aşağıdaki engelleri kaldır.</p>}
            </div>
          )}
        </div>
      </Kart>

      {engelli && (
        <div className="flex gap-3 rounded-2xl border border-kirmizi/35 bg-kirmizi/10 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-kirmizi" />
          <div>
            <p className="font-display font-semibold text-kirmizi">Şu an prestij yapamazsın</p>
            <ul className="mt-1.5 flex flex-col gap-1 text-sm text-metin/90">
              {veri.engeller.map((e) => <li key={e}><Md metin={e} /></li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Liste baslik="Sıfırlananlar" ikon={Trash2} ogeler={veri.sifirlanacaklar} ogeIkon={(o) => IKON[o.kod] ?? Trash2} ton="text-kirmizi" />
        <div className="flex flex-col gap-4">
          <Liste baslik="Muza çevrilenler" ikon={Repeat} ogeler={veri.devredilenler} ogeIkon={() => Tractor} ton="text-muz" />
          <Liste baslik="Korunanlar" ikon={Lock} ogeler={veri.korunanlar} ogeIkon={() => ShieldCheck} ton="text-yesil" />
        </div>
      </div>

      <Pencere acik={Boolean(kutlama)} degisti={(a) => { if (!a) setKutlama(null); }} baslik={kutlama ? `Prestij ${kutlama.seviye}!` : ''}>
        {kutlama && (
          <div className="flex flex-col items-center gap-4 text-center">
            <Amblem seviye={kutlama.seviye} maks={veri.maksPrestij} boyut={220} />
            <p className="text-sm text-soluk">Muz kazancın artık <b className="sayi text-lg text-muz">{carpanMetni(kutlama.carpan)}</b> ({artis(kutlama.carpan)})</p>
            <div className="w-full rounded-xl border border-muz/30 bg-muz/[0.07] p-3 text-left text-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-silik">Yeni başlangıcın</p>
              <ul className="flex flex-col gap-1">
                <li className="flex justify-between gap-3"><span className="text-soluk">Prestij ödülü</span><span className="inline-flex items-center gap-1.5"><Gorsel g={kutlama.kasa.gorsel} boyut={18} />{kutlama.kasa.ad}</span></li>
                {kutlama.devir.muz > 0 && (
                  <li className="flex justify-between gap-3"><span className="text-soluk">Çiftlik devri ({kutlama.devir.ciftlik})</span><Muz miktar={kutlama.devir.muz} /></li>
                )}
              </ul>
            </div>
            {kutlama.ozet.some((o) => o.miktar > 0) && (
              <div className="w-full rounded-xl border border-cizgi bg-zemin/40 p-3 text-left">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-silik">Sıfırlananlar</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {kutlama.ozet.filter((o) => o.miktar > 0).map((o) => (
                    <li key={o.kod} className="flex justify-between gap-3"><span className="text-soluk">{o.ad}</span><span className="sayi">{bicim(o.miktar)} {o.birim}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-silik">Seviyen, rozetlerin ve başarımların korundu.</p>
            <Button tur="ana" tam onClick={() => setKutlama(null)}>Harika</Button>
          </div>
        )}
      </Pencere>
    </div>
  );
}
