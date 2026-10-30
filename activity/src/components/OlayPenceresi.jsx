import {
  ArrowDownRight, ArrowUpRight, Banana, Briefcase, ChartCandlestick, Crosshair, Footprints, Newspaper, Package, PartyPopper, Skull, Sparkles, Star, Swords, Tag,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Gorsel, NesneGorseli } from '@/components/Gorsel.jsx';
import { Md } from '@/components/Md.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { konfetiPatlat } from '@/ekranlar/prestij/konfeti.js';
import { api } from '@/lib/api.js';
import {
  bossSesi, davetSesi, gucSesi, haberSesi, kacisSesi, zaferSesi,
} from '@/lib/ses.js';
import { duyuruIkonu } from '@/lib/duyuru-ikon.js';
import { nesne, useUygulama } from '@/lib/store.js';
import { bicim, depo, yuzde } from '@/lib/utils.js';

/** Olayları bu aralıkla yoklar (sekme görünürken). */
const YOKLAMA_MS = 15_000;
const GORULEN_ANAHTAR = 'gorulen-olaylar';
const GORULEN_SINIRI = 100;

const gorulen = new Set(depo.oku(GORULEN_ANAHTAR, []));

/** Olayı görüldü say: pencere açmaz (ör. sonucu Boss ekranında zaten gördü). */
export function olayGoruldu(...anahtarlar) {
  for (const a of anahtarlar) gorulen.add(a);
  depo.yaz(GORULEN_ANAHTAR, [...gorulen].slice(-GORULEN_SINIRI));
}

/** API yanıtından sıraya girecek olaylar; öncelik: etkinlik, sonuç, yeni boss, haberler. */
function olaylar(v) {
  const liste = [];
  for (const d of v.duyurular ?? []) liste.push({ anahtar: `duyuru-${d.id}`, tur: 'duyuru', veri: d });
  for (const e of v.etkinlikler ?? []) liste.push({ anahtar: `etkinlik-${e.id}`, tur: 'etkinlik', veri: e });
  if (v.bossSonuc) liste.push({ anahtar: `boss-sonuc-${v.bossSonuc.id}`, tur: 'bossSonuc', veri: v.bossSonuc });
  if (v.boss) liste.push({ anahtar: `boss-cikti-${v.boss.id}`, tur: 'boss', veri: v.boss });
  for (const h of v.haberler) liste.push({ anahtar: `haber-${h.id}`, tur: 'haber', veri: h });
  return liste;
}

const SES = {
  duyuru: davetSesi,
  etkinlik: () => { gucSesi(); setTimeout(zaferSesi, 450); },
  boss: bossSesi, haber: haberSesi, bossSonuc: (o) => (o.durum === 'yenildi' ? zaferSesi() : kacisSesi()),
};

/** Yönetici bildirimi (yönetim panelindeki önizleme de bunu kullanır). */
export function DuyuruIcerik({ o, kapat }) {
  const Ikon = duyuruIkonu(o.ikon);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <motion.div
        initial={{ scale: 0.6, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        className="grid size-20 place-items-center rounded-3xl bg-gradient-to-b from-muz to-muz-koyu text-muz-metin shadow-[0_12px_40px_-10px_rgb(255_212_59/0.8)]"
      >
        <Ikon className="size-10" strokeWidth={2.2} />
      </motion.div>
      <p className="font-display text-xl font-bold">{o.baslik}</p>
      <Md metin={o.metin} className="text-base" />
      {o.gonderen && (
        <span className="flex items-center gap-2 text-xs text-silik"><Avatar uye={o.gonderen} boyut={18} />{o.gonderen.ad} · Yönetim</span>
      )}
      <Button tur="ana" boyut="lg" tam onClick={kapat}>Tamam</Button>
    </div>
  );
}

/** Etkinlik türünün ikonu (arayüzde emoji kullanılmaz; verideki `simge` gösterilmez). */
const ETKINLIK_IKONU = { 'muz-2x': Banana, 'xp-2x': Sparkles, 'kasa-indirim': Tag };

function EtkinlikBasladi({ o, git, kapat }) {
  useEffect(() => {
    konfetiPatlat(true);
  }, []);
  const muzMu = o.tur === 'muz-2x';
  const Ikon = ETKINLIK_IKONU[o.tur] ?? PartyPopper;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <motion.div
        initial={{ scale: 0.5, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 12 }}
        className="grid size-24 place-items-center rounded-3xl bg-gradient-to-b from-muz to-muz-koyu text-muz-metin shadow-[0_12px_40px_-10px_rgb(255_212_59/0.8)]"
      >
        <Ikon className="size-12" strokeWidth={2.2} />
      </motion.div>
      <p className="font-display text-2xl font-bold text-muz">{o.ad} başladı!</p>
      <Md metin={o.etki} className="text-base" />
      <span className="text-sm text-soluk">Bitmesine <GeriSayim hedef={o.bitis} bitince="bitti" className="sayi text-metin" /></span>
      <div className="flex w-full gap-2">
        {muzMu && <Button tur="ana" boyut="lg" tam onClick={() => git('ana')}><Briefcase />Kazanmaya başla</Button>}
        <Button tur={muzMu ? 'hayalet' : 'ana'} boyut="lg" tam onClick={kapat}>{muzMu ? 'Sonra' : 'Harika'}</Button>
      </div>
    </div>
  );
}

