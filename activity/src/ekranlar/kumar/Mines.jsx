import NumberFlow from '@number-flow/react';
import {
  Bomb, Gem, Grid3x3, LoaderCircle, Play,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';

import { Kaydirgac } from './Kaydirgac.jsx';
import {
  bekle, BahisPaneli, Bilgi, konfeti, Kurallar, OyunDuzeni, Sahne, SonucKarti, useCanli,
} from './ortak.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster, hataGoster } from '@/lib/bildirim.jsx';
import { bakiyeGuncelle } from '@/lib/store.js';
import { carpanMetni, cn } from '@/lib/utils.js';

const YUZ = 'absolute inset-0 grid place-items-center rounded-2xl [backface-visibility:hidden]';

function Kare({
  tur, cevrik, bekliyor, devre, onClick, patladi,
}) {
  // tur: gem | mayin; cevrik: arka yüz görünür.
  return (
    <button
      type="button"
      disabled={devre}
      onClick={onClick}
      aria-label="Kare"
      className="relative aspect-square w-full [perspective:700px] disabled:cursor-default"
    >
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        animate={{ rotateY: cevrik ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.3, 0.1, 0.2, 1] }}
      >
        <div className={cn(YUZ, 'border border-cizgi-guclu bg-gradient-to-b from-yuzey-3 to-yuzey-2 shadow-[0_6px_0_var(--color-yuzey),0_12px_20px_-8px_rgb(0_0_0/0.6)] transition-[filter,transform]', !devre && 'hover:-translate-y-0.5 hover:brightness-125 active:translate-y-0.5')}>
          {bekliyor && <LoaderCircle className="size-7 animate-spin text-silik" />}
        </div>
        <div
          className={cn(YUZ, 'border', tur === 'mayin' ? 'border-kirmizi/50 bg-kirmizi/15' : 'border-yesil/40 bg-yesil/10', patladi && 'bg-kirmizi/30 shadow-[0_0_36px_-4px_var(--color-kirmizi)]')}
          style={{ transform: 'rotateY(180deg)' }}
        >
          {tur === 'mayin'
            ? <Bomb className="size-1/2 text-kirmizi" strokeWidth={1.8} />
            : <Gem className="size-1/2 text-yesil" strokeWidth={1.8} />}
        </div>
      </motion.div>
    </button>
  );
}

