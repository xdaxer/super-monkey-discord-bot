import { cn } from '@/lib/utils.js';

/* Dokunmatikte 44 px yükseklik ve 16 px yazı: iOS 16 px altındaki alana odaklanınca sayfayı yakınlaştırır. */
export const girisSinifi = 'h-10 w-full rounded-xl border border-cizgi-guclu bg-zemin/60 px-3 text-sm text-metin placeholder:text-silik transition-colors focus:border-muz/60 focus:outline-none focus:ring-2 focus:ring-muz/20 pointer-coarse:h-11 pointer-coarse:text-base';

export function Giris({ className, ...props }) {
  return <input className={cn(girisSinifi, className)} {...props} />;
}

/** Etiketli alan. */
export function Alan({ etiket, ipucu, children, className }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium text-soluk">{etiket}</span>
      {children}
      {ipucu && <span className="text-xs text-silik">{ipucu}</span>}
    </label>
  );
}
