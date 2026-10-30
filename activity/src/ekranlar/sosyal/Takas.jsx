import {
  ArrowLeftRight, Check, Handshake, Inbox, Minus, Plus, Send, UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Gorsel, nadirlikRengi } from '@/components/Gorsel.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Giris } from '@/components/ui/giris.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import {
  bicim, cn, sure, tarih,
} from '@/lib/utils.js';
import { DiscordRozeti, Kalemler, UyeEtiketi } from './ortak.jsx';

const DURUM = {
  kabul: ['yesil', 'Kabul edildi'],
  red: ['kirmizi', 'Reddedildi'],
  geri: ['notr', 'Geri çekildi'],
  suresi: ['notr', 'Süresi doldu'],
};

const ADIMLAR = ['Kişi', 'Vereceklerin', 'İstediklerin', 'Özet'];

/** Eşya ızgarası: tek eşya seçilir, adedi artırılıp azaltılır. */
function EsyaIzgarasi({ esyalar, secim, degis, adetSiniri }) {
  const secili = secim ? esyalar.find((e) => e.kimlik === secim.kimlik) : null;
  const enCok = secili ? Math.min(secili.adet, adetSiniri) : 1;
  if (esyalar.length === 0) return <p className="rounded-xl border border-dashed border-cizgi py-6 text-center text-sm text-silik">Takas edilebilir eşya yok (yalnız kasalar ve kartlar).</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {esyalar.map((e) => {
          const aktif = secim?.kimlik === e.kimlik;
          return (
            <button
              key={e.kimlik}
              type="button"
              onClick={() => degis(aktif ? null : { kimlik: e.kimlik, adet: 1 })}
              className={cn('flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors', aktif ? 'bg-muz/10 ring-1 ring-muz/60' : 'bg-yuzey-2 hover:border-cizgi-guclu')}
              style={{ borderColor: aktif ? undefined : `color-mix(in oklab, ${nadirlikRengi(e.nadirlik)} 45%, transparent)` }}
            >
              <Gorsel g={e.gorsel} boyut={32} parlak={e.parlak} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium leading-tight">{e.ad}</span>
                <span className="sayi text-xs text-soluk">×{bicim(e.adet)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {secili && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-soluk">Adet</span>
          <Button boyut="ikon" tur="ikincil" onClick={() => degis({ ...secim, adet: Math.max(1, secim.adet - 1) })}><Minus /></Button>
          <span className="sayi w-10 text-center font-semibold">{secim.adet}</span>
          <Button boyut="ikon" tur="ikincil" onClick={() => degis({ ...secim, adet: Math.min(enCok, secim.adet + 1) })}><Plus /></Button>
          <Button boyut="sm" tur="hayalet" onClick={() => degis({ ...secim, adet: enCok })}>en çok</Button>
        </div>
      )}
    </div>
  );
}

function MuzAlani({ deger, degisti, muzMin }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-soluk">Muz (isteğe bağlı)</span>
      <Giris type="number" inputMode="numeric" min="0" step="1" value={deger} onChange={(e) => degisti(e.target.value)} placeholder={`0 (en az ${muzMin})`} className="sayi" />
    </label>
  );
}

function Sihirbaz({ takas, yenile }) {
  const [t, setT] = useState(null);
  const [secici, setSecici] = useState(false);
  const [calistir, bekliyor] = useIslem();
  const dolu = takas.giden.length >= takas.acikSiniri;
  const muzSayi = (m) => Math.max(0, Math.floor(Number(m) || 0));
  const taraf = (secim, esyalar, muz) => {
    const e = secim ? esyalar?.find((x) => x.kimlik === secim.kimlik) : null;
    return { esya: e ? { ...e, adet: secim.adet } : null, muz: muzSayi(muz) };
  };
  const gecerli = (tr) => Boolean(tr.esya) || tr.muz >= takas.muzMin;
  const guncelle = (k) => setT((o) => ({ ...o, ...k }));

  const uyeId = t?.uye?.id;
  const adim = t?.adim;
  useEffect(() => {
    if (adim !== 3 || t.karsiEsyalar) return undefined;
    let iptal = false;
    api(`/api/takas/esyalar/${uyeId}`).then((r) => { if (!iptal) setT((o) => (o && o.uye?.id === uyeId ? { ...o, karsiEsyalar: r.esyalar } : o)); })
      .catch((e) => bildirimGoster(e.message, 'hata'));
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adim, uyeId]);

  if (!t) {
    return (
      <Kart className="flex flex-col gap-4">
        <KartBaslik ikon={Handshake} baslik="Yeni takas teklifi" aciklama={`Kart, kasa ve muz takası. Teklif ${sure(takas.sureMs)} geçerli; en çok ${takas.acikSiniri} açık teklif.`} className="mb-0" />
        <Button tur="ana" boyut="lg" tam disabled={dolu} onClick={() => setT({ adim: 1, uye: null, ver: null, muzVer: '', iste: null, muzIste: '', karsiEsyalar: null })}>
          <Handshake />Teklif hazırla
        </Button>
        {dolu && <p className="text-xs text-silik">Açık teklif sınırına ulaştın; birini geri çek ya da bitmesini bekle.</p>}
      </Kart>
    );
  }

  const ver = taraf(t.ver, takas.esyalarim, t.muzVer);
  const iste = taraf(t.iste, t.karsiEsyalar, t.muzIste);
  const ileriOk = adim === 1 ? Boolean(t.uye) : adim === 2 ? gecerli(ver) : adim === 3 ? Boolean(t.karsiEsyalar) && gecerli(iste) : true;

  const gonder = () => calistir(async () => {
    await api('/api/takas/teklif', {
      govde: {
        uyeId: t.uye.id,
        muzVer: ver.muz,
        muzIste: iste.muz,
        ...(t.ver ? { ver: t.ver.kimlik, verAdet: t.ver.adet } : {}),
        ...(t.iste ? { iste: t.iste.kimlik, isteAdet: t.iste.adet } : {}),
      },
    });
    bildirimGoster(`**${t.uye.ad}** adlı üyeye takas teklifi gönderildi.`, 'basari');
    setT(null);
    await yenile();
  });

  return (
    <Kart className="flex flex-col gap-4">
      <KartBaslik ikon={Handshake} baslik="Yeni takas teklifi" className="mb-0" />
      <ol className="flex items-center gap-2">
        {ADIMLAR.map((ad, i) => (
          <li key={ad} className="flex flex-1 flex-col gap-1.5">
            <span className={cn('h-1 rounded-full', i + 1 <= adim ? 'bg-muz' : 'bg-yuzey-3')} />
            <span className={cn('truncate text-[11px] font-medium', i + 1 === adim ? 'text-metin' : 'text-silik')}>{i + 1}. {ad}</span>
          </li>
        ))}
      </ol>

      {adim === 1 && (
        <button type="button" onClick={() => setSecici(true)} className="flex h-12 items-center gap-3 rounded-xl border border-cizgi bg-zemin/60 px-3 text-left transition-colors hover:border-cizgi-guclu">
          {t.uye ? <Avatar uye={t.uye} boyut={28} /> : <span className="grid size-7 place-items-center rounded-full bg-yuzey-3 text-silik"><UserRound className="size-4" /></span>}
          <span className={t.uye ? 'flex-1 truncate font-medium' : 'flex-1 text-sm text-silik'}>{t.uye ? t.uye.ad : 'Kiminle takas yapacaksın?'}</span>
        </button>
      )}
      {adim === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm"><strong>Ne vereceksin?</strong> <span className="text-soluk">Eşya seç ve/veya muz yaz.</span></p>
          <EsyaIzgarasi esyalar={takas.esyalarim} secim={t.ver} degis={(v) => guncelle({ ver: v })} adetSiniri={takas.adetSiniri} />
          <MuzAlani deger={t.muzVer} degisti={(v) => guncelle({ muzVer: v })} muzMin={takas.muzMin} />
          <p className="text-xs text-silik">Muz kısmında %{takas.vergiYuzde} vergi kesilir ve günlük gönderim limitine sayılır.</p>
        </div>
      )}
      {adim === 3 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm"><strong>{t.uye.ad} ne verecek?</strong> <span className="text-soluk">Onun eşyalarından seç ve/veya muz yaz.</span></p>
          {t.karsiEsyalar
            ? <EsyaIzgarasi esyalar={t.karsiEsyalar} secim={t.iste} degis={(v) => guncelle({ iste: v })} adetSiniri={takas.adetSiniri} />
            : <p className="py-6 text-center text-sm text-soluk">Eşyalar yükleniyor…</p>}
          <MuzAlani deger={t.muzIste} degisti={(v) => guncelle({ muzIste: v })} muzMin={takas.muzMin} />
        </div>
      )}
      {adim === 4 && (
        <div className="flex flex-col gap-3">
          <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex flex-col gap-2 rounded-xl border border-cizgi bg-zemin/30 p-3.5"><span className="text-xs text-soluk">Sen verirsin</span><Kalemler taraf={ver} /></div>
            <ArrowLeftRight className="mx-auto size-5 rotate-90 text-muz sm:rotate-0" />
            <div className="flex flex-col gap-2 rounded-xl border border-cizgi bg-zemin/30 p-3.5"><span className="text-xs text-soluk">{t.uye.ad} verir</span><Kalemler taraf={iste} /></div>
          </div>
          <p className="text-xs text-silik">Teklif {sure(takas.sureMs)} geçerli. Eşyalar kabul anında kontrol edilir; muz kısmında %{takas.vergiYuzde} vergi kesilir.</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button tur="hayalet" onClick={() => (adim === 1 ? setT(null) : guncelle({ adim: adim - 1 }))}>{adim === 1 ? 'Vazgeç' : 'Geri'}</Button>
        {adim < 4
          ? <Button tur="ana" disabled={!ileriOk} onClick={() => guncelle({ adim: adim + 1 })}>İleri</Button>
          : <Button tur="ana" bekliyor={bekliyor} onClick={gonder}><Send />Teklifi gönder</Button>}
      </div>
      <UyeSecici
        acik={secici}
        degisti={setSecici}
        baslik="Kiminle takas?"
        sec={(u) => setT((o) => ({ ...o, uye: u, ...(o.uye?.id !== u.id ? { iste: null, karsiEsyalar: null, muzIste: '' } : {}) }))}
      />
    </Kart>
  );
}

function TeklifKarti({ t, gelen, yenile }) {
  const [calistir, bekliyor] = useIslem();
  const diger = gelen ? t.eden : t.karsi;
  const eylem = (yol, mesaj) => calistir(async () => {
    await api(`/api/takas/${t.id}/${yol}`, { govde: {} });
    if (mesaj) bildirimGoster(mesaj, 'basari');
    await yenile();
  });
  const sol = gelen ? [`${t.eden.ad} verir`, t.ver] : ['Sen verirsin', t.ver];
  const sag = gelen ? ['Sen verirsin', t.iste] : [`${t.karsi.ad} verir`, t.iste];
  const kutu = ([ad, tr]) => (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-cizgi bg-zemin/30 p-3"><span className="truncate text-xs text-soluk">{ad}</span><Kalemler taraf={tr} boyut={28} /></div>
  );
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-cizgi bg-yuzey-2/60 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <UyeEtiketi uye={diger} boyut={28} />
        <div className="flex shrink-0 items-center gap-2"><DiscordRozeti goster={t.discordda} /><span className="text-xs text-soluk">{gelen ? 'sana teklif etti' : 'teklifin bekliyor'}</span></div>
      </div>
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        {kutu(sol)}
        <ArrowLeftRight className="mx-auto size-4 rotate-90 text-muz sm:rotate-0" />
        {kutu(sag)}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-soluk">Kalan <GeriSayim hedef={t.bitis} bitince="süresi doldu" onBitti={yenile} className="sayi text-metin" /></span>
        <div className="flex gap-2">
          {gelen ? (
            <>
              <Button tur="basari" boyut="sm" bekliyor={bekliyor} onClick={() => eylem('kabul', `Takas tamamlandı: **${t.eden.ad}** ile.`)}><Check />Kabul et</Button>
              <Button tur="hayalet" boyut="sm" disabled={bekliyor} onClick={() => eylem('reddet')}>Reddet</Button>
            </>
          ) : <Button tur="hayalet" boyut="sm" bekliyor={bekliyor} onClick={() => eylem('geri-cek')}>Geri çek</Button>}
        </div>
      </div>
    </li>
  );
}

function Liste({ ikon, baslik, liste, bos, gelen, yenile }) {
  return (
    <Kart>
      <KartBaslik ikon={ikon} baslik={baslik} sag={liste.length > 0 ? <Rozet tur="kirmizi">{liste.length}</Rozet> : null} />
      {liste.length === 0 ? <p className="py-3 text-center text-sm text-silik">{bos}</p> : (
        <ul className="flex flex-col gap-3">{liste.map((t) => <TeklifKarti key={t.id} t={t} gelen={gelen} yenile={yenile} />)}</ul>
      )}
    </Kart>
  );
}

export function TakasSekmesi({ veri, gecmis, yenile }) {
  const ben = useUygulama((s) => s.kullanici?.id);
  const t = veri.takas;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Sihirbaz takas={t} yenile={yenile} />
        <Liste ikon={Send} baslik="Gönderdiğin teklifler" liste={t.giden} bos="Açık teklifin yok." gelen={false} yenile={yenile} />
      </div>
      <div className="flex flex-col gap-4">
        <Liste ikon={Inbox} baslik="Gelen teklifler" liste={t.gelen} bos="Sana gelen teklif yok." gelen yenile={yenile} />
        <Kart>
          <KartBaslik ikon={Handshake} baslik="Son durumlar" />
          {!gecmis || gecmis.takaslar.length === 0 ? <p className="py-3 text-center text-sm text-silik">Kapanmış teklif yok.</p> : (
            <ul className="flex flex-col divide-y divide-cizgi">
              {gecmis.takaslar.map((x) => {
                const [tur, ad] = DURUM[x.durum] ?? ['notr', x.durum];
                const diger = x.eden.id === ben ? x.karsi : x.eden;
                return (
                  <li key={x.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5"><Rozet tur={tur}>{ad}</Rozet><UyeEtiketi uye={diger} boyut={22} className="text-sm" /></div>
                      <span className="shrink-0 text-xs text-silik">{tarih(x.bitis)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Kalemler taraf={x.ver} boyut={22} />
                      <ArrowLeftRight className="size-3.5 text-silik" />
                      <Kalemler taraf={x.iste} boyut={22} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Kart>
      </div>
    </div>
  );
}