export default function Mines({ ctx }) {
  const M = ctx.veri.oyunlar.mines;
  const canli = useCanli();
  const [oyun, setOyun] = useState(ctx.veri.mines);
  const [bitti, setBitti] = useState(null);
  const [son, setSon] = useState(null);
  const [gorunen, setGorunen] = useState(() => new Set(ctx.veri.mines?.acilan ?? []));
  const [mayinSayisi, setMayinSayisi] = useState(ctx.veri.mines?.mayin ?? M.varsayilan);
  const [bekleyen, setBekleyen] = useState(null);
  const [istek, setIstek] = useState(false);
  const [sarsil, setSarsil] = useState(0);
  const [patlayan, setPatlayan] = useState(null);
  const [mayinlar, setMayinlar] = useState([]);
  const [yeniBekliyor, setYeniBekliyor] = useState(false);
  const kilitRef = useRef(false);

  const calis = async (fn) => {
    if (kilitRef.current) return;
    kilitRef.current = true;
    setIstek(true);
    try {
      await fn();
    } catch (e) {
      hataGoster(e);
    } finally {
      kilitRef.current = false;
      if (canli.current) { setIstek(false); setBekleyen(null); setYeniBekliyor(false); }
    }
  };

  const baslat = () => calis(async () => {
    const bahis = ctx.bahis.trim();
    if (!bahis) { bildirimGoster('Önce bir bahis yaz: `500`, `2.5k`, `yarı`, `hepsi`.', 'hata'); return; }
    const v = await api('/api/kumar/mines/baslat', { govde: { bahis, mayin: mayinSayisi } });
    if (v.eski) {
      bildirimGoster(v.eski.tur === 'iade'
        ? `Unutulan önceki oyunun bahsi iade edildi (**${v.eski.odeme.toLocaleString('tr-TR')}** muz).`
        : `Unutulan önceki oyun kendiliğinden çekildi: **${carpanMetni(v.eski.carpan)}**, ${v.eski.odeme.toLocaleString('tr-TR')} muz.`, 'bilgi', 6000);
    }
    setBitti(null);
    setSon(null);
    setPatlayan(null);
    setMayinlar([]);
    setGorunen(new Set());
    setOyun(v.oyun);
  });

  /** Oyun bitti: kareleri sırayla aç, sonra bakiyeyi güncelle. */
  const bitir = async (v) => {
    const b = v.bitti;
    setSon(b);
    setOyun(null);
    setPatlayan(b.patlayan);
    setMayinlar(b.mayinlar);
    if (b.tur === 'patladi') {
      setGorunen((g) => new Set(g).add(b.patlayan));
      setSarsil((s) => s + 1);
      await bekle(650);
      for (const m of b.mayinlar) {
        if (m === b.patlayan) continue;
        setGorunen((g) => new Set(g).add(m));
        // eslint-disable-next-line no-await-in-loop
        await bekle(220);
      }
    } else {
      const hepsi = Array.from({ length: M.hucre }, (_, i) => i).filter((i) => !b.acilan.includes(i));
      for (const i of hepsi) {
        setGorunen((g) => new Set(g).add(i));
        // eslint-disable-next-line no-await-in-loop
        await bekle(90);
      }
    }
    await bekle(250);
    setBitti(b);
    bakiyeGuncelle(v.bakiye);
    if (b.carpan >= 5 && b.tur !== 'patladi') konfeti();
  };

  const ac = (i) => {
    if (!oyun || kilitRef.current || gorunen.has(i)) return;
    setBekleyen(i);
    calis(async () => {
      const v = await api('/api/kumar/mines/ac', { govde: { hucre: i }, bakiyeErtele: true });
      if (!v.bitti) {
        setBekleyen(null);
        setGorunen((g) => new Set(g).add(i));
        setOyun(v.oyun);
        return;
      }
      setBekleyen(null);
      // Mayına basıldıysa kare bitir() içinde mayın bilgisiyle birlikte çevrilir;
      // burada çevrilirse mayın listesi gelene kadar elmas görünür.
      if (v.bitti.tur !== 'patladi') {
        setGorunen((g) => new Set(g).add(i));
        await bekle(450);
      }
      await bitir(v);
    });
  };

  const cek = () => calis(async () => {
    const v = await api('/api/kumar/mines/cek', { govde: {}, bakiyeErtele: true });
    await bitir(v);
  });

  const tekrar = () => { setYeniBekliyor(true); baslat(); };

  const bahisKilit = istek && !oyun;
  const acilanSayi = oyun?.acilan.length ?? 0;
  const tablo = M.tablo[oyun?.mayin ?? mayinSayisi] ?? [];
  // Oyun en çok tablo uzunluğu kadar kare sürer: tavana (9x) ya da son güvenli kareye varınca çekilir.
  const guvenliToplam = tablo.length;
  const sonuncuMayin = bitti?.tur === 'patladi';

  const kareTuru = (i) => {
    if (mayinlar.includes(i)) return 'mayin';
    return 'gem';
  };
  const soluk = (i) => son !== null && !son.acilan.includes(i) && !mayinlar.includes(i);

  const bilgi = (etiket, deger, ton) => (
    <div className="flex flex-1 flex-col gap-0.5 rounded-xl border border-cizgi bg-zemin/50 px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-silik">{etiket}</span>
      <span className={cn('sayi text-lg font-semibold', ton)}>{deger}</span>
    </div>
  );

  const cekDugme = oyun && (
    <Button tur="basari" boyut="lg" tam onClick={cek} disabled={istek || acilanSayi === 0} className="h-14 text-base font-semibold">
      {acilanSayi === 0 ? 'Önce bir kare aç' : <>Çek · <Muz miktar={oyun.cekilecek} boyut={18} /></>}
    </Button>
  );

  const sahne = (
    <>
      <Sahne className="flex flex-col items-center gap-5 p-4 sm:p-6">
        {oyun && (
          <div className="flex w-full max-w-sm gap-2">
            {bilgi('Çarpan', (
              <NumberFlow value={acilanSayi > 0 ? oyun.carpan : 1} locales="tr-TR" suffix="x" format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
            ), acilanSayi > 0 ? 'text-yesil' : undefined)}
            {acilanSayi < guvenliToplam && bilgi('Sonraki', carpanMetni(oyun.sonraki), 'text-muz')}
            {bilgi('Güvenli', `${acilanSayi}/${guvenliToplam}`)}
          </div>
        )}

        <motion.div
          key={sarsil}
          animate={sarsil ? { x: [0, -12, 12, -9, 9, -4, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="grid w-full max-w-[19rem] grid-cols-3 gap-2.5 sm:max-w-[22rem] sm:gap-4"
        >
          {Array.from({ length: M.hucre }, (_, i) => (
            <div key={i} className={cn('transition-opacity', soluk(i) && 'opacity-45')}>
              <Kare
                tur={kareTuru(i)}
                cevrik={gorunen.has(i)}
                bekliyor={bekleyen === i}
                devre={!oyun || istek || gorunen.has(i)}
                patladi={sonuncuMayin && patlayan === i}
                onClick={() => ac(i)}
              />
            </div>
          ))}
        </motion.div>
        <p className="h-5 text-center text-sm text-soluk">
          {oyun ? (acilanSayi === 0 ? 'Bir kare aç.' : 'Açmaya devam et ya da çek.') : bitti ? '' : 'Mayın sayısını seç ve oyuna gir.'}
        </p>
        {/* Darda Çek tahtanın hemen altında: oyun sürerken parmak tahtadan ayrılmadan çekilebilsin. */}
        {oyun && <div className="w-full max-w-sm lg:hidden">{cekDugme}</div>}
      </Sahne>

      {bitti && (
        <SonucKarti
          net={bitti.net}
          carpan={bitti.tur === 'patladi' ? 0 : bitti.carpan}
          cashback={bitti.cashback}
          baslik={bitti.tur === 'patladi' ? 'Mayına bastın' : `Çektin: ${carpanMetni(bitti.carpan)}`}
          ayrinti={bitti.tur === 'patladi' ? undefined : `${bitti.odeme.toLocaleString('tr-TR')} muz ödendi.`}
          onTekrar={tekrar}
          tekrarBekliyor={yeniBekliyor}
        />
      )}

      <Kurallar satirlar={[
        `${M.hucre} karelik (3×3) tahtada ${M.min}–${M.maks} mayın gizli. Güvenli kare açtıkça çarpan büyür.`,
        'Mayına basarsan bahsin gider; istediğin an **Çek** ile bahis × çarpanı alırsın.',
        `Çarpan en çok **${carpanMetni(M.maksCarpan)}**; ona ulaşınca ya da bütün güvenli kareleri açınca kendiliğinden çekilir.`,
      ]}
      />
      <Bilgi baslik={`Çarpan tablosu · ${oyun?.mayin ?? mayinSayisi} mayın`} ikon={Grid3x3}>
        <div className="flex flex-wrap gap-2">
          {tablo.map((c, i) => (
            <div key={i} className={cn('flex flex-col items-center rounded-lg border px-3 py-1.5', oyun && i + 1 === acilanSayi ? 'border-muz/60 bg-muz/10' : 'border-cizgi')}>
              <span className="text-[11px] text-silik">{i + 1}. kare</span>
              <span className="sayi font-medium text-metin">{carpanMetni(c)}</span>
            </div>
          ))}
        </div>
      </Bilgi>
    </>
  );

  // Mayın seçici bahis panelinde, bahsin altında. Oyun sürerken yalnız mayın sayısı görünür;
  // oyun bitince seçici geri gelir ki bir sonraki el için değiştirilebilsin.
  const mayinSecici = oyun ? (
    <div className="flex items-center justify-between rounded-xl border border-cizgi bg-zemin/50 px-4 py-3">
      <span className="text-sm text-soluk">Mayın sayısı</span>
      <span className="sayi flex items-center gap-1.5 text-lg font-semibold text-kirmizi"><Bomb className="size-4" />{oyun.mayin}</span>
    </div>
  ) : (
    <div className="flex flex-col gap-3 rounded-xl border border-cizgi bg-zemin/50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Mayın sayısı</span>
        <span className="sayi flex items-center gap-1.5 text-lg font-semibold text-kirmizi"><Bomb className="size-4" />{mayinSayisi}</span>
      </div>
      <Kaydirgac deger={mayinSayisi} degisti={setMayinSayisi} min={M.min} maks={M.maks} disabled={istek} />
      <div className="flex justify-between text-xs text-silik">
        <span>Güvenli, düşük çarpan</span>
        <span>Riskli, yüksek çarpan</span>
      </div>
      <div className="text-xs text-soluk">İlk güvenli kare: <span className="sayi font-medium text-muz">{carpanMetni(tablo[0] ?? 1)}</span></div>
    </div>
  );

  return (
    <OyunDuzeni
      sahne={sahne}
      panel={(
        <BahisPaneli
          ctx={ctx}
          etiket="Başlat"
          ikon={Play}
          onAna={baslat}
          bekliyor={bahisKilit}
          kilit={istek}
          sabit={oyun ? oyun.bahis : null}
          ana={oyun ? <div className="hidden lg:block">{cekDugme}</div> : null}
        >
          {mayinSecici}
        </BahisPaneli>
      )}
    />
  );
}
