import { useEffect, useRef, useState } from 'react';

import { sure } from '@/lib/utils.js';

/** Her `aralik` ms'de yeniden çizilen şimdiki zaman. */
export function useSimdi(aralik = 1000) {
  const [simdi, setSimdi] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setSimdi(Date.now()), aralik);
    return () => clearInterval(t);
  }, [aralik]);
  return simdi;
}

/** "2 sa 5 dk" geri sayımı; bitince `bitince` metni ve bir kez `onBitti`. */
export function GeriSayim({ hedef, bitince = 'şimdi', onBitti, className }) {
  const simdi = useSimdi();
  const bitti = useRef(false);
  const kalan = (hedef ?? 0) - simdi;
  useEffect(() => {
    if (kalan <= 0 && !bitti.current && hedef) {
      bitti.current = true;
      onBitti?.();
    }
    if (kalan > 0) bitti.current = false;
  }, [kalan, hedef, onBitti]);
  return <span className={className}>{kalan > 0 ? sure(kalan) : bitince}</span>;
}
