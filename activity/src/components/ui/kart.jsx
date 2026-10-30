import { cn } from '@/lib/utils.js';

/** Temel yüzey. `vurgu`: muz rengi çerçeve ve hafif parıltı. */
export function Kart({ className, vurgu = false, ...props }) {
  return <div className={cn('yuzey-kart p-5', vurgu && 'border-muz/40 shadow-parilti', className)} {...props} />;
}

/** Kart başlığı: ikon + başlık + açıklama, sağda isteğe bağlı eylem. */
export function KartBaslik({ ikon: Ikon, baslik, aciklama, sag, className }) {
  return (
    <div className={cn('mb-4 flex items-start gap-3', className)}>
      {Ikon && (
        <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-cizgi bg-yuzey-3 text-muz">
          <Ikon className="size-[18px]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-[17px] font-semibold leading-tight">{baslik}</h3>
        {aciklama && <p className="mt-0.5 text-[13px] text-soluk">{aciklama}</p>}
      </div>
      {sag && <div className="shrink-0">{sag}</div>}
    </div>
  );
}
