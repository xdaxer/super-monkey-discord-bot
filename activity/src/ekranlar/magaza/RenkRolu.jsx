import { Palette } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Md } from '@/components/Md.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Giris } from '@/components/ui/giris.jsx';
import { KartBaslik } from '@/components/ui/kart.jsx';
import { api } from '@/lib/api.js';
import { useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';
import { alimBildirimi } from './bildirim.jsx';

const PALET = ['#ff5a5f', '#ff8800', '#ffd43b', '#a3e635', '#34d399', '#2dd4bf', '#38bdf8', '#6366f1', '#a855f7', '#ec4899', '#f4efe6', '#94a3b8'];

/** "#f80", "ff8800" → "#ff8800"; anlaşılmazsa null. */
export function renkDuzelt(girdi) {
  let hex = String(girdi ?? '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) hex = [...hex].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

function Onizleme({ renk, kullanici }) {
  const ad = kullanici?.ad ?? 'Sen';
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-cizgi bg-zemin/60 p-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-silik">Önizleme</span>
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-yuzey-2">
        <Avatar uye={kullanici} boyut={32} />
        <span className="truncate font-medium" style={{ color: renk }}>{ad}</span>
      </div>
      <div className="flex items-start gap-3 rounded-lg px-2 py-1.5">
        <Avatar uye={kullanici} boyut={36} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium" style={{ color: renk }}>{ad}</span>
            <span className="text-[11px] text-silik">bugün 21:00</span>
          </div>
          <p className="text-sm text-metin/90">Muzlar bol, renk yerinde.</p>
        </div>
      </div>
    </div>
  );
}

export function RenkRolu({ veri, yenile, onSon }) {
  const r = veri.renkRolu;
  const mevcut = r.mevcut?.var ? r.mevcut : null;
  const kullanici = useUygulama((s) => s.kullanici);
  const bakiye = useUygulama((s) => s.bakiye);
  const fiyat = mevcut ? r.degisim : r.fiyat;
  const [hex, setHex] = useState(mevcut?.renk ?? '#ff8800');
  const [calistir, bekliyor] = useIslem();
  const gecerli = renkDuzelt(hex);
  const yetmez = bakiye !== null && fiyat > bakiye;

  const al = () => calistir(async () => {
    const s = await api('/api/magaza/renk', { govde: { renk: gecerli } });
    const metin = `${s.yeni ? 'Özel renk rolün hazır' : 'Rengin değişti'}: **${s.renk}**`;
    alimBildirimi(metin, false);
    onSon({ metin, kasa: false });
    await yenile({ sessiz: true });
  });

  return (
    <div className="yuzey-kart grid gap-6 p-5 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <KartBaslik
          ikon={Palette}
          baslik="Özel renk rolü"
          aciklama="Adına özel renkli bir rol açılır; hiçbir yetki taşımaz. Renk değişimi ucuzdur."
          className="mb-0"
        />
        {mevcut && (
          <p className="text-sm text-soluk">
            Mevcut rolün: <strong style={{ color: mevcut.renk }}>{mevcut.ad ?? 'özel rol'}</strong>
            <span className="sayi ml-1.5 text-xs text-silik">{mevcut.renk}</span>
          </p>
        )}
        <div className="flex items-center gap-3">
          <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-cizgi-guclu" style={{ background: gecerli ?? 'transparent' }}>
            <input
              type="color"
              aria-label="Renk seç"
              value={gecerli ?? '#000000'}
              onChange={(e) => setHex(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          <Giris
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            maxLength={7}
            placeholder="#ff8800"
            aria-invalid={!gecerli}
            className={cn('sayi w-32', !gecerli && 'border-kirmizi/60')}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {PALET.map((p) => (
            <button
              key={p}
              type="button"
              aria-label={p}
              onClick={() => setHex(p)}
              className={cn('size-7 rounded-full ring-offset-2 ring-offset-yuzey-2 transition-transform hover:scale-110', gecerli === p ? 'ring-2 ring-metin' : 'ring-1 ring-cizgi-guclu')}
              style={{ background: p }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Onizleme renk={gecerli ?? undefined} kullanici={kullanici} />
        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-silik">{mevcut ? 'Renk değişimi' : 'İlk alım'}</span>
            <Muz miktar={fiyat} className="text-base font-semibold" />
          </div>
          <Button tur="ana" tam bekliyor={bekliyor} disabled={!gecerli || yetmez} onClick={al}>
            {yetmez ? 'Bakiye yetersiz' : mevcut ? 'Rengi değiştir' : 'Rolü al'}
          </Button>
          {!gecerli && <p className="text-xs text-kirmizi"><Md metin="Rengi anlayamadım. Örnek: `#ff8800`" /></p>}
        </div>
      </div>
    </div>
  );
}
