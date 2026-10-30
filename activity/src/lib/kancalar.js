import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api.js';
import { hataGoster } from '@/lib/bildirim.jsx';

/**
 * GET verisi: `const { veri, hata, yukleniyor, yenile, setVeri } = useApi('/api/banka', { aralik: 15000 })`.
 * `aralik` verilirse arka planda yoklar (sessiz; hata eski veriyi silmez).
 * `yol` null ise istek atılmaz.
 */
export function useApi(yol, { aralik = null } = {}) {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(Boolean(yol));
  const canli = useRef(true);

  const yenile = useCallback(async ({ sessiz = false } = {}) => {
    if (!yol) return null;
    if (!sessiz) setYukleniyor(true);
    try {
      const v = await api(yol);
      if (canli.current) {
        setVeri(v);
        setHata(null);
      }
      return v;
    } catch (e) {
      if (canli.current && !sessiz) setHata(e);
      return null;
    } finally {
      if (canli.current && !sessiz) setYukleniyor(false);
    }
  }, [yol]);

  useEffect(() => {
    canli.current = true;
    yenile();
    return () => { canli.current = false; };
  }, [yenile]);

  useEffect(() => {
    if (!aralik || !yol) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') yenile({ sessiz: true });
    }, aralik);
    return () => clearInterval(t);
  }, [aralik, yol, yenile]);

  return {
    veri, hata, yukleniyor, yenile, setVeri,
  };
}

/**
 * Medya sorgusu eşleşiyor mu (canlı): `const genis = useEslesme('(min-width: 1024px)')`.
 * Düzeni cihaz türüne değil eldeki alana göre seçmek için (HIG: boyut sınıfları).
 */
export function useEslesme(sorgu) {
  const [eslesme, setEslesme] = useState(() => window.matchMedia(sorgu).matches);
  useEffect(() => {
    const m = window.matchMedia(sorgu);
    const degisti = () => setEslesme(m.matches);
    degisti();
    m.addEventListener('change', degisti);
    return () => m.removeEventListener('change', degisti);
  }, [sorgu]);
  return eslesme;
}

/**
 * POST gibi işlemler: `const [calistir, bekliyor] = useIslem()`;
 * `const sonuc = await calistir(() => api('/api/x', { govde }))` — hata
 * olursa bildirim gösterir ve `undefined` döner. Aynı anda ikinci çağrı yok sayılır.
 */
export function useIslem() {
  const [bekliyor, setBekliyor] = useState(false);
  const kilit = useRef(false);
  const calistir = useCallback(async (fn) => {
    if (kilit.current) return undefined;
    kilit.current = true;
    setBekliyor(true);
    try {
      return await fn();
    } catch (e) {
      hataGoster(e);
      return undefined;
    } finally {
      kilit.current = false;
      setBekliyor(false);
    }
  }, []);
  return [calistir, bekliyor];
}
