import { Banana, Coins, Crown } from 'lucide-react';
import { animate } from 'motion/react';
import { useRef, useState } from 'react';

import {
  BahisPaneli, Kurallar, OyunDuzeni, Sahne, SonucKarti, useTekAtis,
} from './ortak.jsx';
import { carpanMetni, cn } from '@/lib/utils.js';

const YUZ = 'absolute inset-0 grid place-items-center rounded-full [backface-visibility:hidden]';

function ParaYuzu({ ikon: Ikon, ad, arka = false }) {
  return (
    <div
      className={cn(YUZ, 'bg-[radial-gradient(circle_at_32%_26%,var(--color-muz-acik),var(--color-muz)_42%,var(--color-muz-koyu))] shadow-[0_0_0_6px_var(--color-muz-koyu),inset_0_0_0_3px_rgb(255_255_255/0.25),0_18px_40px_-10px_rgb(0_0_0/0.7)]')}
      style={arka ? { transform: 'rotateX(180deg)' } : undefined}
    >
      <div className="absolute inset-3 rounded-full border-2 border-dashed border-muz-metin/30" />
      <div className="flex flex-col items-center gap-1 text-muz-metin">
        <Ikon className="size-14" strokeWidth={2} />
        <span className="font-display text-sm font-bold tracking-[0.2em]">{ad}</span>
      </div>
    </div>
  );
}

export default function YaziTura({ ctx }) {
  const carpan = ctx.veri.oyunlar.yazitura.carpan;
  const { faz, sonuc, oyna, kilit } = useTekAtis(ctx, 'yazitura');
  const [secim, setSecim] = useState('yazi');
  const para = useRef(null);
  const havada = useRef(null);
  const golge = useRef(null);
  const aci = useRef(0);

  const anim = async (veri) => {
    const istenen = veri.sonuc.sonuc === 'tura' ? 1 : 0;
    const simdiki = (aci.current / 180) % 2;
    const hedef = aci.current + 1800 + ((istenen - simdiki + 2) % 2) * 180;
    const sure = 1.7;
    animate(havada.current, { y: [0, -150, 0], scale: [1, 1.25, 1] }, { duration: sure, ease: 'easeOut', times: [0, 0.5, 1] });
    animate(golge.current, { scale: [1, 0.55, 1], opacity: [0.5, 0.2, 0.5] }, { duration: sure, times: [0, 0.5, 1] });
    await animate(para.current, { rotateX: hedef }, { duration: sure, ease: [0.3, 0.1, 0.3, 1] });
    aci.current = hedef;
  };

  const sec = (d, Ikon, ad) => (
    <button
      key={d}
      type="button"
      disabled={kilit}
      onClick={() => setSecim(d)}
      className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60', secim === d ? 'border-muz/60 bg-muz/10 text-muz' : 'border-cizgi text-soluk hover:border-cizgi-guclu hover:text-metin')}
    >
      <Ikon className="size-4" />{ad}
    </button>
  );

  const sahne = (
    <>
      <Sahne className="flex flex-col items-center gap-6 px-4 pb-6 pt-10">
        <div className="relative grid h-56 w-full place-items-center [perspective:900px]">
          <div ref={havada} className="size-40">
            <div ref={para} className="relative size-full [transform-style:preserve-3d]">
              <ParaYuzu ikon={Banana} ad="YAZI" />
              <ParaYuzu ikon={Crown} ad="TURA" arka />
            </div>
          </div>
          <div ref={golge} className="absolute bottom-3 h-4 w-32 rounded-full bg-black/60 opacity-50 blur-md" />
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <span className="text-center text-xs font-medium uppercase tracking-wider text-silik">Seçimin</span>
          <div className="flex gap-2">{sec('yazi', Banana, 'Yazı')}{sec('tura', Crown, 'Tura')}</div>
        </div>
      </Sahne>
      {faz === 'bitti' && sonuc && (
        <SonucKarti
          net={sonuc.net}
          carpan={sonuc.carpan}
          cashback={sonuc.cashback}
          baslik={`Para ${sonuc.sonuc.sonuc === 'yazi' ? 'yazı' : 'tura'} geldi`}
          onTekrar={() => oyna({ secim }, anim)}
        />
      )}
      <Kurallar satirlar={[`Yazı ya da tura seç; bilirsen bahsinin **${String(carpan).replace('.', ',')} katını** alırsın.`]} />
    </>
  );

  return (
    <OyunDuzeni
      sahne={sahne}
      panel={(
        <BahisPaneli ctx={ctx} etiket="Havaya at" ikon={Coins} onAna={() => oyna({ secim }, anim)} bekliyor={faz === 'bekle'} kilit={kilit}>
          <div className="flex items-center justify-between rounded-xl bg-yuzey-3/60 px-3 py-2 text-[13px] text-soluk">
            Bilirsen<span className="sayi font-medium text-muz">{carpanMetni(carpan)}</span>
          </div>
        </BahisPaneli>
      )}
    />
  );
}
