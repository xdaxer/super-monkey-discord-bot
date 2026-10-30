import {
  ArrowUp, ChevronRight, Compass, Hammer, Lock, PawPrint, Shield, Sparkles, Star, Undo2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { EkranBaslik } from '@/components/Bolum.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { GeriSayim, useSimdi } from '@/components/GeriSayim.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { nadirlikRengi } from '@/ekranlar/magaza/nadirlikRenk.js';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { EmojiIkon } from '@/lib/emoji.jsx';
import { useApi, useEslesme, useIslem } from '@/lib/kancalar.js';
import { git } from '@/lib/store.js';
import { bicim, cn } from '@/lib/utils.js';

const yuzde = (oran) => `%${(oran * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
const sureMetni = (ms) => {
  const dk = Math.round(ms / 60_000);
  return dk >= 60 ? `${Math.floor(dk / 60)} sa${dk % 60 ? ` ${dk % 60} dk` : ''}` : `${dk} dk`;
};

/** Sefer türlerinin BTD resmi: devriyeye dart, ormana druid, balon avına MOAB. */
const SEFER_BTD = { kisa: 'btd_dart_monkey', orta: 'btd_druid', uzun: 'btd_moab' };

const ENGEL = {
  tavan: 'En üst kademe',
  capraz: 'Kapalı: bir yol 5, ikincisi en çok 2',
};

function Seferler({ veri, islem, bekliyor }) {
  const simdi = useSimdi(1000);
  const hazir = veri.seferler.filter((s) => s.hazir || s.bitis <= simdi).length;
  const topla = () => islem(async () => {
    const r = await api('/api/maymun/topla', { govde: {} });
    const kasalar = r.toplanan.filter((t) => t.kasa).map((t) => t.kasa.ad);
    const atlayan = r.toplanan.filter((t) => t.seviyeAtladi).map((t) => `${t.kart.ad} Sv ${t.seviye}`);
    bildirimGoster([
      `${r.toplanan.length} sefer döndü: **+${bicim(r.toplamMuz)}** muz`,
      kasalar.length ? `Kasa: ${kasalar.join(', ')}` : null,
      atlayan.length ? `Seviye atlayan: ${atlayan.join(', ')}` : null,
    ].filter(Boolean).join('\n'), 'basari');
    return r;
  });
  const geri = async (s) => {
    const evet = await onayIste({
      baslik: `${s.kart.ad} geri çağrılsın mı?`,
      metin: 'Maymun hemen döner ama bu seferin muzunu ve XP\'sini getirmez.',
      evet: 'Geri çağır',
      tehlikeli: true,
    });
    if (evet) islem(() => api('/api/maymun/geri', { govde: { id: s.id } }));
  };

  return (
    <Kart>
      <KartBaslik
        ikon={Compass}
        baslik={`Seferler · ${veri.seferler.length}/${veri.slot}`}
        aciklama={veri.sonrakiSlot ? `Sv ${veri.sonrakiSlot}'te bir sefer yeri daha açılır` : 'Bütün sefer yerleri açık'}
        sag={hazir > 0 && <Button tur="ana" boyut="sm" bekliyor={bekliyor} onClick={topla}><Sparkles />Topla ({hazir})</Button>}
      />
      {veri.seferler.length === 0 ? (
        <p className="text-sm text-soluk">Seferde maymunun yok. Aşağıdan bir maymun seç, sefere gönder; sen çalışırken ya da yokken muz ve XP toplasın.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {veri.seferler.map((s) => {
            const bitti = s.bitis <= simdi;
            const oran = Math.min(1, (simdi - s.baslangic) / (s.bitis - s.baslangic));
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-cizgi bg-yuzey-2 p-2.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-yuzey-3" style={{ borderColor: nadirlikRengi(s.kart.nadirlik) }}>
                  <Gorsel g={s.kart.gorsel} boyut={32} parlak={s.kart.parlak} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium"><EmojiIkon emoji={s.emoji} btd={SEFER_BTD[s.sure]} boyut={16} /><span className="truncate">{s.kart.ad}</span></span>
                    {bitti ? <Rozet tur="yesil">Döndü</Rozet> : <GeriSayim hedef={s.bitis} bitince="döndü" className="sayi text-xs text-soluk" />}
                  </div>
                  <Ilerleme oran={oran} yukseklik={4} renk={bitti ? 'var(--color-yesil)' : 'var(--color-muz)'} />
                  <p className="flex flex-wrap items-center gap-x-1 text-xs text-soluk">
                    <span>{s.ad}</span><span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap"><Muz miktar={s.muz} boyut={12} /> + {s.xp} XP</span>
                  </p>
                </div>
                {!bitti && (
                  <Button tur="hayalet" boyut="ikon" title="Geri çağır" aria-label={`${s.kart.ad} seferden geri çağır`} onClick={() => geri(s)}><Undo2 /></Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Kart>
  );
}

/** `secili` null ise (dar ekran) hiçbiri seçili görünmez; satırlar ayrıntı sayfasını açar. */
function MaymunListesi({ maymunlar, secili, sec }) {
  return (
    <div className="flex flex-col gap-2">
      {maymunlar.map((m) => (
        <button
          key={m.kimlik}
          type="button"
          onClick={() => sec(m.kimlik)}
          aria-current={secili === m.kimlik || undefined}
          className={cn('flex items-center gap-3 rounded-xl border p-2.5 text-left transition-[background,border-color,transform] active:scale-[0.99]', secili === m.kimlik ? 'border-muz/50 bg-muz/10' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
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
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
            <span className="font-medium">Sv {m.seviye}</span>
            <span className="sayi text-soluk">{m.yollar.join('-')}</span>
          </div>
          {(m.calisiyor || m.seferde > 0) && (
            <span className="shrink-0 text-soluk" title={m.calisiyor ? 'Çalışıyor' : 'Seferde'} aria-label={m.calisiyor ? 'Çalışıyor' : 'Seferde'}>
              {m.calisiyor ? <Hammer className="size-4" /> : <Compass className="size-4" />}
            </span>
          )}
          {secili === null && <ChevronRight className="size-4 shrink-0 text-silik" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

function Yol({
  yol, durum, bakiye, yukselt, bekliyor,
}) {
  const s = durum.sonraki;
  const engel = durum.engel === 'seviye' ? `Maymun Sv ${s.seviye} olmalı` : ENGEL[durum.engel];
  const yetmez = s && !durum.engel && bakiye < s.bedel;
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border p-3', durum.engel === 'capraz' ? 'border-cizgi bg-zemin/40 opacity-60' : 'border-cizgi bg-yuzey-2')}>
      <p className="flex items-center gap-2 font-medium"><EmojiIkon emoji={yol.emoji} boyut={16} />{yol.ad}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.span
            key={n}
            initial={false}
            animate={{ scale: n === durum.kademe ? [1, 1.25, 1] : 1 }}
            className={cn('h-2.5 flex-1 rounded-full', n <= durum.kademe ? 'bg-muz' : 'bg-yuzey-3 ring-1 ring-cizgi')}
          />
        ))}
      </div>
      <p className="min-h-8 text-xs text-soluk">{durum.simdi ? `Şu an: ${durum.simdi}` : 'Henüz yükseltilmedi.'}</p>
      {s ? (
        <div className="mt-auto flex flex-col gap-2">
          <p className="text-xs"><b>{s.kademe}. kademe:</b> {s.aciklama}</p>
          <Button
            tur={durum.engel ? 'ikincil' : 'ana'}
            boyut="sm"
            tam
            disabled={Boolean(durum.engel) || yetmez}
            bekliyor={bekliyor}
            onClick={yukselt}
          >
            {durum.engel ? <><Lock />{engel}</> : <><ArrowUp /><Muz miktar={s.bedel} boyut={14} /></>}
          </Button>
          {yetmez && <p className="text-xs text-kirmizi">Bakiyen yetmiyor</p>}
        </div>
      ) : <p className="mt-auto flex items-center gap-1.5 text-xs text-muz"><Star className="size-3.5 fill-current" />{ENGEL.tavan}</p>}
    </div>
  );
}

function MaymunDetayi({
  veri, m, islem, bekliyor, sayfada = false,
}) {
  const slotDolu = veri.seferler.length >= veri.slot;
  const yukselt = (i) => islem(async () => {
    const r = await api('/api/maymun/yukselt', { govde: { kimlik: m.kimlik, yol: i } });
    bildirimGoster(`**${m.kart.ad}** · ${veri.yollar[i].ad} ${r.kademe}: ${r.aciklama}`, 'basari');
    return r;
  });
  const gonder = (sure) => islem(async () => {
    const r = await api('/api/maymun/sefer', { govde: { kimlik: m.kimlik, sure } });
    bildirimGoster(`**${m.kart.ad}** yola çıktı: ${bicim(r.gonderilen.muz)} muz + ${r.gonderilen.xp} XP getirecek.`, 'basari');
    return r;
  });

  let seferEngeli = null;
  if (m.serbest < 1) seferEngeli = m.calisiyor ? 'Bu maymun çalışıyor (tek kopyası). Çalış kartından başka maymun seç.' : 'Bütün kopyaları seferde.';
  else if (slotDolu) seferEngeli = `Sefer yerlerin dolu (${veri.slot}).${veri.sonrakiSlot ? ` Sv ${veri.sonrakiSlot}'te bir yer daha açılır.` : ''}`;

  return (
    <motion.div key={m.kimlik} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <Kart className={cn('flex flex-col gap-4', sayfada && 'border-0 bg-none p-0 shadow-none')}>
        <div className="flex items-center gap-4">
          <span className="grid size-20 shrink-0 place-items-center rounded-2xl border-2 bg-yuzey-3" style={{ borderColor: nadirlikRengi(m.kart.nadirlik) }}>
            <Gorsel g={m.kart.gorsel} boyut={60} parlak={m.kart.parlak} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-display text-xl font-semibold">{m.kart.ad}</p>
              <Rozet tur="muz">Sv {m.seviye}</Rozet>
              <Rozet>{m.yollar.join('-')}</Rozet>
              {m.calisiyor && <Rozet tur="mavi"><Hammer />Çalışıyor</Rozet>}
              {m.seferde > 0 && <Rozet tur="mor"><Compass />Seferde</Rozet>}
            </div>
            <Ilerleme oran={m.xp / m.gereken} yukseklik={6} renk={nadirlikRengi(m.kart.nadirlik)} />
            <p className="flex items-center gap-1 text-xs text-soluk"><Shield className="size-3" />Direnç {yuzde(m.direnc)} · {m.xp}/{m.gereken} XP · çalıştıkça ve seferde seviye atlar</p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-silik">Yükseltme yolları</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {veri.yollar.map((y, i) => (
              <Yol key={y.kimlik} yol={y} durum={m.yolDurumu[i]} bakiye={veri.bakiye} yukselt={() => yukselt(i)} bekliyor={bekliyor} />
            ))}
          </div>
          <p className="mt-2 text-xs text-silik">BTD6 gibi: bir yol 5. kademeye, ikinci yol en çok 2. kademeye çıkar, üçüncü yol kapalı kalır. Yükseltmeler prestijde korunur.</p>
        </div>
      </Kart>
      <Kart className={cn(sayfada && 'border-0 bg-none p-0 shadow-none')}>
        <KartBaslik ikon={Compass} baslik="Sefere gönder" aciklama="Dönünce muz, XP ve küçük ihtimalle kasa getirir" />
        {seferEngeli && <p className="mb-3 rounded-lg bg-zemin/50 p-2.5 text-xs text-soluk">{seferEngeli}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          {veri.seferTurleri.map((s) => {
            const t = m.seferTahmini[s.kimlik];
            return (
              <button
                key={s.kimlik}
                type="button"
                disabled={Boolean(seferEngeli) || bekliyor}
                onClick={() => gonder(s.kimlik)}
                className="flex flex-col items-start gap-1.5 rounded-xl border border-cizgi bg-yuzey-2 p-3 text-left transition-colors hover:border-muz/50 hover:bg-muz/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-cizgi disabled:hover:bg-yuzey-2"
              >
                <EmojiIkon emoji={s.emoji} btd={SEFER_BTD[s.kimlik]} boyut={32} />
                <span className="text-sm font-medium">{s.ad}</span>
                <span className="text-xs text-soluk">{sureMetni(t.sureMs)}</span>
                <span className="flex items-center gap-1 text-sm"><Muz miktar={t.muz} boyut={14} /> + {t.xp} XP</span>
                <span className="text-[11px] text-silik">Kasa şansı %{bicim(Math.round((s.ahsap + s.demir) * 100 * m.etki.kasa))}</span>
              </button>
            );
          })}
        </div>
      </Kart>
    </motion.div>
  );
}

export default function Ekran() {
  const {
    veri, hata, yukleniyor, yenile, setVeri,
  } = useApi('/api/maymunlar', { aralik: 30_000 });
  const [secili, setSecili] = useState(null);
  const [calistir, bekliyor] = useIslem();
  // Genişte liste ve ayrıntı yan yana; darda ayrıntı listenin altında kaybolmasın diye sayfada açılır.
  const genis = useEslesme('(min-width: 1024px)');
  const [sayfa, setSayfa] = useState(false);

  if (yukleniyor && !veri) return <div className="flex flex-col gap-5"><EkranBaslik ikon={PawPrint} baslik="Maymunlar" /><Iskelet className="h-40" /><Iskelet className="h-72" /></div>;
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;

  /** İşlem yanıtı ekranın tam verisini taşır; doğrudan yerine konur. */
  const islem = (fn) => calistir(async () => {
    const r = await fn();
    if (r?.maymunlar) setVeri(r);
  });
  const m = veri.maymunlar.find((x) => x.kimlik === secili) ?? veri.maymunlar[0];
  const sec = (kimlik) => {
    setSecili(kimlik);
    if (!genis) setSayfa(true);
  };

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik
        ikon={PawPrint}
        baslik="Maymunlar"
        aciklama="Yükselt, sefere gönder; çalışırken de yokken de kazansınlar"
      />
      <Seferler veri={veri} islem={islem} bekliyor={bekliyor} />
      {veri.maymunlar.length === 0 ? (
        <Kart>
          <Bos
            baslik="Henüz maymunun yok"
            aciklama="Kuleler ve kahramanlar kasalardan çıkar. Her maymun yükseltilebilir ve sefere gidebilir."
            eylem={<Button tur="ana" boyut="sm" onClick={() => git('magaza')}>Kasa al</Button>}
          />
        </Kart>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Kart className="lg:sticky lg:top-4 lg:max-h-[70vh] lg:overflow-y-auto">
            <KartBaslik ikon={PawPrint} baslik={`Maymunların · ${veri.maymunlar.length}`} aciklama={genis ? undefined : 'Yükseltmek ya da sefere göndermek için dokun'} />
            <MaymunListesi maymunlar={veri.maymunlar} secili={genis ? m.kimlik : null} sec={sec} />
          </Kart>
          {genis ? (
            <MaymunDetayi veri={veri} m={m} islem={islem} bekliyor={bekliyor} />
          ) : (
            <Pencere acik={sayfa} degisti={setSayfa} baslik={m.kart.ad} aciklama={`Sv ${m.seviye} · yollar ${m.yollar.join('-')}`}>
              <MaymunDetayi veri={veri} m={m} islem={islem} bekliyor={bekliyor} sayfada />
            </Pencere>
          )}
        </div>
      )}
    </div>
  );
}
