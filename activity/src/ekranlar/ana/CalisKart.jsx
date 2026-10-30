import {
  Balloon, ChevronRight, ChevronsUpDown, Compass, Hammer, Lock, PawPrint, Shield, Shuffle, Siren, Sparkles, Wind, X, Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { Bos } from '@/components/Durumlar.jsx';
import { GeriSayim, useSimdi } from '@/components/GeriSayim.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Md } from '@/components/Md.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { nadirlikRengi } from '@/ekranlar/magaza/nadirlikRenk.js';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { EmojiIkon } from '@/lib/emoji.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { git, useUygulama } from '@/lib/store.js';
import { bicim, cn, sure } from '@/lib/utils.js';
import { carpanSatirlari, KasaEtiketi, Sayac } from './ortak.jsx';
import { YoklamaPenceresi } from './YoklamaPenceresi.jsx';

const yuzde = (oran) => `%${(oran * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
const ondalik = (s) => s.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** Şu anki enerji: sunucunun verdiği değer + o andan bu yana dolan (tembel dolum ön yüzde de akar). */
function anlikEnerji(bilgi, alinma, simdi) {
  return Math.min(bilgi.enerjiMaks, bilgi.enerji + Math.max(0, simdi - alinma) / bilgi.dolumMs);
}

function EnerjiCubugu({ bilgi, alinma }) {
  const simdi = useSimdi(1000);
  const enerji = anlikEnerji(bilgi, alinma, simdi);
  const calismaHakki = Math.floor(enerji / bilgi.bedel);
  const tamMs = Math.ceil((bilgi.enerjiMaks - enerji) * bilgi.dolumMs);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium"><Zap className="size-4 text-muz" />Enerji</span>
        <span className="sayi text-soluk"><b className="text-metin">{Math.floor(enerji)}</b>/{bilgi.enerjiMaks}</span>
      </div>
      <Ilerleme oran={enerji / bilgi.enerjiMaks} yukseklik={10} renk={enerji < bilgi.bedel ? 'var(--color-kirmizi)' : 'var(--color-muz)'} />
      <p className="text-xs text-silik">
        {calismaHakki} çalışmalık · her çalışma {ondalik(bilgi.bedel)} enerji
        {tamMs > 0 ? ` · ${Math.round(tamMs / 60_000)} dk'da dolu` : ' · dolu'}
      </p>
    </div>
  );
}

function MaymunOzeti({ m, onSec }) {
  if (!m.kart) {
    return (
      <button type="button" onClick={onSec} className="flex items-center gap-3 rounded-xl border border-dashed border-cizgi-guclu p-3 text-left transition-colors hover:border-muz/50 hover:bg-muz/5">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-yuzey-3 text-soluk"><PawPrint className="size-6" /></div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Maymun kilitle</p>
          <p className="text-xs text-soluk">Maymunsuz direnç {yuzde(m.direnc)}. Bir kule ya da kahraman daha az yorulur.</p>
        </div>
      </button>
    );
  }
  return (
    <button type="button" onClick={onSec} className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-yuzey-3" style={{ borderColor: nadirlikRengi(m.kart.nadirlik) }}>
      <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-yuzey-3"><Gorsel g={m.kart.gorsel} boyut={36} parlak={m.kart.parlak} /></div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{m.kart.ad}</p>
          <Rozet>Sv {m.seviye}</Rozet>
        </div>
        <Ilerleme oran={m.xp / m.gereken} yukseklik={4} renk={nadirlikRengi(m.kart.nadirlik)} />
        <p className="flex items-center gap-1 text-xs text-soluk">
          <Shield className="size-3" />Direnç {yuzde(m.direnc)} · {m.xp}/{m.gereken} XP
          {m.yollar?.some((n) => n > 0) && <> · yollar <b className="sayi text-metin">{m.yollar.join('-')}</b></>}
        </p>
      </div>
    </button>
  );
}

