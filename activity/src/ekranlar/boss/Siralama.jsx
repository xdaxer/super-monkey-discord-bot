import { Medal, Trophy } from 'lucide-react';

import { Avatar } from '@/components/Avatar.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { useUygulama } from '@/lib/store.js';
import { bicim, cn } from '@/lib/utils.js';

const MADALYA = ['text-muz', 'text-soluk', 'text-turuncu'];

function Sira({ sira }) {
  return sira <= 3
    ? <Medal className={cn('size-5', MADALYA[sira - 1])} />
    : <span className="sayi w-5 text-center text-sm text-silik">{sira}</span>;
}

function Satir({ sira, uye, hasar, en, ben }) {
  return (
    <li className={cn('flex flex-col gap-1.5 rounded-xl px-3 py-2.5', ben && 'border border-muz/40 bg-muz/[0.08]')}>
      <div className="flex items-center gap-3">
        <Sira sira={sira} />
        <Avatar uye={uye} boyut={28} />
        <span className={cn('min-w-0 flex-1 truncate font-medium', ben && 'text-muz')}>{uye?.ad}{ben ? ' (sen)' : ''}</span>
        <span className="sayi font-semibold">{bicim(hasar)}</span>
      </div>
      <Ilerleme oran={hasar / en} yukseklik={4} renk={ben ? 'var(--color-muz)' : 'var(--color-kirmizi-koyu)'} />
    </li>
  );
}

export default function Siralama({ veri }) {
  const kullanici = useUygulama((s) => s.kullanici);
  const liste = veri.siralama;
  const en = Math.max(1, ...liste.map((x) => x.hasar));
  const listede = liste.some((x) => x.uye.id === kullanici?.id);
  return (
    <Kart>
      <KartBaslik ikon={Trophy} baslik="Hasar sıralaması" aciklama={`${bicim(veri.ben.katilimci)} savaşçı katıldı`} />
      {liste.length === 0 ? (
        <p className="py-6 text-center text-sm text-soluk">Henüz kimse saldırmadı. İlk vuran sen ol!</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {liste.map((x) => <Satir key={x.uye.id} sira={x.sira} uye={x.uye} hasar={x.hasar} en={en} ben={x.uye.id === kullanici?.id} />)}
          {!listede && veri.ben.sira && (
            <>
              <li className="py-0.5 text-center text-silik" aria-hidden>···</li>
              <Satir sira={veri.ben.sira} uye={kullanici} hasar={veri.ben.hasar} en={en} ben />
            </>
          )}
        </ol>
      )}
    </Kart>
  );
}
