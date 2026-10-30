import { Check, Gift } from 'lucide-react';

import { HataKutusu } from '@/components/Durumlar.jsx';
import { Gorsel, NesneGorseli } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { nesne } from '@/lib/store.js';
import { bicim, cn } from '@/lib/utils.js';
import { konfeti } from './konfeti.js';

function SetKarti({ s, odulAl }) {
  const [calistir, bekliyor] = useIslem();
  return (
    <div className={cn('yuzey-kart flex flex-col gap-4 p-5', s.alinabilir && 'border-muz/40 shadow-parilti')}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{s.ad}</h3>
        <span className={cn('sayi text-sm font-medium', s.tamam ? 'text-yesil' : 'text-soluk')}>{s.sahip}/{s.toplam}</span>
      </div>
      <Ilerleme oran={s.sahip / s.toplam} renk={s.tamam ? 'var(--color-yesil)' : 'var(--color-muz)'} />
      <div className="flex flex-wrap gap-1.5">
        {s.kartlar.map((k) => (
          <span key={k.kimlik} title={nesne(k.kimlik)?.ad ?? k.kimlik} className={cn('grid size-9 place-items-center rounded-lg border border-cizgi bg-zemin/50', !k.sahip && 'opacity-30 grayscale')}>
            <NesneGorseli kimlik={k.kimlik} boyut={26} />
          </span>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-cizgi pt-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-silik">Ödül</span>
          <Muz miktar={s.odul.muz} boyut={16} />
          {s.odul.kasalar.map((k) => (
            <span key={k.kimlik} className="sayi inline-flex items-center gap-1 text-soluk" title={k.ad}>+{k.adet}<Gorsel g={k.gorsel} boyut={20} /></span>
          ))}
        </div>
        {s.alindi && <Rozet tur="yesil"><Check />Alındı</Rozet>}
        {!s.alindi && s.alinabilir && <Button tur="ana" boyut="sm" bekliyor={bekliyor} onClick={() => calistir(() => odulAl(s))}><Gift />Ödülü al</Button>}
      </div>
    </div>
  );
}

export function Setler({ yenileEnvanter }) {
  const {
    veri, hata, yenile,
  } = useApi('/api/setler');
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!veri) return <div className="grid gap-4 sm:grid-cols-2"><Iskelet className="h-52" /><Iskelet className="h-52" /></div>;

  const odulAl = async (s) => {
    const r = await api('/api/setler/odul', { govde: { set: s.kimlik } });
    const kasalar = r.odul.kasalar.map((k) => `${k.adet} × ${k.ad}`).join(', ');
    bildirimGoster(`**${r.set.ad}** seti tamamlandı. Ödül: **${bicim(r.odul.muz)}** muz${kasalar ? ` + ${kasalar}` : ''}`, 'basari');
    konfeti('efsanevi');
    await Promise.all([yenile({ sessiz: true }), yenileEnvanter({ sessiz: true })]);
  };
  const grup = (tur, baslik) => (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{baslik}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {veri.setler.filter((s) => s.tur === tur).map((s) => <SetKarti key={s.kimlik} s={s} odulAl={odulAl} />)}
      </div>
    </section>
  );
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-soluk">Bir sete ait her karttan en az birine sahip olunca ödülünü bir kez alırsın. <span className="sayi text-metin">{veri.alinan}/{veri.setler.length}</span> set ödülü alındı.</p>
      {grup('tema', 'Temalı setler')}
      {grup('nadirlik', 'Nadirlik setleri')}
    </div>
  );
}
