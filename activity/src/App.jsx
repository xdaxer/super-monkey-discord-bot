import { Banana, Menu, ShieldAlert } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import {
  Component, Suspense, useEffect, useRef, useState,
} from 'react';
import { Toaster } from 'sonner';

import { AkisBari } from '@/components/AkisBari.jsx';
import { DavetPenceresi } from '@/components/DavetPenceresi.jsx';
import { Avatar } from '@/components/Avatar.jsx';
import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { YeniEtiketi } from '@/components/YeniEtiketi.jsx';
import { GrevKatmani } from '@/components/GrevKatmani.jsx';
import { OlayPenceresi } from '@/components/OlayPenceresi.jsx';
import { UzakPenceresi } from '@/components/UzakPenceresi.jsx';
import { OnayKatmani } from '@/components/Onay.jsx';
import { IpucuSaglayici } from '@/components/ui/ipucu.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { ALT_CUBUK, gorunurEkranlar } from '@/ekranlar/index.js';
import { useEslesme } from '@/lib/kancalar.js';
import { useNabiz } from '@/lib/nabiz.js';
import { useUygulama } from '@/lib/store.js';
import { cn, depo } from '@/lib/utils.js';

/** lg (1024px) ve üstü mü? Akış barı genişte dikey, darda yatay; ikisi birden bağlanmasın. */
const useGenis = () => useEslesme('(min-width: 1024px)');

/** Yönetici olmayan, yönetim ekranını hiç görmez. */
function useEkranlar() {
  return gorunurEkranlar(useUygulama((s) => Boolean(s.kullanici?.yonetici)));
}

/** Ekran çökerse yalnız o ekran hata gösterir, kabuk ayakta kalır. */
class EkranSiniri extends Component {
  constructor(props) {
    super(props);
    this.state = { hata: null };
  }

  static getDerivedStateFromError(hata) {
    return { hata };
  }

  render() {
    if (this.state.hata) return <HataKutusu hata={this.state.hata} tekrar={() => this.setState({ hata: null })} />;
    return this.props.children;
  }
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-b from-muz to-muz-koyu text-muz-metin shadow-[0_6px_18px_-6px_rgb(255_212_59/0.7)]">
        <Banana className="size-5" strokeWidth={2.4} aria-hidden />
      </div>
      <div className="leading-none">
        <div className="font-display text-[17px] font-bold tracking-tight">Muz Ekonomisi</div>
        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-silik">Süper Maymun</div>
      </div>
    </div>
  );
}

/** Yeni ekranın yanındaki dikkat çeken etiket. */
/** Alt çubuk simgesi: seçili sekme yalnız renkle değil, arkasındaki hapla da belli olur. */
function SekmeIkonu({ Ikon, aktif }) {
  return (
    <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', aktif && 'bg-muz/15')}>
      <Ikon className="size-5" strokeWidth={aktif ? 2.4 : 2} />
    </span>
  );
}

