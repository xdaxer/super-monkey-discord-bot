import { Circle, CircleCheck, Clock, Gift } from 'lucide-react';

import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Md } from '@/components/Md.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { bicim, cn } from '@/lib/utils.js';
import { OdulRozeti } from './ortak.jsx';

function Gorev({ g }) {
  return (
    <li className={cn('flex flex-col gap-2.5 rounded-xl border p-3.5', g.bitti ? 'border-yesil/25 bg-yesil/[0.05]' : 'border-cizgi bg-zemin/30')}>
      <div className="flex items-start gap-3">
        {g.bitti ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-yesil" /> : <Circle className="mt-0.5 size-5 shrink-0 text-silik" />}
        <p className={cn('min-w-0 flex-1 text-sm font-medium', g.bitti && 'text-soluk')}><Md metin={g.ad} /></p>
        <OdulRozeti odul={g.odul} />
      </div>
      <div className="flex items-center gap-3 pl-8">
        <Ilerleme oran={g.ilerleme / g.hedef} renk={g.bitti ? 'var(--color-yesil)' : 'var(--color-muz)'} yukseklik={6} />
        <span className="sayi shrink-0 text-xs text-soluk">{bicim(g.ilerleme)} / {bicim(g.hedef)}</span>
      </div>
    </li>
  );
}

export function DonemKarti({ baslik, aciklama, donem, yenile, bonus }) {
  return (
    <Kart className="flex flex-col gap-4">
      <KartBaslik
        ikon={Clock}
        baslik={baslik}
        aciklama={aciklama}
        className="mb-0"
        sag={<Rozet><Clock />{<GeriSayim hedef={donem.bitis} bitince="şimdi" onBitti={yenile} className="sayi" />}</Rozet>}
      />
      <ul className="flex flex-col gap-2.5">{donem.gorevler.map((g) => <Gorev key={g.kimlik} g={g} />)}</ul>
      {bonus && (
        <div className={cn('flex items-center gap-3 rounded-xl border border-dashed p-3.5', bonus.alindi ? 'border-yesil/40 bg-yesil/[0.05]' : 'border-muz/30 bg-muz/[0.05]')}>
          <Gift className={cn('size-5 shrink-0', bonus.alindi ? 'text-yesil' : 'text-muz')} />
          <p className="min-w-0 flex-1 text-sm">
            {bonus.alindi ? 'Hepsini bitirdin, bonus verildi' : `Hepsini bitir, bonus kazan (${bonus.biten}/${bonus.toplam})`}
          </p>
          <OdulRozeti odul={bonus.odul} />
        </div>
      )}
    </Kart>
  );
}
