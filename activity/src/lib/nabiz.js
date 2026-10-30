/**
 * Arayüz nabzı (app/lib/arayuz-sure.js): sekme görünür ve son 5 dk içinde
 * etkileşim varken dakikada bir `/api/nabiz` atar; süreyi sunucu ölçer.
 * Sekme gizlenirken son bir nabız gider ki kısa ziyaretler de sayılsın.
 * Yalnız yönetici panelinde görünür; hata sessizce yutulur.
 */

import { useEffect, useRef } from 'react';

import { api } from '@/lib/api.js';

const NABIZ_MS = 60_000;
const BOSTA_MS = 5 * 60_000;
const OLAYLAR = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

export function useNabiz(ekran) {
  const ekranRef = useRef(ekran);
  ekranRef.current = ekran;

  useEffect(() => {
    let sonEtkilesim = Date.now();
    const etkilesim = () => { sonEtkilesim = Date.now(); };
    const at = ({ keepalive = false } = {}) => {
      if (Date.now() - sonEtkilesim > BOSTA_MS) return;
      api('/api/nabiz', { govde: { ekran: ekranRef.current }, keepalive }).catch(() => {});
    };
    const gorunurluk = () => {
      if (document.visibilityState === 'visible') {
        etkilesim();
        at();
      } else {
        at({ keepalive: true });
      }
    };

    at();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') at();
    }, NABIZ_MS);
    for (const o of OLAYLAR) window.addEventListener(o, etkilesim, { passive: true });
    document.addEventListener('visibilitychange', gorunurluk);
    return () => {
      clearInterval(t);
      for (const o of OLAYLAR) window.removeEventListener(o, etkilesim);
      document.removeEventListener('visibilitychange', gorunurluk);
    };
  }, []);
}