function GezinmeDugmesi({ ekran, aktif, onClick, dar = false }) {
  const Ikon = ekran.ikon;
  if (dar) {
    return (
      <button type="button" onClick={onClick} aria-current={aktif ? 'page' : undefined} className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[11px] font-medium transition-colors active:opacity-70', aktif ? 'text-muz' : 'text-soluk')}>
        <SekmeIkonu Ikon={Ikon} aktif={aktif} />
        {ekran.ad.split(' ')[0]}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={aktif ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
        aktif ? 'bg-yuzey-3 text-metin' : 'text-soluk hover:bg-yuzey-2 hover:text-metin',
      )}
    >
      {aktif && <motion.span layoutId="gez-isaret" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-muz" />}
      <Ikon className={cn('size-[18px] transition-colors', aktif ? 'text-muz' : 'text-silik group-hover:text-soluk')} />
      {ekran.ad}
      {ekran.yeni && <YeniEtiketi className="ml-auto" />}
    </button>
  );
}

function YanCubuk({ ekran, git }) {
  const ekranlar = useEkranlar();
  const gruplar = [...new Set(ekranlar.map((e) => e.grup))];
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-cizgi bg-yuzey/50 px-3 py-4 md:flex">
      <Logo />
      <nav aria-label="Ekranlar" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {gruplar.map((g) => (
          <div key={g} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-silik">{g}</div>
            {ekranlar.filter((e) => e.grup === g).map((e) => (
              <GezinmeDugmesi key={e.kimlik} ekran={e} aktif={e.kimlik === ekran} onClick={() => git(e.kimlik)} />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function UstCubuk() {
  const kullanici = useUygulama((s) => s.kullanici);
  const bakiye = useUygulama((s) => s.bakiye);
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-cizgi bg-zemin/70 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="md:hidden"><Logo /></div>
        <div className="hidden min-w-0 items-center gap-2.5 md:flex">
          <Avatar uye={kullanici} boyut={30} />
          <span className="truncate font-medium">{kullanici?.ad}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-muz/25 bg-muz/[0.07] px-3 py-1.5">
        <span className="hidden text-xs font-medium uppercase tracking-wider text-silik sm:inline">Bakiye</span>
        {bakiye === null ? <span className="sayi text-soluk">…</span> : <Muz miktar={bakiye} canli boyut={20} className="text-lg font-semibold text-muz" />}
      </div>
    </header>
  );
}

function AltCubuk({ ekran, git }) {
  const [menu, setMenu] = useState(false);
  const ekranlar = useEkranlar();
  const altta = ekranlar.filter((e) => ALT_CUBUK.includes(e.kimlik));
  const digerAktif = !ALT_CUBUK.includes(ekran);
  const yeniVar = ekranlar.some((e) => e.yeni && !ALT_CUBUK.includes(e.kimlik));
  return (
    <>
      <nav aria-label="Ekranlar" className="flex shrink-0 border-t border-cizgi bg-yuzey/95 pb-[var(--saib)] backdrop-blur md:hidden">
        {altta.map((e) => <GezinmeDugmesi key={e.kimlik} dar ekran={e} aktif={e.kimlik === ekran} onClick={() => git(e.kimlik)} />)}
        <button type="button" onClick={() => setMenu(true)} aria-haspopup="dialog" aria-current={digerAktif ? 'page' : undefined} className={cn('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[11px] font-medium transition-colors active:opacity-70', digerAktif ? 'text-muz' : 'text-soluk')}>
          {yeniVar && <span className="absolute left-1/2 top-1.5 ml-3 size-2.5 rounded-full bg-muz ring-2 ring-yuzey" aria-label="Yeni ekran var" />}
          <SekmeIkonu Ikon={Menu} aktif={digerAktif} />
          Menü
        </button>
      </nav>
      <Pencere acik={menu} degisti={setMenu} baslik="Menü">
        <div className="flex flex-col gap-4">
          {[...new Set(ekranlar.map((e) => e.grup))].map((g) => (
            <section key={g} className="flex flex-col gap-2">
              <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-silik">{g}</h2>
              <div className="grid grid-cols-3 gap-2">
                {ekranlar.filter((e) => e.grup === g).map((e) => {
                  const Ikon = e.ikon;
                  return (
                    <button
                      key={e.kimlik}
                      type="button"
                      onClick={() => { git(e.kimlik); setMenu(false); }}
                      aria-current={e.kimlik === ekran ? 'page' : undefined}
                      className={cn('relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center text-[13px] font-medium leading-tight transition-colors active:scale-[0.97]', e.kimlik === ekran ? 'border-muz/40 bg-muz/10 text-muz' : 'border-cizgi bg-yuzey-2 text-metin hover:border-cizgi-guclu')}
                    >
                      {e.yeni && <YeniEtiketi className="absolute -right-1 -top-1.5" />}
                      <Ikon className={cn('size-6', e.kimlik !== ekran && 'text-soluk')} />
                      {e.ad}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </Pencere>
    </>
  );
}

/** Her sayfanın altında: bunun gerçek para ya da gerçek kumar olmadığını açıkça söyler. */
function YasalUyari() {
  return (
    <footer className="mx-auto mt-12 flex w-full max-w-6xl gap-3 border-t border-cizgi pt-5 pb-2 text-xs leading-relaxed text-silik">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong className="font-semibold text-soluk">Yasal uyarı:</strong>{' '}
        Bu uygulama bir Discord sunucusuna ait eğlence amaçlı bir oyundur; gerçek bir kumar ya da bahis sitesi
        değildir. "Muz" yalnız bu sunucuda geçerli sanal bir puandır: gerçek parayla satın alınamaz, gerçek paraya,
        mala ya da hizmete çevrilemez, kişiler arasında para karşılığı devredilemez. Hiçbir oyunda gerçek para
        kazanılmaz ya da kaybedilmez. Oyunlardaki şans ve çarpanlar yalnız sanal ekonomiyi dengelemek içindir.
      </p>
    </footer>
  );
}

export default function App() {
  const ekran = useUygulama((s) => s.ekran);
  const secenek = useUygulama((s) => s.ekranSecenek);
  const git = useUygulama((s) => s.git);
  const icerik = useRef(null);
  const ekranlar = useEkranlar();
  const tanim = ekranlar.find((e) => e.kimlik === ekran) ?? ekranlar[0];
  const genis = useGenis();
  useNabiz(tanim.kimlik);

  useEffect(() => {
    depo.yaz('son-ekran', tanim.kimlik);
    icerik.current?.scrollTo({ top: 0 });
  }, [tanim.kimlik, secenek]);

  const Bilesen = tanim.Bilesen;
  return (
    <MotionConfig reducedMotion="user">
      <IpucuSaglayici>
        <div className="flex h-full">
          <YanCubuk ekran={tanim.kimlik} git={git} />
          <div className="flex min-w-0 flex-1 flex-col">
            <UstCubuk />
            {!genis && <AkisBari yatay />}
            <main ref={icerik} className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-5 md:px-8 md:py-7">
              <div className="mx-auto w-full max-w-6xl flex-1">
                {/* Ekran geçişi sık yapılır: eskinin çıkışı beklenmez, yenisi kısa bir solmayla gelir. */}
                <motion.div
                  key={tanim.kimlik}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  <EkranSiniri key={tanim.kimlik}>
                    <Suspense fallback={<Yukleniyor />}>
                      <Bilesen secenek={secenek} />
                    </Suspense>
                  </EkranSiniri>
                </motion.div>
              </div>
              <YasalUyari />
            </main>
            <AltCubuk ekran={tanim.kimlik} git={git} />
          </div>
          {genis && <AkisBari />}
        </div>
        <OnayKatmani />
        <DavetPenceresi />
        <OlayPenceresi />
        <UzakPenceresi />
        <GrevKatmani />
        <Toaster
          position="top-right"
          offset={64}
          mobileOffset={{ top: 'calc(var(--sait) + 64px)', left: 12, right: 12 }}
          toastOptions={{
            classNames: {
              toast: '!bg-yuzey-2 !border !border-cizgi-guclu !text-metin !rounded-2xl !shadow-2xl !font-sans !text-sm !gap-3',
            },
          }}
        />
      </IpucuSaglayici>
    </MotionConfig>
  );
}
