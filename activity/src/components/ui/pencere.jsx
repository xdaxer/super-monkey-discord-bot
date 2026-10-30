import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef } from 'react';

import { cn } from '@/lib/utils.js';

/** Bu kadar aşağı çekilen (ya da hızla fırlatılan) sayfa kapanır. */
const KAPATMA_ESIGI = 110;
const KAPATMA_HIZI = 0.6;

/**
 * Dar ekranda sayfayı tutamaktan/başlıktan aşağı çekip kapatma (iOS sayfası).
 * Geniş ekranda (sm ve üstü) pencere ortadadır, çekme kapalı.
 */
function useCekerekKapat(kapat) {
  const icerik = useRef(null);
  const cekim = useRef(null);

  const birak = (dy, hiz) => {
    const el = icerik.current;
    cekim.current = null;
    if (!el) return;
    if (dy > KAPATMA_ESIGI || hiz > KAPATMA_HIZI) {
      kapat();
      return;
    }
    el.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
    el.style.transform = '';
  };

  return {
    icerik,
    tutamak: {
      onPointerDown: (e) => {
        if (window.matchMedia('(min-width: 640px)').matches || e.button !== 0) return;
        if (e.target.closest('button')) return;
        cekim.current = { y: e.clientY, zaman: performance.now(), dy: 0 };
        e.currentTarget.setPointerCapture(e.pointerId);
        if (icerik.current) icerik.current.style.transition = 'none';
      },
      onPointerMove: (e) => {
        const c = cekim.current;
        if (!c || !icerik.current) return;
        c.dy = Math.max(0, e.clientY - c.y);
        icerik.current.style.transform = `translateY(${c.dy}px)`;
      },
      onPointerUp: () => {
        const c = cekim.current;
        if (!c) return;
        birak(c.dy, c.dy / Math.max(1, performance.now() - c.zaman));
      },
      onPointerCancel: () => birak(0, 0),
    },
  };
}

/**
 * Pencere (modal). Denetimli: <Pencere acik={a} degisti={setA} baslik="..." aciklama="...">...</Pencere>
 * `genis`: geniş içerik (kasa olasılıkları, grafik). `ikon`: başlığın önünde (Lucide bileşeni).
 *
 * HIG "Sheets": dar ekranda alttan çıkan sayfa (tutamak, aşağı çekince kapanır,
 * alt güvenli alanı bırakır); geniş ekranda ortada pencere. Kapat düğmesi her
 * zaman görünür, Esc ve dışarı dokunma da kapatır.
 */
export function Pencere({
  acik, degisti, baslik, aciklama, children, genis = false, className, ikon: Ikon,
}) {
  const { icerik, tutamak } = useCekerekKapat(() => degisti(false));
  return (
    <Dialog.Root open={acik} onOpenChange={degisti}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px] data-[state=closed]:animate-solukla data-[state=open]:animate-belir" />
        <Dialog.Content
          ref={icerik}
          className={cn(
            'yuzey-kart fixed z-50 flex flex-col overflow-hidden p-0 shadow-2xl outline-none',
            // Dar: alttan sayfa
            'inset-x-0 bottom-0 max-h-[calc(100dvh-var(--sait)-16px)] rounded-b-none border-b-0 pb-[var(--saib)] data-[state=closed]:animate-sayfa-cik data-[state=open]:animate-sayfa-gel',
            // Geniş: ortada pencere
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-b-[var(--radius-kart)] sm:border-b sm:pb-0 sm:data-[state=closed]:animate-solukla sm:data-[state=open]:animate-yukari',
            genis ? 'sm:max-w-3xl' : 'sm:max-w-md',
            className,
          )}
        >
          <div className="touch-none select-none sm:touch-auto sm:select-auto" {...tutamak}>
            <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-cizgi-guclu" />
            </div>
            <div className="flex items-start gap-3 border-b border-cizgi px-5 pb-3.5 pt-2.5 sm:py-4">
              <div className="min-w-0 flex-1 pt-0.5">
                <Dialog.Title className="flex items-center gap-2 font-display text-lg font-semibold leading-snug">
                  {Ikon && <Ikon className="size-5 shrink-0 text-muz" aria-hidden />}
                  {baslik}
                </Dialog.Title>
                {aciklama ? <Dialog.Description className="mt-0.5 text-[13px] text-soluk">{aciklama}</Dialog.Description> : <Dialog.Description className="sr-only">{baslik}</Dialog.Description>}
              </div>
              <Dialog.Close className="relative -mr-1 grid size-8 shrink-0 place-items-center rounded-full before:absolute before:-inset-1.5 bg-yuzey-3 text-soluk transition-colors hover:bg-cizgi hover:text-metin active:scale-95 pointer-coarse:size-9" aria-label="Kapat">
                <X className="size-4" strokeWidth={2.5} />
              </Dialog.Close>
            </div>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
