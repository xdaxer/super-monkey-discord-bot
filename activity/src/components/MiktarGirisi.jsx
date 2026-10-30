import { Giris } from '@/components/ui/giris.jsx';
import { cn } from '@/lib/utils.js';

/**
 * Muz miktarı girişi (lib `miktarAyristir` biçimleri: 500, 2.5k, yarı, hepsi)
 * ve hızlı seçim düğmeleri. Denetimli: deger / degisti.
 */
export function MiktarGirisi({
  deger, degisti, hizli = ['100', '1k', '10k', 'yarı', 'hepsi'], yer = '500, 2.5k, yarı, hepsi', className, otomatikOdak = false, onEnter,
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Giris
        value={deger}
        onChange={(e) => degisti(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }}
        placeholder={yer}
        maxLength={20}
        inputMode="text"
        autoFocus={otomatikOdak}
        className="sayi text-base"
      />
      <div className="flex flex-wrap gap-1.5">
        {hizli.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => degisti(h)}
            aria-pressed={deger === h}
            className={cn('min-h-7 rounded-lg border px-2.5 text-xs font-medium transition-colors active:scale-95 pointer-coarse:min-h-9 pointer-coarse:px-3 pointer-coarse:text-[13px]', deger === h ? 'border-muz/50 bg-muz/10 text-muz' : 'border-cizgi text-soluk hover:border-cizgi-guclu hover:text-metin')}
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
