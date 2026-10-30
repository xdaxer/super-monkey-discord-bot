import { Circle, Flag, Handshake, Trophy, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { useSimdi } from '@/components/GeriSayim.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Kart } from '@/components/ui/kart.jsx';
import { api } from '@/lib/api.js';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';

function Isaret({ isaret, className }) {
  if (isaret === 'X') return <X className={cn('text-muz', className)} strokeWidth={3} />;
  return <Circle className={cn('text-mavi', className)} strokeWidth={3} />;
}

/** Hamle süresi halkası: son 10 saniyede kırmızı. */
function SureHalkasi({ bitis, sure }) {
  const simdi = useSimdi(250);
  const kalan = Math.max(0, bitis - simdi);
  const oran = Math.min(1, kalan / sure);
  const r = 20;
  const c = 2 * Math.PI * r;
  const acil = kalan < 10_000;
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="3.5" className="stroke-yuzey-3" />
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round" className={cn('transition-[stroke-dashoffset] duration-300', acil ? 'stroke-kirmizi' : 'stroke-muz')} style={{ strokeDasharray: c, strokeDashoffset: c * (1 - oran) }} />
      </svg>
      <span className={cn('sayi absolute inset-0 grid place-items-center text-sm font-semibold', acil && 'text-kirmizi')}>{Math.ceil(kalan / 1000)}</span>
    </div>
  );
}

function Oyuncu({ uye, isaret, sirada }) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors', sirada ? 'border-muz/50 bg-muz/[0.07]' : 'border-cizgi bg-zemin/30')}>
      <div className="relative">
        <Avatar uye={uye} boyut={40} />
        <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border border-cizgi bg-yuzey-3"><Isaret isaret={isaret} className="size-3" /></span>
      </div>
      <p className="w-full truncate text-center text-sm font-medium">{uye.ad}</p>
    </div>
  );
}

export function XoxTahtasi({ oyunId, kapat, yenile }) {
  const ben = useUygulama((s) => s.kullanici?.id);
  const [durdu, setDurdu] = useState(false);
  const { veri, setVeri, yenile: yokla } = useApi(durdu ? null : `/api/xox/${oyunId}`, { aralik: 2500 });
  const [calistir, bekliyor] = useIslem();
  const oyun = veri?.oyun;
  const bitti = veri?.bitti;
  const yok = Boolean(veri?.yok);
  const son = Boolean(bitti || yok);

  useEffect(() => {
    if (son && !durdu) {
      setDurdu(true);
      yenile?.();
    }
  }, [son, durdu, yenile]);

  // Süre dolduysa hükmü sunucudan hemen al.
  const simdi = useSimdi(500);
  useEffect(() => {
    if (oyun && !son && simdi > oyun.bitisMs + 300) yokla({ sessiz: true });
  }, [simdi, oyun, son, yokla]);

  const benimSiram = Boolean(oyun && !son && oyun.siradakiId === ben);
  const uye = (id) => (oyun.x.id === id ? oyun.x : oyun.o);

  const hamle = (hucre) => calistir(async () => { setVeri(await api(`/api/xox/${oyunId}/hamle`, { govde: { hucre } })); });
  const pes = async () => {
    const evet = await onayIste({
      baslik: 'Pes et', metin: 'Pes edersen rakibin **havuzu** alır. Emin misin?', evet: 'Pes et', tehlikeli: true,
    });
    if (evet) calistir(async () => { setVeri(await api(`/api/xox/${oyunId}/pes`, { govde: {} })); });
  };

  return (
    <Kart vurgu className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold">XOX düellosu</h3>
        <div className="flex items-center gap-2 text-sm text-soluk">
          {oyun && <span>havuz <Muz miktar={oyun.bahis * 2} boyut={14} /></span>}
          <Button tur="hayalet" boyut="ikon" onClick={kapat} aria-label="Kapat"><X /></Button>
        </div>
      </div>

      {!oyun && !yok && <p className="py-10 text-center text-sm text-soluk">Oyun yükleniyor…</p>}
      {yok && !oyun && (
        <div className="rounded-xl border border-cizgi bg-yuzey-3/60 p-4 text-center">
          <p className="font-semibold">Oyun sona erdi</p>
          <p className="text-sm text-soluk">Sonuç için son sonuçlara bak.</p>
        </div>
      )}

      {oyun && (
        <>
          <div className="flex items-center gap-3">
            <Oyuncu uye={oyun.x} isaret="X" sirada={!son && oyun.sira === 'X'} />
            {son ? <span className="w-14 text-center text-xs font-semibold uppercase text-silik">vs</span> : <SureHalkasi bitis={oyun.bitisMs} sure={oyun.sureMs} />}
            <Oyuncu uye={oyun.o} isaret="O" sirada={!son && oyun.sira === 'O'} />
          </div>

          {!son && (
            <p className={cn('text-center text-sm', benimSiram ? 'font-semibold text-muz' : 'text-soluk')}>
              {benimSiram ? 'Sıra sende' : `Sıra ${uye(oyun.siradakiId).ad} oyuncusunda`}
            </p>
          )}

          <div className="mx-auto grid w-full max-w-[280px] grid-cols-3 gap-2">
            {Array.from({ length: 9 }, (_, i) => {
              const h = oyun.tahta[i];
              const bos = h === '.';
              const kazanan = bitti?.cizgi?.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Kare ${i + 1}`}
                  disabled={!benimSiram || !bos || bekliyor}
                  onClick={() => hamle(i)}
                  className={cn(
                    'grid aspect-square place-items-center rounded-xl border transition-colors',
                    kazanan ? 'border-yesil/60 bg-yesil/15' : 'border-cizgi bg-yuzey-3/60',
                    benimSiram && bos && !bekliyor && 'hover:border-muz/50 hover:bg-muz/10',
                    bitti && !kazanan && !bos && 'opacity-50',
                  )}
                >
                  {!bos && (
                    <motion.span initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                      <Isaret isaret={h} className="size-10" />
                    </motion.span>
                  )}
                </button>
              );
            })}
          </div>

          {bitti && (
            <div className={cn('flex items-center gap-3 rounded-xl border p-4', bitti.berabere ? 'border-cizgi bg-yuzey-3/60' : bitti.benKazandi ? 'border-yesil/40 bg-yesil/[0.08]' : 'border-kirmizi/35 bg-kirmizi/[0.07]')}>
              {bitti.berabere ? <Handshake className="size-6 text-soluk" /> : <Trophy className={cn('size-6', bitti.benKazandi ? 'text-yesil' : 'text-kirmizi')} />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{bitti.berabere ? 'Berabere' : bitti.benKazandi ? 'Kazandın!' : `${uye(bitti.kazananId).ad} kazandı`}</p>
                <p className="text-xs text-soluk">
                  {bitti.berabere ? 'İki taraf da bahsini geri aldı.'
                    : bitti.sebep === 'sure' ? `${uye(bitti.kaybedenId).ad} süresinde oynamadı.`
                      : bitti.sebep === 'pes' ? `${uye(bitti.kaybedenId).ad} pes etti.` : 'Çizgi tamamlandı.'}
                </p>
              </div>
              {!bitti.berabere && <Muz miktar={bitti.benKazandi ? bitti.kazanc : -oyun.bahis} isaretli className="text-lg" />}
            </div>
          )}

          {!son && <Button tur="cizgili" tam bekliyor={bekliyor} onClick={pes}><Flag />Pes et</Button>}
        </>
      )}
    </Kart>
  );
}
