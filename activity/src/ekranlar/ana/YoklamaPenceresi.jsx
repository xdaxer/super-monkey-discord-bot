import { ClipboardCheck, Hourglass } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { GeriSayim, useSimdi } from '@/components/GeriSayim.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { EmojiIkon } from '@/lib/emoji.jsx';
import { cn } from '@/lib/utils.js';

/** Seçenekler belirdikten sonra bu kadar tıklama sayılmaz (çalış düğmesine basılı kalan tık yanlışlıkla seçmesin). */
const HAZIRLIK_MS = 700;

/**
 * Ustabaşı yoklaması (sunucu: lib/calis-yoklama.js). Çalışma, istenen maymun
 * seçilene kadar durur; pencere kapatılamaz ve arkadaki uygulama `inert` olur.
 * Seçenekler her yoklamada karışık gelir; doğruyu yalnız sunucu bilir.
 * Seçenek dışına (ya da hazır olmadan) yapılan tıklar `bosTik` olarak
 * cevapla birlikte gider: yönetim panelinde makro izi.
 *
 * Yanlış cevaptan sonra yeni yoklama `kalanMs` boyunca kilitli gelir. Süre
 * kuruluşta yerel saate çevrilir (üyenin saati sunucuyla aynı olmayabilir);
 * her yoklama `key={id}` ile yeni bileşendir.
 */
export function YoklamaPenceresi({ yoklama, cevapla, bekliyor }) {
  const simdi = useSimdi(100);
  const kurulus = useRef(Date.now());
  const acilis = useRef(kurulus.current + yoklama.kalanMs).current;
  const bosTik = useRef(0);
  const kilitli = acilis > simdi;
  const hazir = !kilitli && simdi >= acilis + HAZIRLIK_MS;

  useEffect(() => {
    const kok = document.getElementById('uygulama');
    if (kok) kok.inert = true;
    return () => {
      if (kok) kok.inert = false;
    };
  }, []);

  const sec = (kimlik) => {
    if (!hazir || bekliyor) {
      bosTik.current += 1;
      return;
    }
    cevapla(kimlik, bosTik.current);
    bosTik.current = 0;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[900] grid place-items-center bg-zemin/80 p-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="yoklama-baslik"
      onPointerDown={(e) => {
        if (!e.target.closest('[data-secenek]')) bosTik.current += 1;
      }}
    >
      <div className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-muz/35 bg-yuzey p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* Ustabaşı: baretli Mühendis Maymun; yanlış cevaptan sonra kızgın. */}
          <span className="grid size-16 place-items-center rounded-2xl bg-muz/15 text-muz">
            <EmojiIkon btd={kilitli ? 'btd_angry' : 'btd_engineer'} yedek={ClipboardCheck} boyut={48} />
          </span>
          <h2 id="yoklama-baslik" className="font-display text-2xl font-bold">Ustabaşı yoklaması</h2>
          {kilitli ? (
            <p className="text-sm text-soluk">Yanlış maymunu gösterdin, ustabaşı kızdı. Biraz sonra yeniden soracak.</p>
          ) : (
            <p className="text-sm text-soluk">
              Ustabaşı mesaide kim var diye bakıyor. Hangisi <b className="text-metin">{yoklama.hedef}</b>?
            </p>
          )}
        </div>

        {kilitli ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-cizgi bg-zemin/40 p-4 text-sm">
            <Hourglass className="size-4 text-soluk" />
            <GeriSayim hedef={acilis} bitince="şimdi" className="sayi font-medium" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: HAZIRLIK_MS / 1000 }}
            className="grid grid-cols-3 gap-2"
          >
            {yoklama.secenekler.map((s) => (
              <button
                key={s.kimlik}
                type="button"
                data-secenek
                onClick={() => sec(s.kimlik)}
                aria-disabled={!hazir || bekliyor}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl border border-cizgi bg-yuzey-2 p-3 text-center transition-colors',
                  hazir && !bekliyor ? 'hover:border-muz/50 hover:bg-muz/10' : 'cursor-default',
                )}
              >
                <Gorsel g={s.gorsel} boyut={44} />
                <span className="text-xs font-medium leading-tight">{s.ad}</span>
              </button>
            ))}
          </motion.div>
        )}

        <p className="text-center text-xs text-silik">Doğru maymunu seçince çalışmaya devam edersin. Yanlış seçim seni bir süre çalıştırmaz.</p>
      </div>
    </div>,
    document.body,
  );
}
