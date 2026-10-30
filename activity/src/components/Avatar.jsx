import { useState } from 'react';

import { cn } from '@/lib/utils.js';

/** Üye avatarı (/api/avatar); yüklenemezse adın baş harfi. */
export function Avatar({ uye, boyut = 32, className }) {
  const [hata, setHata] = useState(false);
  const harf = (uye?.ad ?? '?').trim().charAt(0).toLocaleUpperCase('tr-TR');
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-yuzey-3 font-display text-soluk ring-1 ring-cizgi', className)} style={{ width: boyut, height: boyut, fontSize: boyut * 0.42 }}>
      {uye?.avatar && !hata
        ? <img src={uye.avatar} alt="" className="size-full object-cover" onError={() => setHata(true)} />
        : harf}
    </span>
  );
}
