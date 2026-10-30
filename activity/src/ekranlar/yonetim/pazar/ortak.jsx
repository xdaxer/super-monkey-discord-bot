import { X } from 'lucide-react';

import { Avatar } from '@/components/Avatar.jsx';
import { cn } from '@/lib/utils.js';
import { kartBilgisi, KartKaresi } from '../../pazar/ortak.jsx';

export const DURUM_ADLARI = {
  acik: 'Açık', bitti: 'Satıldı', iptal: 'Üye kaldırdı', kaldirildi: 'Yönetici kaldırdı',
};
export const DURUM_RENK = {
  acik: 'bg-yesil/15 text-yesil', bitti: 'bg-mavi/15 text-mavi', iptal: 'bg-yuzey-3 text-soluk', kaldirildi: 'bg-kirmizi/15 text-kirmizi',
};

export const DONEMLER = [
  { kimlik: 'bugun', ad: 'Bugün' },
  { kimlik: '7g', ad: '7 gün' },
  { kimlik: '30g', ad: '30 gün' },
  { kimlik: 'tumu', ad: 'Tümü' },
];

/** Seçili olanı vurgulanan küçük düğme grubu. */
export function Secmeli({
  liste, deger, degisti, etiket,
}) {
  return (
    <div role="group" aria-label={etiket} className="flex w-fit flex-wrap gap-1 rounded-xl border border-cizgi bg-zemin/40 p-1">
      {liste.map((x) => (
        <button
          key={x.kimlik ?? 'hepsi'}
          type="button"
          aria-pressed={deger === x.kimlik}
          onClick={() => degisti(x.kimlik)}
          className={cn('min-h-8 rounded-lg px-2.5 text-[13px] transition-colors pointer-coarse:min-h-10', deger === x.kimlik ? 'bg-muz/15 font-medium text-muz' : 'text-soluk hover:text-metin')}
        >
          {x.ad}
        </button>
      ))}
    </div>
  );
}

/** Üye adı (avatarlı); `sec` verilirse dokununca süzgece eklenir. */
export function UyeAdi({ uye, sec, boyut = 20 }) {
  const ic = (
    <>
      <Avatar uye={uye} boyut={boyut} />
      <span className="truncate">{uye.ad}</span>
    </>
  );
  if (!sec) return <span className="flex min-w-0 items-center gap-1.5">{ic}</span>;
  return (
    <button type="button" onClick={() => sec(uye)} title="Bu üyeye süz" className="flex min-w-0 items-center gap-1.5 text-left hover:text-muz">
      {ic}
    </button>
  );
}

/** Kart küçük resmi + adı; `sec` verilirse dokununca süzgece eklenir. */
export function KartHucre({ kimlik, sec, boyut = 24 }) {
  const k = kartBilgisi(kimlik);
  const ic = (
    <>
      <KartKaresi kimlik={kimlik} boyut={boyut} className="rounded-lg" />
      <span className="min-w-0">
        <span className="block truncate">{k.ad}{k.parlak ? ' (parlak)' : ''}</span>
        <span className="block truncate text-[11px]" style={{ color: k.yaziRengi }}>{k.nadirlikAd}</span>
      </span>
    </>
  );
  if (!sec) return <span className="flex min-w-0 items-center gap-2">{ic}</span>;
  return (
    <button type="button" onClick={() => sec(kimlik)} title="Bu karta süz" className="flex min-w-0 items-center gap-2 text-left hover:text-muz">
      {ic}
    </button>
  );
}

/** Kaldırılabilir süzgeç etiketi. */
export function SuzgecEtiketi({ children, kaldir, etiket }) {
  return (
    <span className="flex items-center gap-2 rounded-xl border border-muz/40 bg-muz/10 py-1 pl-1.5 pr-1 text-sm">
      {children}
      <button type="button" onClick={kaldir} aria-label={etiket} className="grid size-7 place-items-center rounded-md text-soluk hover:text-metin pointer-coarse:size-9">
        <X className="size-4" />
      </button>
    </span>
  );
}

/** Alım isteğinde "bitti" karşılandı demektir. */
export const durumAdi = (durum, tur) => (tur === 'istek' && durum === 'bitti' ? 'Karşılandı' : DURUM_ADLARI[durum] ?? durum);

export function DurumRozeti({ durum, tur }) {
  return <span className={cn('inline-flex shrink-0 rounded-md px-1.5 py-px text-[11px] font-semibold', DURUM_RENK[durum])}>{durumAdi(durum, tur)}</span>;
}
