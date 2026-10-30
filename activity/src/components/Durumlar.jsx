import { CircleAlert, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Md } from '@/components/Md.jsx';
import { cn } from '@/lib/utils.js';

/** Ekran yüklenirken: kart biçiminde iskeletler. */
export function Yukleniyor({ satir = 3, className }) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Iskelet className="h-28" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: satir }, (_, i) => <Iskelet key={i} className="h-40" />)}
      </div>
    </div>
  );
}

export function HataKutusu({ hata, tekrar, className }) {
  return (
    <div className={cn('yuzey-kart flex flex-col items-center gap-3 border-kirmizi/30 p-8 text-center', className)}>
      <CircleAlert className="size-8 text-kirmizi" />
      <p className="max-w-md text-sm text-metin/90"><Md metin={hata?.message ?? String(hata)} /></p>
      {tekrar && <Button tur="ikincil" boyut="sm" onClick={tekrar}><RotateCw />Tekrar dene</Button>}
    </div>
  );
}

/** Boş liste/durum: büyük ikon, başlık, açıklama, isteğe bağlı eylem. */
export function Bos({
  ikon: Ikon, baslik, aciklama, eylem, className,
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      {Ikon && <div className="mb-1 grid size-12 place-items-center rounded-2xl border border-cizgi bg-yuzey-3 text-silik"><Ikon className="size-6" /></div>}
      <p className="font-display font-semibold">{baslik}</p>
      {aciklama && <p className="max-w-sm text-sm text-soluk">{aciklama}</p>}
      {eylem && <div className="mt-2">{eylem}</div>}
    </div>
  );
}
