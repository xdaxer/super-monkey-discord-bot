import { bicim, cn } from '@/lib/utils.js';

/**
 * Miktar metnini önizleme için çözer (lib `miktarAyristir`in aynası): 500, 2.5k,
 * 10.000, yarı, hepsi. Anlaşılmazsa null. Kural sunucudadır; bu yalnız gösterim içindir.
 */
export function miktarTahmin(metin, mevcut = 0) {
  const ham = String(metin ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!ham) return null;
  if (['hepsi', 'tümü', 'tumu', 'all'].includes(ham)) return Math.floor(mevcut);
  if (['yarı', 'yari', 'yarısı', 'yarisi', 'half'].includes(ham)) return Math.floor(mevcut / 2);
  const kisaltma = /^(\d+(?:[.,]\d+)?)\s*(k|b|bin|m|mn|milyon)$/.exec(ham);
  if (kisaltma) {
    const carpan = ['m', 'mn', 'milyon'].includes(kisaltma[2]) ? 1_000_000 : 1000;
    return Math.floor(Number(kisaltma[1].replace(',', '.')) * carpan);
  }
  if (/^\d{1,3}([.,]\d{3})+$|^\d+$/.test(ham)) return Number(ham.replace(/[.,]/g, ''));
  return null;
}

/** Faiz: lib `faizHesapla` ile aynı yuvarlama. */
export const faizDegeri = (anapara, yuzde) => Math.floor((anapara * yuzde) / 100);

/**
 * Vade kartları (radyo grubu). Kart: vade adı, büyük yüzde, "girdi → çıktı"
 * getiri önizlemesi. `onizleme(vade)` → { girdi, cikti } ya da null.
 */
export function VadeKartlari({
  vadeler, secili, degisti, onizleme, className,
}) {
  return (
    <div role="radiogroup" className={cn('grid gap-2', vadeler.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4', className)}>
      {vadeler.map((v) => {
        const aktif = v.kimlik === secili;
        const o = onizleme?.(v);
        return (
          <button
            key={v.kimlik}
            type="button"
            role="radio"
            aria-checked={aktif}
            onClick={() => degisti(v.kimlik)}
            className={cn(
              'secim flex min-w-0 flex-col gap-0.5 rounded-2xl border p-3 text-left transition-[border-color,background,box-shadow]',
              aktif
                ? 'border-muz/60 bg-muz/[0.09] shadow-[0_0_0_1px_rgb(255_212_59/0.25)]'
                : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu',
            )}
          >
            <span className={cn('text-xs font-medium', aktif ? 'text-muz' : 'text-soluk')}>{v.ad}</span>
            <span className="sayi font-display text-2xl font-semibold leading-tight">%{v.yuzde}</span>
            {o ? (
              <span className="mt-1 flex flex-col leading-tight">
                <span className={cn('sayi text-[11px]', o.ornek ? 'text-silik' : 'text-soluk')}>{bicim(o.girdi)}</span>
                <span className="sayi text-[13px] font-medium text-yesil">→ {bicim(o.cikti)}</span>
              </span>
            ) : <span className="mt-1 text-xs text-silik">—</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Küçük ayrıntı satırı: solda etiket, sağda değer. */
export function Satir({
  etiket, children, className, guclu = false,
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-sm', className)}>
      <span className="text-soluk">{etiket}</span>
      <span className={cn('sayi text-right', guclu && 'font-semibold')}>{children}</span>
    </div>
  );
}

/** gün / sa / dk bloklarıyla geri sayım (hedef ms). */
export function GeriBloklar({ kalan, className }) {
  const sn = Math.max(0, Math.floor(kalan / 1000));
  const bloklar = [
    ['gün', Math.floor(sn / 86400)],
    ['sa', Math.floor((sn % 86400) / 3600)],
    ['dk', Math.floor((sn % 3600) / 60)],
    ['sn', sn % 60],
  ];
  return (
    <div className={cn('flex gap-2', className)}>
      {bloklar.map(([ad, d]) => (
        <div key={ad} className="flex min-w-[52px] flex-1 flex-col items-center rounded-xl border border-cizgi bg-zemin/50 px-2 py-2">
          <span className="sayi font-display text-2xl font-semibold leading-none">{String(d).padStart(2, '0')}</span>
          <span className="mt-1 text-[11px] uppercase tracking-wide text-silik">{ad}</span>
        </div>
      ))}
    </div>
  );
}
