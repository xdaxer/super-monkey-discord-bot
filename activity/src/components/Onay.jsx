import { AlertTriangle } from 'lucide-react';
import { create } from 'zustand';

import { Button } from '@/components/ui/button.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Md } from '@/components/Md.jsx';

const useOnayDurumu = create(() => ({ istek: null }));

/**
 * Onay sor (her yerden): `if (await onayIste({ baslik, metin, evet, tehlikeli })) ...`
 * `metin` markdown ya da React düğümü olabilir.
 */
export function onayIste({
  baslik, metin, evet = 'Onayla', hayir = 'Vazgeç', tehlikeli = false,
}) {
  return new Promise((coz) => {
    useOnayDurumu.setState({
      istek: {
        baslik, metin, evet, hayir, tehlikeli, coz,
      },
    });
  });
}

/** App kökünde bir kez çizilir. */
export function OnayKatmani() {
  const istek = useOnayDurumu((s) => s.istek);
  const bitir = (sonuc) => {
    istek?.coz(sonuc);
    useOnayDurumu.setState({ istek: null });
  };
  return (
    <Pencere acik={Boolean(istek)} degisti={(a) => { if (!a) bitir(false); }} baslik={istek?.baslik ?? ''}>
      {istek && (
        <div className="flex flex-col gap-5">
          <div className="flex gap-3">
            {istek.tehlikeli && <AlertTriangle className="mt-0.5 size-5 shrink-0 text-kirmizi" />}
            <div className="text-sm leading-relaxed text-metin/90">{typeof istek.metin === 'string' ? <Md metin={istek.metin} /> : istek.metin}</div>
          </div>
          <div className="flex justify-end gap-2">
            <Button tur="hayalet" onClick={() => bitir(false)}>{istek.hayir}</Button>
            <Button tur={istek.tehlikeli ? 'tehlike' : 'ana'} onClick={() => bitir(true)}>{istek.evet}</Button>
          </div>
        </div>
      )}
    </Pencere>
  );
}
