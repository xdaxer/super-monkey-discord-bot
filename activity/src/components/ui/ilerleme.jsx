import { motion } from 'motion/react';

import { cn } from '@/lib/utils.js';

/** İlerleme çubuğu (0–1). `renk`: CSS rengi ya da var(--color-...). */
export function Ilerleme({ oran, renk = 'var(--color-muz)', className, yukseklik = 8 }) {
  const o = Math.max(0, Math.min(1, Number.isFinite(oran) ? oran : 0));
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-yuzey-3', className)} style={{ height: yukseklik }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: renk }}
        initial={{ width: 0 }}
        animate={{ width: `${o * 100}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  );
}
