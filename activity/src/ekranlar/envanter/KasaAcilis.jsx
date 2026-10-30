import { nadirlikRengi } from '../magaza/nadirlikRenk.js';
import * as Dialog from '@radix-ui/react-dialog';
import { animate, motion, useMotionValue } from 'motion/react';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Gorsel, NesneGorseli } from '@/components/Gorsel.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { hataGoster } from '@/lib/bildirim.jsx';
import { bakiyeGuncelle, useUygulama } from '@/lib/store.js';
import { GarantiYazisi } from './GarantiYazisi.jsx';
import { konfeti } from './konfeti.js';
import { SonucKarti } from './SonucKarti.jsx';

const HEDEF = 36;
const SURE = 4.2;

function SeritOgesi({ o }) {
  const para = useUygulama((s) => s.katalog?.para);
  const renk = nadirlikRengi(o.nadirlik);
  return (
    <div
      className="relative grid size-[88px] shrink-0 place-items-center overflow-hidden rounded-xl border border-cizgi bg-yuzey-2 sm:size-[112px]"
      style={{ background: `linear-gradient(0deg, color-mix(in srgb, ${renk} 24%, transparent), transparent 60%), var(--color-yuzey-2)` }}
    >
      {o.tur === 'para' ? <Gorsel g={para} boyut={48} /> : <NesneGorseli kimlik={o.kimlik} boyut={52} />}
      <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: renk }} />
    </div>
  );
}

function Serit({ ogeler, onBitti, atlaRef }) {
  const x = useMotionValue(0);
  const kap = useRef(null);
  const iz = useRef(null);
  useEffect(() => {
    const hedef = iz.current.children[HEDEF];
    const merkez = hedef.offsetLeft + hedef.offsetWidth / 2;
    const sapma = (Math.random() - 0.5) * hedef.offsetWidth * 0.6;
    const son = -(merkez - kap.current.clientWidth / 2 + sapma);
    const azalt = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let bitti = false;
    const bitir = () => { if (!bitti) { bitti = true; onBitti(); } };
    const anim = animate(x, son, { duration: azalt ? 0.05 : SURE, ease: [0.08, 0.55, 0.12, 1], onComplete: bitir });
    atlaRef.current = () => { anim.stop(); x.set(son); bitir(); };
    return () => anim.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative w-full">
      <div ref={kap} className="w-full overflow-hidden py-3 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <motion.div ref={iz} style={{ x }} className="relative flex w-max gap-2">
          {ogeler.map((o, i) => <SeritOgesi key={i} o={o} />)}
        </motion.div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-muz shadow-[0_0_12px_var(--color-muz)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 border-x-[7px] border-t-[9px] border-x-transparent border-t-muz" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 border-x-[7px] border-b-[9px] border-x-transparent border-b-muz" />
    </div>
  );
}

/** Tek kasa açılışı: tam ekran sahne, kayan şerit, ödül kartı. */
export function KasaAcilis({ kasa, kapat }) {
  const [asama, setAsama] = useState('yukleniyor');
  const [r, setR] = useState(null);
  const [tur, setTur] = useState(0);
  const atla = useRef(null);
  const bakiye = useRef(null);

  const ac = useCallback(async () => {
    setAsama('yukleniyor');
    setR(null);
    try {
      const y = await api('/api/kasa/ac', { govde: { kasa: kasa.kimlik, adet: 1 }, bakiyeErtele: true });
      bakiye.current = y.bakiye;
      setR(y);
      setTur((t) => t + 1);
      setAsama('donuyor');
    } catch (e) {
      hataGoster(e);
      kapat();
    }
  }, [kasa.kimlik]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { ac(); }, [ac]);
  useEffect(() => () => { if (bakiye.current !== null) bakiyeGuncelle(bakiye.current); }, []);

  const s = r?.sonuclar[0];
  const ogeler = r && (() => {
    const l = r.serit.map((o, i) => (i === HEDEF
      ? { tur: s.tur === 'muz' ? 'para' : s.tur, kimlik: s.kimlik, nadirlik: s.nadirlik }
      : o));
    return [...l, ...l.slice(0, 12)];
  })();

  // Şeritteki görseller tembel yüklenir; kaymadan önce önbelleğe al.
  useEffect(() => {
    if (!ogeler) return;
    const k = useUygulama.getState().katalog;
    for (const o of ogeler) {
      const u = (o.tur === 'para' ? k.para : (k.kartlarHarita.get(o.kimlik) ?? k.esyalarHarita.get(o.kimlik))?.gorsel)?.url;
      if (u) new Image().src = u;
    }
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps

  const bitti = () => {
    setAsama('sonuc');
    if (bakiye.current !== null) bakiyeGuncelle(bakiye.current);
    konfeti(s?.nadirlik);
  };

  return (
    <Dialog.Root open onOpenChange={(a) => { if (!a) kapat(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-zemin/95 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto px-4 pb-[calc(var(--saib)+1rem)] pt-[calc(var(--sait)+1rem)] outline-none">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,var(--color-yuzey-3),transparent_65%)] opacity-60" />
          <Dialog.Close className="absolute right-4 top-[calc(var(--sait)+1rem)] grid size-11 place-items-center rounded-full bg-yuzey-3/80 text-soluk transition-colors hover:bg-yuzey-3 hover:text-metin" aria-label="Kapat"><X className="size-5" /></Dialog.Close>
          <div className="relative flex flex-col items-center gap-1 text-center">
            <Dialog.Title className="font-display text-2xl font-bold">{kasa.ad}</Dialog.Title>
            <Dialog.Description className="text-sm text-soluk">
              {asama === 'sonuc' ? (r.kalan > 0 ? `Envanterinde ${r.kalan} kasa daha var` : 'Bu kasadan kalmadı') : 'Kasa açılıyor'}
            </Dialog.Description>
            {asama === 'sonuc' && r.garanti && <p className="text-xs"><GarantiYazisi g={r.garanti} /></p>}
          </div>

          <div className="relative flex min-h-[300px] w-full max-w-5xl flex-col items-center justify-center gap-6">
            {asama === 'yukleniyor' && <div className="animate-parla"><Gorsel g={kasa.gorsel} boyut={72} /></div>}
            {asama === 'donuyor' && ogeler && (
              <>
                <button type="button" className="w-full cursor-pointer" onClick={() => atla.current?.()} aria-label="Atla">
                  <Serit key={tur} ogeler={ogeler} onBitti={bitti} atlaRef={atla} />
                </button>
                <p className="text-xs text-silik">Atlamak için şeride dokun</p>
              </>
            )}
            {asama === 'sonuc' && s && (
              <>
                <SonucKarti key={tur} s={s} buyuk />
                {s.tur === 'kart' && <p className="text-xs text-soluk">Koleksiyon: <span className="sayi">{r.koleksiyon.farkli}/{r.koleksiyon.toplam}</span></p>}
                <div className="flex flex-wrap justify-center gap-3">
                  <Button tur="ana" boyut="lg" disabled={r.kalan <= 0} onClick={ac}>{r.kalan > 0 ? `Bir tane daha aç (${r.kalan})` : 'Kasa kalmadı'}</Button>
                  <Button tur="ikincil" boyut="lg" onClick={kapat}>Kapat</Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
