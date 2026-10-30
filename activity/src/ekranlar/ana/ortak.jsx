import NumberFlow from '@number-flow/react';
import confetti from 'canvas-confetti';
import { Flame, Gift } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Gorsel } from '@/components/Gorsel.jsx';
import { carpanMetni, cn } from '@/lib/utils.js';

/** 0'dan hedefe kayarak sayan tutar (kutlama anları için). */
export function Sayac({ hedef, sure = 1200, className, ...props }) {
  const [deger, setDeger] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDeger(hedef), 250);
    return () => clearTimeout(t);
  }, [hedef]);
  const zamanlama = { duration: sure, easing: 'cubic-bezier(.2,.7,.2,1)' };
  return (
    <NumberFlow
      value={deger}
      locales="tr-TR"
      trend={1}
      transformTiming={zamanlama}
      spinTiming={zamanlama}
      className={className}
      {...props}
    />
  );
}

/** Muz renkli konfeti (hareket azaltma tercihine saygılı). */
export function konfeti() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const s = getComputedStyle(document.documentElement);
  const colors = ['--color-muz', '--color-muz-koyu', '--color-muz-acik', '--color-yesil']
    .map((k) => s.getPropertyValue(k).trim()).filter(Boolean);
  const vur = (ek) => confetti({
    colors, ticks: 220, gravity: 1.05, scalar: 0.95, disableForReducedMotion: true, ...ek,
  });
  vur({ particleCount: 70, spread: 75, startVelocity: 42, origin: { y: 0.6 } });
  setTimeout(() => vur({ particleCount: 40, spread: 100, startVelocity: 28, origin: { x: 0.3, y: 0.65 } }), 180);
  setTimeout(() => vur({ particleCount: 40, spread: 100, startVelocity: 28, origin: { x: 0.7, y: 0.65 } }), 320);
}

/** Haftalık seri izi: 7 nokta, sonuncusu hediye. `dolu`: 0–7. */
export function SeriIzi({ dolu, className }) {
  return (
    <div className={cn('flex items-center gap-1.5', className)} role="img" aria-label={`Seri izi: ${dolu}/7`}>
      {Array.from({ length: 7 }, (_, i) => {
        const hediye = i === 6;
        const icerik = i < dolu;
        return (
          <div key={i} className="flex min-w-0 flex-1 items-center gap-1.5">
            <div
              className={cn(
                'grid h-9 w-full place-items-center rounded-lg border text-silik transition-colors',
                icerik ? 'border-muz/40 bg-muz/12 text-muz' : 'border-cizgi bg-yuzey-3/50',
                hediye && !icerik && 'border-dashed border-cizgi-guclu',
                hediye && icerik && 'border-muz bg-muz text-muz-metin',
              )}
            >
              {hediye ? <Gift className="size-4" /> : icerik ? <Flame className="size-4" /> : <span className="size-1 rounded-full bg-cizgi-guclu" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Seriden izdeki dolu nokta sayısı (7'nin katında tam dolu). */
export const seriDolu = (seri) => (seri <= 0 ? 0 : seri % 7 === 0 ? 7 : seri % 7);

/** Kasa etiketi: görsel + ad. */
export function KasaEtiketi({ kasa, boyut = 22, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg border border-cizgi bg-yuzey-3 py-1 pl-1.5 pr-2.5 text-[13px] font-medium', className)}>
      <Gorsel g={kasa.gorsel} boyut={boyut} />
      {kasa.ad}
    </span>
  );
}

/** Çarpan ve bonus satırları: [etiket, değer, ton]. */
export function carpanSatirlari(r) {
  const liste = [];
  if (r.ek > 0) liste.push(['Seri bonusu', `+${Number(r.ek).toLocaleString('tr-TR')}`]);
  if (r.korunan > 0) liste.push(['Seri Koruyucu', `${r.korunan} harcandı, seri sürdü`]);
  if (r.etkinlik) liste.push(['2x muz etkinliği', 'ikiye katlandı']);
  if (r.prestij > 1) liste.push(['Prestij', carpanMetni(r.prestij)]);
  if (r.uyelik > 1) liste.push(['Katıl üyeliği', carpanMetni(r.uyelik)]);
  if (r.yonetici > 1) liste.push(['Yönetici', carpanMetni(r.yonetici)]);
  if (r.haftalik) liste.push(['7. gün', 'ödül ikiye katlandı']);
  if (r.borcKesilen > 0) liste.push(['Kredi borcuna', `−${Number(r.borcKesilen).toLocaleString('tr-TR')} kesildi`, 'kirmizi']);
  return liste;
}
