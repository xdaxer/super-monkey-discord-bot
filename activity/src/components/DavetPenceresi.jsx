import { Swords } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { OYUNLAR } from '@/ekranlar/sosyal/ortak.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { davetSesi } from '@/lib/ses.js';
import { useUygulama } from '@/lib/store.js';
import { depo } from '@/lib/utils.js';

/** Gelen düello davetlerini bu aralıkla yoklar (sekme görünürken). */
const YOKLAMA_MS = 8_000;
const GORULEN_ANAHTAR = 'gorulen-davetler';
const GORULEN_SINIRI = 50;

/**
 * Gelen düello daveti: yeni gelen her davet için pencere açılır ve ses çalar.
 * Görülen davetler cihazda hatırlanır; yeniden açılışta aynı davet tekrar
 * pencere açmaz (Sosyal → Düello "Gelen" listesinde durur).
 */
export function DavetPenceresi() {
  const git = useUygulama((s) => s.git);
  const [sira, setSira] = useState([]);
  const gorulen = useRef(new Set(depo.oku(GORULEN_ANAHTAR, [])));
  const [calistir, bekliyor] = useIslem();

  useEffect(() => {
    let canli = true;
    const yokla = async () => {
      if (document.visibilityState !== 'visible') return;
      const v = await api('/api/davetler').catch(() => null);
      if (!canli || !v) return;
      const acik = new Set(v.duellolar.map((d) => d.id));
      const yeni = v.duellolar.filter((d) => !gorulen.current.has(d.id));
      // Kabul/red/süre dolanlar sıradan düşer.
      setSira((s) => [...s.filter((d) => acik.has(d.id)), ...yeni.filter((d) => !s.some((x) => x.id === d.id))]);
      if (yeni.length > 0) {
        for (const d of yeni) gorulen.current.add(d.id);
        depo.yaz(GORULEN_ANAHTAR, [...gorulen.current].slice(-GORULEN_SINIRI));
        davetSesi();
      }
    };
    yokla();
    const t = setInterval(yokla, YOKLAMA_MS);
    return () => {
      canli = false;
      clearInterval(t);
    };
  }, []);

  const d = sira[0] ?? null;
  const kapat = () => setSira((s) => s.slice(1));
  const o = d ? OYUNLAR[d.oyun] : null;
  const Ikon = o?.ikon ?? Swords;

  const gor = () => {
    kapat();
    git('sosyal', { sekme: 'duello' });
  };
  const reddet = () => calistir(async () => {
    await api(`/api/duello/${d.id}/reddet`, { govde: {} });
    bildirimGoster(`**${d.meydan.ad}** düellosunu reddettin.`, 'bilgi');
    kapat();
  });

  return (
    <Pencere acik={Boolean(d)} degisti={(a) => { if (!a) kapat(); }} baslik="Düello daveti" ikon={Swords} aciklama={sira.length > 1 ? `${sira.length} davet bekliyor` : undefined}>
      {d && (
        <div className="flex flex-col items-center gap-4 text-center">
          <Avatar uye={d.meydan} boyut={64} />
          <p className="text-base">
            <b>{d.meydan.ad}</b> seni <b className="inline-flex items-center gap-1"><Ikon className="size-4" />{o?.ad ?? d.oyun}</b> düellosuna çağırıyor.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-soluk">
            <span className="flex items-center gap-1">bahis <Muz miktar={d.bahis} boyut={16} className="font-semibold text-metin" /></span>
            <span className="flex items-center gap-1">kazanan <Muz miktar={d.kazanc} boyut={16} className="font-semibold text-metin" /></span>
          </div>
          <span className="text-xs text-soluk">Kalan <GeriSayim hedef={d.bitis} bitince="süresi doldu" onBitti={kapat} className="sayi text-metin" /></span>
          <div className="flex w-full gap-2">
            <Button tur="basari" boyut="lg" tam onClick={gor} disabled={bekliyor}><Swords />Düelloya git</Button>
            <Button tur="hayalet" boyut="lg" tam bekliyor={bekliyor} onClick={reddet}>Reddet</Button>
          </div>
        </div>
      )}
    </Pencere>
  );
}
