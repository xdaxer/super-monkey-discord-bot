import { cva } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/utils.js';

/*
 * Boyutlar dokunmatik ekranda (pointer-coarse) HIG'in 44 pt dokunma hedefine
 * büyür; farede masaüstü yoğunluğu korunur. Basılınca hafifçe küçülür.
 */
export const dugmeStili = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background,color,box-shadow,transform,filter] duration-150 active:scale-[0.97] active:brightness-95 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      tur: {
        ana: 'bg-muz text-muz-metin shadow-[0_1px_0_0_rgb(255_255_255/0.4)_inset,0_6px_20px_-8px_rgb(255_212_59/0.6)] hover:bg-muz-acik',
        ikincil: 'border border-cizgi bg-yuzey-3 text-metin hover:border-cizgi-guclu hover:bg-[#2d2a24]',
        hayalet: 'text-soluk hover:bg-yuzey-3 hover:text-metin',
        cizgili: 'border border-cizgi-guclu bg-transparent text-metin hover:bg-yuzey-3',
        basari: 'bg-yesil text-zemin hover:brightness-110',
        tehlike: 'bg-kirmizi-koyu text-white hover:bg-kirmizi',
      },
      boyut: {
        sm: 'h-8 px-3 text-[13px] pointer-coarse:h-10',
        md: 'h-10 px-4 text-sm pointer-coarse:h-11',
        lg: 'h-12 px-6 text-base',
        ikon: 'size-9 pointer-coarse:size-11',
      },
      tam: { true: 'w-full' },
    },
    defaultVariants: { tur: 'ikincil', boyut: 'md' },
  },
);

/** Düğme. `bekliyor`: içerik yerine dönen simge, tıklanmaz. */
export function Button({
  className, tur, boyut, tam, bekliyor = false, disabled, children, ...props
}) {
  return (
    <button type="button" className={cn(dugmeStili({ tur, boyut, tam }), className)} disabled={disabled || bekliyor} aria-busy={bekliyor || undefined} {...props}>
      {bekliyor && <LoaderCircle className="absolute animate-spin" />}
      <span className={cn('inline-flex items-center gap-2', bekliyor && 'invisible')}>{children}</span>
    </button>
  );
}