function BossCikti({ o, git, kapat }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
        <Gorsel g={o.gorsel} boyut={96} />
      </motion.div>
      {o.elit && <Rozet tur="kirmizi"><Star />Elit</Rozet>}
      <p className="text-base"><b>{o.ad}</b> sunucuya saldırıyor! Herkes birlikte vurur; ne kadar vurursan o kadar muz.</p>
      <span className="text-xs text-soluk">Kaçmasına <GeriSayim hedef={o.bitis} bitince="kaçtı" className="sayi text-metin" /></span>
      <div className="flex w-full gap-2">
        <Button tur="tehlike" boyut="lg" tam onClick={() => git('boss')}><Swords />Savaşa git</Button>
        <Button tur="hayalet" boyut="lg" tam onClick={kapat}>Sonra</Button>
      </div>
    </div>
  );
}

function BossSonucu({ o, git, kapat }) {
  const yenildi = o.durum === 'yenildi';
  useEffect(() => {
    if (yenildi) konfetiPatlat(true);
  }, [yenildi]);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Gorsel g={o.gorsel} boyut={72} className={yenildi ? 'opacity-60 grayscale' : ''} />
      <p className="text-base">
        {yenildi
          ? <><b>{o.ad}</b> yenildi! Kazandığın ödüller hesabına geçti:</>
          : <><b>{o.ad}</b> 48 saatte yenilemedi ve kaçtı. Katıldığın için teselli ödülün hesabına geçti:</>}
      </p>
      <Muz miktar={o.muz} isaretli boyut={26} className="text-2xl font-bold" />
      {o.kasalar.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {o.kasalar.map((k, i) => (
            <span key={`${k}-${i}`} className="flex items-center gap-1.5 rounded-xl border border-cizgi bg-yuzey-3 px-2.5 py-1.5 text-sm">
              <NesneGorseli kimlik={k} boyut={22} />{nesne(k)?.ad ?? k}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-soluk">
        <span>{o.sira}. sıra / {o.katilimci} kişi</span>
        <span>· {bicim(o.hasar)} hasar</span>
        {o.sonVurus && <span className="flex items-center gap-1 font-medium text-muz"><Crosshair className="size-4" />Son vuruş senin</span>}
      </div>
      <div className="flex w-full gap-2">
        {o.kasalar.length > 0 && <Button tur="ana" boyut="lg" tam onClick={() => git('envanter', { sekme: 'kasalar' })}><Package />Kasalarım</Button>}
        <Button tur={o.kasalar.length > 0 ? 'hayalet' : 'ana'} boyut="lg" tam onClick={kapat}>Tamam</Button>
      </div>
    </div>
  );
}

function Haber({ o, git, kapat }) {
  const artis = o.yuzde > 0;
  const Ikon = artis ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Gorsel g={o.gorsel} boyut={56} />
      <div>
        <p className="font-semibold"><span className="sayi">{o.sembol}</span> <span className="font-normal text-soluk">· {o.ad}</span></p>
        <p className="mt-2 text-base">{o.metin}</p>
      </div>
      <Rozet tur={artis ? 'yesil' : 'kirmizi'} className="px-3 py-1 text-sm"><Ikon />Fiyata etkisi {yuzde(o.yuzde)}</Rozet>
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-soluk">
        <span>Elinde <b className="text-metin">{bicim(o.adet)}</b> adet var</span>
        {o.fiyat !== null && <span className="flex items-center gap-1">· güncel fiyat <Muz miktar={o.fiyat} boyut={16} className="text-metin" /></span>}
      </p>
      <div className="flex w-full gap-2">
        <Button tur="ana" boyut="lg" tam onClick={() => git('borsa', { sembol: o.sembol })}><ChartCandlestick />Borsaya git</Button>
        <Button tur="hayalet" boyut="lg" tam onClick={kapat}>Tamam</Button>
      </div>
    </div>
  );
}

const TURLER = {
  duyuru: { baslik: () => 'Bildirim', ikon: (o) => duyuruIkonu(o.ikon), Icerik: DuyuruIcerik },
  etkinlik: { baslik: () => 'Etkinlik başladı!', ikon: () => PartyPopper, Icerik: EtkinlikBasladi },
  boss: { baslik: () => 'Boss geldi!', ikon: () => Skull, Icerik: BossCikti },
  bossSonuc: { baslik: (o) => (o.durum === 'yenildi' ? 'Boss yenildi!' : 'Boss kaçtı'), ikon: (o) => (o.durum === 'yenildi' ? PartyPopper : Footprints), Icerik: BossSonucu },
  haber: { baslik: () => 'Elindeki hisseden haber', ikon: () => Newspaper, Icerik: Haber },
};

/**
 * Boss çıkışı, boss sonucu (katıldıysan ödülün ya da tesellin) ve elindeki
 * hisselerin haberleri: yeni gelen her olayda pencere açılır ve ses çalar.
 * Görülen olaylar cihazda hatırlanır; aynı olay ikinci kez pencere açmaz.
 */
export function OlayPenceresi() {
  const gitEkran = useUygulama((s) => s.git);
  const [sira, setSira] = useState([]);
  const sesler = useRef(new Set());

  useEffect(() => {
    let canli = true;
    const yokla = async () => {
      if (document.visibilityState !== 'visible') return;
      const v = await api('/api/olaylar').catch(() => null);
      if (!canli || !v) return;
      const { ekran } = useUygulama.getState();
      const yeni = olaylar(v).filter((o) => {
        if (gorulen.has(o.anahtar)) return false;
        // Boss ekranındaki üye bossu zaten görüyor.
        if (o.tur === 'boss' && ekran === 'boss') {
          olayGoruldu(o.anahtar);
          return false;
        }
        return true;
      });
      if (yeni.length === 0) return;
      olayGoruldu(...yeni.map((o) => o.anahtar));
      setSira((s) => [...s, ...yeni.filter((o) => !s.some((x) => x.anahtar === o.anahtar))]);
    };
    yokla();
    const t = setInterval(yokla, YOKLAMA_MS);
    return () => {
      canli = false;
      clearInterval(t);
    };
  }, []);

  const o = sira[0] ?? null;
  // Ses pencere öne geldiğinde bir kez çalar (sıradakiler kendi sırası gelince).
  useEffect(() => {
    if (!o || sesler.current.has(o.anahtar)) return;
    sesler.current.add(o.anahtar);
    SES[o.tur](o.veri);
  }, [o]);

  const kapat = () => setSira((s) => s.slice(1));
  const git = (ekran, secenek) => {
    kapat();
    gitEkran(ekran, secenek);
  };
  const tanim = o ? TURLER[o.tur] : null;

  return (
    <Pencere
      acik={Boolean(o)}
      degisti={(a) => { if (!a) kapat(); }}
      baslik={tanim?.baslik(o.veri) ?? ''}
      ikon={tanim?.ikon(o.veri)}
      aciklama={sira.length > 1 ? `${sira.length - 1} bildirim daha var` : undefined}
    >
      {tanim && <tanim.Icerik key={o.anahtar} o={o.veri} git={git} kapat={kapat} />}
    </Pencere>
  );
}