function MaymunSecimi({ acik, degisti, aktif, secildi }) {
  const [liste, setListe] = useState(null);
  const [calistir, bekliyor] = useIslem();
  useEffect(() => {
    if (acik) calistir(async () => setListe((await api('/api/calis/maymunlar')).maymunlar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);
  const sec = (kimlik) => calistir(async () => {
    const r = await api('/api/calis/maymun', { govde: { kimlik } });
    bildirimGoster(kimlik ? `**${r.bilgi.maymun.kart.ad}** artık seninle çalışıyor.` : 'Maymunun kilidi kalktı.', 'basari');
    secildi(r.bilgi);
    degisti(false);
  });
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      baslik="Çalışan maymun"
      aciklama="Direnç her çalışmanın yorgunluğunu azaltır. Maymun çalıştıkça seviye atlar; nadir ve parlak maymunlar daha hızlı güçlenir. Çalışan kopya satılamaz, takas ve hediye edilemez."
    >
      {liste === null ? <p className="py-6 text-center text-sm text-soluk">Yükleniyor…</p> : liste.length === 0 ? (
        <Bos baslik="Envanterinde maymun yok" aciklama="Kuleler ve kahramanlar kasalardan çıkar." eylem={<Button boyut="sm" onClick={() => { degisti(false); git('magaza'); }}>Kasa al</Button>} className="py-4" />
      ) : (
        <div className={cn('flex flex-col gap-2', bekliyor && 'pointer-events-none opacity-70')}>
          {aktif && (
            <Button tur="hayalet" boyut="sm" onClick={() => sec(null)} className="self-start"><X />Maymunu bırak</Button>
          )}
          {liste.map((m) => {
            const secili = aktif === m.kart.kimlik;
            return (
              <button
                key={m.kart.kimlik}
                type="button"
                onClick={() => !secili && sec(m.kart.kimlik)}
                role="radio"
                aria-checked={secili}
                className={cn('secim flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors', secili ? 'border-muz/50 bg-muz/10' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-yuzey-3" style={{ borderColor: nadirlikRengi(m.kart.nadirlik) }}>
                  <Gorsel g={m.kart.gorsel} boyut={32} parlak={m.kart.parlak} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {m.kart.parlak && <Sparkles className="size-3.5 text-muz" />}{m.kart.ad}
                    {m.adet > 1 && <span className="text-xs text-silik">×{m.adet}</span>}
                  </p>
                  <Ilerleme oran={m.xp / m.gereken} yukseklik={3} renk={nadirlikRengi(m.kart.nadirlik)} />
                </div>
                <div className="flex shrink-0 flex-col items-end text-xs">
                  <span className="font-medium">Sv {m.seviye}</span>
                  <span className="sayi text-soluk">{yuzde(m.direnc)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Pencere>
  );
}

function MeslekSecimi({ acik, degisti, bilgi, secildi }) {
  const [calistir, bekliyor] = useIslem();
  const sec = (kimlik) => calistir(async () => {
    const r = await api('/api/calis/meslek', { govde: { kimlik } });
    bildirimGoster(r.otomatik ? `Otomatik seçime döndün: **${r.meslek.ad}**` : `Artık **${r.meslek.ad}** olarak çalışacaksın.`, 'basari');
    secildi(r.bilgi);
    degisti(false);
  });
  return (
    <Pencere acik={acik} degisti={degisti} baslik="Meslek seç" aciklama={`Seviye ${bilgi.seviye} · ${bilgi.acikAdet}/${bilgi.meslekler.length} meslek açık · kazanç çalışma başına`}>
      <div className={cn('grid grid-cols-2 gap-2', bekliyor && 'pointer-events-none opacity-70')}>
        <button
          type="button"
          onClick={() => sec('otomatik')}
          role="radio"
          aria-checked={bilgi.secim === 'otomatik'}
          className={cn('secim col-span-2 flex items-center gap-3 rounded-xl border p-3 text-left transition-colors', bilgi.secim === 'otomatik' ? 'border-muz/50 bg-muz/10' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
        >
          <div className="grid size-10 place-items-center rounded-lg bg-yuzey-3 text-muz"><Shuffle className="size-5" /></div>
          <div>
            <p className="text-sm font-medium">Otomatik</p>
            <p className="text-xs text-soluk">En yüksek açık meslek</p>
          </div>
        </button>
        {bilgi.meslekler.map((m) => {
          const secili = bilgi.secim === 'manuel' && m.aktif;
          return (
            <button
              key={m.kimlik}
              type="button"
              disabled={!m.acik}
              onClick={() => sec(m.kimlik)}
              role="radio"
              aria-checked={secili}
              className={cn('secim flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed', secili ? 'border-muz/50 bg-muz/10' : 'border-cizgi bg-yuzey-2', m.acik ? 'hover:border-cizgi-guclu' : 'opacity-50')}
            >
              <div className="flex w-full items-center justify-between">
                <Gorsel g={m.gorsel} boyut={32} />
                {!m.acik && <span className="flex items-center gap-1 text-xs text-silik"><Lock className="size-3" />Sv {m.seviye}</span>}
              </div>
              <p className="text-sm font-medium leading-tight">{m.ad}</p>
              <p className="sayi text-xs text-soluk">{bicim(m.min)}–{bicim(m.max)}</p>
            </button>
          );
        })}
      </div>
    </Pencere>
  );
}

/**
 * Çalış tıkının izi (sunucu: lib/calis-yoklama.js): düğmeye göre piksel,
 * klavyeyle mi basıldı, tarayıcı tıkı gerçek mi. Hep aynı noktaya basan
 * autoclicker'ı ve betikle verilen tıkı yoklamaya yakalatır.
 */
function tikIzi(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return {
    x: Math.round(e.clientX - r.left),
    y: Math.round(e.clientY - r.top),
    klavye: e.detail === 0,
    guvenli: e.nativeEvent?.isTrusted !== false,
  };
}

/** Olayın BTD resmi (emojisi genel bir balon/parıltı olanlar için). */
const OLAY_BTD = { moab: 'btd_moab', altin: 'btd_golden' };

/** Seçimli olay (MOAB, Altın Balon): iki düğme, süresi dolunca kaçar. */
function OlayKarti({ olay, coz, bekliyor }) {
  const simdi = useSimdi(1000);
  if (olay.bitis <= simdi) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-3 rounded-xl border border-muz/40 bg-gradient-to-br from-muz/15 to-transparent p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-lg font-semibold"><EmojiIkon emoji={olay.emoji} btd={OLAY_BTD[olay.kimlik]} boyut={28} />{olay.ad}!</p>
        <GeriSayim hedef={olay.bitis} bitince="kaçtı" className="sayi shrink-0 text-xs text-soluk" />
      </div>
      <p className="text-sm text-metin/90"><Md metin={olay.metin} /></p>
      <div className="grid grid-cols-2 gap-2">
        {olay.secenekler.map((s, i) => (
          <Button key={s.kimlik} tur={i === 0 ? 'ana' : 'ikincil'} bekliyor={bekliyor} onClick={() => coz(s.kimlik)}>
            <EmojiIkon emoji={s.emoji} boyut={16} renksiz />{s.etiket}
          </Button>
        ))}
      </div>
    </motion.div>
  );
}

/** Anlık olayın (usta, mola, antrenman, kasa) sonucu. */
function AnlikOlay({ olay }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-muz/30 bg-muz/[0.07] p-3 text-sm">
      <p><b className="inline-flex items-center gap-1.5 align-[-0.15em]"><EmojiIkon emoji={olay.emoji} btd={OLAY_BTD[olay.kimlik]} boyut={18} />{olay.ad}!</b> <Md metin={olay.metin} /></p>
      {olay.muz > 0 && <span className="sayi font-semibold text-yesil">+{bicim(olay.muz)}</span>}
      {olay.kasa && <div className="flex items-center gap-2 text-xs text-soluk"><KasaEtiketi kasa={olay.kasa} boyut={18} /> envanterine eklendi</div>}
    </div>
  );
}

/** Çalış: ana gelir. Meslek, enerji, çalışan maymun ve 15 sn'lik düğme. */
export function CalisKart({ o, yenile }) {
  const [bilgi, setBilgiHam] = useState(o.calis);
  const [alinma, setAlinma] = useState(Date.now());
  const [bitis, setBitis] = useState(Date.now() + o.calis.kalanMs);
  const [sonuc, setSonuc] = useState(null);
  const [meslekPencere, setMeslekPencere] = useState(false);
  const [maymunPencere, setMaymunPencere] = useState(false);
  const [bekleyen, setBekleyen] = useState(o.calis.bekleyenOlay ?? null);
  const [calistir, bekliyor] = useIslem();
  const simdi = useSimdi(250);

  const setBilgi = (b) => {
    setBilgiHam(b);
    setAlinma(Date.now());
    useUygulama.getState().grevAyarla(b.grev ?? null);
  };
  // Grev oyunu bitince enerji değişmiştir: taze durumu al.
  const grevSayac = useUygulama((s) => s.grevSayac);
  useEffect(() => {
    useUygulama.getState().grevAyarla(o.calis.grev ?? null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (grevSayac === 0) return;
    api('/api/calis').then((b) => { setBilgiHam(b); setAlinma(Date.now()); }).catch(() => {});
  }, [grevSayac]);
  const grevDene = () => calistir(async () => setBilgi((await api('/api/calis/grev-test', { govde: {} })).bilgi));
  const aktif = bilgi.meslekler.find((m) => m.aktif) ?? bilgi.meslekler[0];
  const enerji = anlikEnerji(bilgi, alinma, simdi);
  const yorgun = enerji < bilgi.bedel;
  const beklemede = bitis > simdi;
  const yorgunBitis = alinma + Math.ceil((bilgi.bedel - bilgi.enerji) * bilgi.dolumMs);

  // İz tık anında okunur: currentTarget olay bitince boşalır.
  const calis = (e) => {
    const tik = tikIzi(e);
    return calistir(async () => {
      const r = await api('/api/calis', { govde: tik });
      setBilgi(r.bilgi);
      if (!r.calisti) {
        setBitis(Date.now() + (r.yorgun ? 0 : r.kalanMs));
        return;
      }
      setBitis(Date.now() + r.kalanMs);
      setSonuc(r);
      if (r.olayEtkisi?.secenekler) setBekleyen(r.olayEtkisi);
      if (r.maymun?.seviyeAtladi) bildirimGoster(`**${r.maymun.kart.ad}** Sv ${r.maymun.seviye} oldu, artık daha az yoruluyor!`, 'basari');
      yenile();
    });
  };

  const yoklamaCevapla = (secim, bosTik) => calistir(async () => {
    const r = await api('/api/calis/yoklama', { govde: { secim, bosTik } });
    setBilgi(r.bilgi);
    bildirimGoster(
      r.dogru ? 'Yoklama tamam, çalışmaya devam.' : `Yanlış maymun! Ustabaşı **${sure(r.cezaMs)}** sonra yeniden soracak.`,
      r.dogru ? 'basari' : 'hata',
    );
  });

  const olayCoz = async (secim) => {
    const tamam = await calistir(async () => {
      const r = await api('/api/calis/olay', { govde: { secim } });
      setBekleyen(null);
      setBilgi(r.bilgi);
      bildirimGoster(r.muz > 0 ? `${r.metin} **+${bicim(r.muz)}** muz` : r.metin, r.muz > 0 ? 'basari' : 'bilgi');
      yenile();
      return true;
    });
    if (!tamam) {
      // Olay kaçtıysa kart kalkar; enerji yetmediyse yerinde kalır.
      const b = await api('/api/calis').catch(() => null);
      if (b) {
        setBilgi(b);
        setBekleyen(b.bekleyenOlay);
      }
    }
  };

  const totemAl = () => calistir(async () => {
    await api('/api/magaza/al', { govde: { kimlik: bilgi.totem.kimlik } });
    setBilgi(await api('/api/calis'));
    setBitis(Date.now());
    bildirimGoster('Enerji Totemi enerjini doldurdu!', 'basari');
    yenile();
  });

  const anlikOlay = sonuc?.olayEtkisi && !sonuc.olayEtkisi.secenekler ? sonuc.olayEtkisi : null;
  const totemGoster = bilgi.totem && enerji < bilgi.enerjiMaks * 0.3;
  const satirlar = sonuc ? [...carpanSatirlari(sonuc), ...(sonuc.rozet > 0 ? [['Rozetler', `+%${sonuc.rozet}`]] : [])] : [];
  return (
    <Kart className="flex flex-col gap-4">
      <KartBaslik
        ikon={Hammer}
        baslik="Çalış"
        aciklama="Asıl gelir: 15 sn'de bir, enerjin yettikçe"
        sag={<Button tur="hayalet" boyut="sm" onClick={() => setMeslekPencere(true)}><ChevronsUpDown />Meslek</Button>}
        className="mb-0"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-cizgi bg-yuzey-3"><Gorsel g={aktif.gorsel} boyut={42} /></div>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold">{aktif.ad}</p>
              <p className="flex flex-wrap items-center gap-1 text-sm text-soluk">
                <Muz miktar={aktif.min} boyut={14} /> – <Muz miktar={aktif.max} boyut={14} /> / çalışma
              </p>
              {bilgi.rozetBonus > 0 && <p className="flex items-center gap-1 text-xs text-muz"><Balloon className="size-3.5" />Rozetler +%{bilgi.rozetBonus}</p>}
            </div>
          </div>
          <EnerjiCubugu bilgi={bilgi} alinma={alinma} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-silik">Çalışan maymun</p>
          <MaymunOzeti m={bilgi.maymun} onSec={() => setMaymunPencere(true)} />
        </div>
      </div>

      {bilgi.hazirSefer > 0 && (
        <button type="button" onClick={() => git('maymunlar')} className="flex items-center gap-2 rounded-xl border border-yesil/30 bg-yesil/[0.07] p-3 text-left text-sm transition-colors hover:bg-yesil/10">
          <Compass className="size-4 text-yesil" />
          <span className="flex-1"><b>{bilgi.hazirSefer}</b> seferin döndü, ödülleri topla</span>
          <ChevronRight className="size-4 text-yesil" aria-hidden />
        </button>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {totemGoster && (
          <Button tur="cizgili" tam bekliyor={bekliyor} disabled={bilgi.totem.kalan < 1} onClick={totemAl}>
            <Zap className="text-muz" />Enerji Totemi · <Muz miktar={bilgi.totem.fiyat} boyut={14} />
            <span className="text-xs text-soluk">({bilgi.totem.kalan > 0 ? `bugün ${bilgi.totem.kalan} hak` : 'yarın yenilenir'})</span>
          </Button>
        )}
        {yorgun ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-cizgi bg-zemin/40 p-4 text-sm">
            <span className="flex items-center gap-2 text-soluk"><Wind className="size-4" />Yoruldun, dinleniyorsun</span>
            <GeriSayim hedef={yorgunBitis} bitince="hazır" className="sayi font-medium" />
          </div>
        ) : (
          <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} disabled={beklemede} onClick={calis} className="h-14 text-base font-semibold">
            <Hammer />{beklemede ? `${Math.ceil((bitis - simdi) / 1000)} sn` : 'Çalış'}
          </Button>
        )}
      </div>

      {/* Sonuç düğmenin altında belirir: art arda basarken düğme yerinden kaymaz. */}
      {bekleyen && <OlayKarti olay={bekleyen} coz={olayCoz} bekliyor={bekliyor} />}
      {sonuc && (
        <motion.div key={sonuc.bakiye} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-yesil/25 bg-yesil/[0.06] p-4">
          <p className="text-sm text-metin/90"><Md metin={sonuc.olay} /></p>
          <span className="sayi text-2xl font-semibold text-yesil">+<Sayac hedef={sonuc.kazanc} sure={500} /></span>
          {satirlar.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-soluk">
              {satirlar.map(([e, d]) => <li key={e}>{e}: {d}</li>)}
            </ul>
          )}
          {sonuc.kasa && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-soluk">
              Bonus: <KasaEtiketi kasa={sonuc.kasa} boyut={20} /> envanterine eklendi
            </div>
          )}
          {anlikOlay && <AnlikOlay olay={anlikOlay} />}
        </motion.div>
      )}

      <p className="text-xs text-silik">
        Her çalışmada {yuzde(bilgi.olaySansi)} olay, %{bilgi.bonus.ahsap.toLocaleString('tr-TR')} Ahşap, %{bilgi.bonus.demir.toLocaleString('tr-TR')} Demir Kasa şansı.
        {bilgi.sonraki ? ` Sıradaki meslek: ${bilgi.sonraki.ad} (Sv ${bilgi.sonraki.seviye}).` : ' Bütün meslekler açık.'}
        {bilgi.grevTest && (
          <button type="button" onClick={grevDene} aria-label="Dene" className="ml-1 inline-block align-middle opacity-20 transition-opacity hover:opacity-70"><Siren className="size-3" /></button>
        )}
      </p>
      {bilgi.yoklama && (
        <YoklamaPenceresi key={bilgi.yoklama.id} yoklama={bilgi.yoklama} cevapla={yoklamaCevapla} bekliyor={bekliyor} />
      )}
      <MeslekSecimi acik={meslekPencere} degisti={setMeslekPencere} bilgi={bilgi} secildi={setBilgi} />
      <MaymunSecimi acik={maymunPencere} degisti={setMaymunPencere} aktif={bilgi.maymun.kart?.kimlik ?? null} secildi={setBilgi} />
    </Kart>
  );
}
