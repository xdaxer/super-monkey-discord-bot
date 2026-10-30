import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils.js';

const rozetStili = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3', {
  variants: {
    tur: {
      notr: 'bg-yuzey-3 text-soluk ring-1 ring-cizgi',
      muz: 'bg-muz/15 text-muz ring-1 ring-muz/30',
      yesil: 'bg-yesil/12 text-yesil ring-1 ring-yesil/25',
      kirmizi: 'bg-kirmizi/12 text-kirmizi ring-1 ring-kirmizi/25',
      mavi: 'bg-mavi/12 text-mavi ring-1 ring-mavi/25',
      mor: 'bg-mor/12 text-mor ring-1 ring-mor/25',
    },
  },
  defaultVariants: { tur: 'notr' },
});

export function Rozet({ className, tur, ...props }) {
  return <span className={cn(rozetStili({ tur }), className)} {...props} />;
}
