import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api.js';
import { bakiyeGuncelle } from '@/lib/store.js';

const YOKLAMA_MS = 5000;

/** Listelerin kimlikleri: değişince son hareketler de tazelenir. */
const imzaOlustur = (v) => JSON.stringify([
  v.duello.gelen.map((d) => d.id), v.duello.giden.map((d) => d.id),
  v.xoxlar.map((o) => o.id), v.takas.gelen.map((x) => x.id), v.takas.giden.map((x) => x.id),
]);

/**
 * /api/sosyal'i 5 sn'de bir sessiz yoklar. Üst çubuk bakiyesi, sonuç animasyonu
 * sürerken (`beklet(true)`) güncellenmez ki sonuç erkenden belli olmasın.
 */
export function useSosyal() {
  const [veri, setVeri] = useState(null);
  const [gecmis, setGecmis] = useState(null);
  const [hata, setHata] = useState(null);
  const bekliyor = useRef(false);
  const imza = useRef('');
  const canli = useRef(true);
  const varVeri = useRef(false);

  const yenile = useCallback(async () => {
    try {
      const v = await api('/api/sosyal', { bakiyeErtele: true });
      if (!canli.current) return;
      varVeri.current = true;
      setVeri(v);
      setHata(null);
      if (!bekliyor.current) bakiyeGuncelle(v.bakiye);
      const yeni = imzaOlustur(v);
      if (yeni !== imza.current) {
        imza.current = yeni;
        const g = await api('/api/sosyal/gecmis', { bakiyeErtele: true }).catch(() => null);
        if (g && canli.current) setGecmis(g);
      }
    } catch (e) {
      if (canli.current && !varVeri.current) setHata(e);
    }
  }, []);

  useEffect(() => {
    canli.current = true;
    yenile();
    const t = setInterval(() => { if (document.visibilityState === 'visible') yenile(); }, YOKLAMA_MS);
    return () => { canli.current = false; clearInterval(t); };
  }, [yenile]);

  const beklet = useCallback((b) => { bekliyor.current = b; }, []);
  return {
    veri, gecmis, hata, yenile, beklet,
  };
}
