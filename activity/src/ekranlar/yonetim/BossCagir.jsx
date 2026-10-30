import { Dices, Skull, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { cn } from '@/lib/utils.js';

const ELIT_SECENEKLERI = [
  { deger: null, ad: 'Rastgele', alt: '%15 şansla elit' },
  { deger: false, ad: 'Normal', alt: '' },
  { deger: true, ad: 'Elit', alt: '1,6x can, 1,4x ödül' },
];

export default function BossCagir({ veri, yenile }) {
  const [boss, setBoss] = useState(null);
  const [elit, setElit] = useState(null);
  const [calistir, bekliyor] = useIslem();
  const engel = veri.aktifBoss ? 'aktif' : !veri.bossKanalAyarli ? 'kanal' : null;

  const cagir = () => calistir(async () => {
    const govde = {};
    if (boss) govde.boss = boss;
    if (elit !== null) govde.elit = elit;
    const r = await api('/api/yonetim/boss', { govde });
    bildirimGoster(`Boss çağrıldı${r.elit ? ' (elit)' : ''}. Mesaj boss kanalına gönderildi.`, 'basari');
    await yenile();
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {engel === 'aktif' && (
        <div className="flex items-center gap-3 rounded-2xl border border-muz/30 bg-muz/[0.06] p-4 text-sm">
          <Skull className="size-5 shrink-0 text-muz" />
          <span>Şu an aktif bir boss var; bitmeden yenisi çağrılamaz. Kalan süre: <b className="sayi"><GeriSayim hedef={veri.aktifBoss.bitis} /></b></span>
        </div>
      )}
      {engel === 'kanal' && (
        <div className="flex items-start gap-3 rounded-2xl border border-kirmizi/30 bg-kirmizi/[0.06] p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-kirmizi" />
          <span>Boss kanalı ayarlı değil. Discord&apos;da <code className="rounded bg-yuzey-3 px-1.5 py-0.5 text-xs">/ayar ayarla anahtar:boss.kanal</code> ile kanal seç.</span>
        </div>
      )}
      <Kart>
        <KartBaslik ikon={Skull} baslik="Boss çağır" aciklama="Hemen bir boss çıkarır (test ya da etkinlik için)." />
        <div className="flex flex-col gap-5">
          <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              type="button"
              role="radio"
              aria-checked={boss === null}
              onClick={() => setBoss(null)}
              className={cn('secim flex min-w-0 flex-col items-center gap-2 rounded-2xl border p-3 transition-colors', boss === null ? 'border-muz/60 bg-muz/[0.08]' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
            >
              <span className="grid size-12 place-items-center rounded-xl bg-yuzey-3 text-soluk"><Dices className="size-6" /></span>
              <span className="text-sm font-medium">Rastgele</span>
            </button>
            {veri.bosslar.map((x) => (
              <button
                key={x.kimlik}
                type="button"
                role="radio"
                aria-checked={boss === x.kimlik}
                onClick={() => setBoss(x.kimlik)}
                className={cn('secim flex min-w-0 flex-col items-center gap-2 rounded-2xl border p-3 transition-colors', boss === x.kimlik ? 'border-muz/60 bg-muz/[0.08]' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
              >
                <Gorsel g={x.gorsel} boyut={48} />
                <span className="max-w-full truncate text-sm font-medium">{x.ad}</span>
              </button>
            ))}
          </div>

          <div role="radiogroup" className="grid grid-cols-3 gap-2">
            {ELIT_SECENEKLERI.map((o) => (
              <button
                key={o.ad}
                type="button"
                role="radio"
                aria-checked={elit === o.deger}
                onClick={() => setElit(o.deger)}
                className={cn('secim flex flex-col gap-0.5 rounded-xl border p-3 text-left transition-colors', elit === o.deger ? 'border-muz/60 bg-muz/[0.08]' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">{o.ad}</span>
                <span className="text-[11px] leading-tight text-silik">{o.alt || ' '}</span>
              </button>
            ))}
          </div>

          <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} disabled={Boolean(engel)} onClick={cagir}><Skull />Boss çağır</Button>
        </div>
      </Kart>
    </div>
  );
}
