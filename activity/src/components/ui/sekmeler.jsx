import * as Tabs from '@radix-ui/react-tabs';
import { useEffect, useRef } from 'react';

import { YeniEtiketi } from '@/components/YeniEtiketi.jsx';
import { cn } from '@/lib/utils.js';

/**
 * Sekmeler (HIG bölümlü denetim). Dar ekranda az sekme eşit genişlikte yayılır;
 * sığmayanlar yana kayar ve seçili sekme hep görünür alana getirilir.
 * Kullanım:
 *   <Sekmeler deger={s} degisti={setS} liste={[{deger:'a', ad:'A', ikon: Coins, yeni: true}]}>
 *     <SekmeIcerik deger="a">...</SekmeIcerik>
 *   </Sekmeler>
 */
export function Sekmeler({
  deger, degisti, liste, children, className, listeSinifi,
}) {
  const listeRef = useRef(null);
  useEffect(() => {
    listeRef.current?.querySelector('[data-state="active"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [deger]);
  return (
    <Tabs.Root value={deger} onValueChange={degisti} className={cn('flex flex-col gap-4', className)}>
      <Tabs.List ref={listeRef} className={cn('flex w-full gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-cizgi bg-yuzey p-1 sm:w-fit sm:flex-wrap pointer-coarse:[scrollbar-width:none]', listeSinifi)}>
        {liste.map(({
          deger: d, ad, ikon: Ikon, rozet, yeni,
        }) => (
          <Tabs.Trigger
            key={d}
            value={d}
            // Radix fareyle tıklamada da focus() çağırıyor ve odak halkası beliriyor;
            // halka yalnız klavyede görünsün diye fare tıklamasını burada karşılıyoruz.
            onMouseDown={(e) => {
              if (e.button !== 0 || e.ctrlKey) return;
              e.preventDefault();
              degisti(d);
            }}
            className="flex min-h-9 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 sm:flex-none text-sm font-medium text-soluk transition-colors hover:text-metin data-[state=active]:bg-yuzey-3 data-[state=active]:text-metin data-[state=active]:shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset,0_1px_3px_rgb(0_0_0/0.4)] pointer-coarse:min-h-11 [&_svg]:size-4 data-[state=active]:[&_svg]:text-muz"
          >
            {Ikon && <Ikon />}
            {ad}
            {rozet}
            {yeni && <YeniEtiketi />}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

export function SekmeIcerik({ deger, className, ...props }) {
  return <Tabs.Content value={deger} className={cn('animate-yukari outline-none', className)} {...props} />;
}
