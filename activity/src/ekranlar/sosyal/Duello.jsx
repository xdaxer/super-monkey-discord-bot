import {
  Inbox, Send, Swords, TriangleAlert, UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { GeriSayim } from '@/components/GeriSayim.jsx';
import { MiktarGirisi } from '@/components/MiktarGirisi.jsx';
import { Muz } from '@/components/Muz.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { bakiyeGuncelle, useUygulama } from '@/lib/store.js';
import { bicim, cn, tarih } from '@/lib/utils.js';
import { DiscordRozeti, OYUNLAR, UyeEtiketi } from './ortak.jsx';
import { DuelloSonucu } from './Sahne.jsx';
import { XoxTahtasi } from './Xox.jsx';

function MeydanOkuFormu({ veri, yenile }) {
  const d = veri.duello;
  const [rakip, setRakip] = useState(null);
  const [secici, setSecici] = useState(false);
  const [bahis, setBahis] = useState('');
  const [oyun, setOyun] = useState('zar');
  const [secim, setSecim] = useState('rastgele');
  const [calistir, bekliyor] = useIslem();

  const ac = () => {
    if (!rakip) { bildirimGoster('Önce bir rakip seç.', 'hata'); return undefined; }
    if (!bahis.trim()) { bildirimGoster('Bahis miktarını yaz.', 'hata'); return undefined; }
    return calistir(async () => {
      await api('/api/duello/ac', {
        govde: {
          rakipId: rakip.id, bahis: bahis.trim(), oyun, ...(oyun === 'yazitura' && secim !== 'rastgele' ? { secim } : {}),
        },
      });
      bildirimGoster(`**${rakip.ad}** adlı üyeye meydan okudun. Kabul edince sonuç belli olur.`, 'basari');
      setBahis('');
      await yenile();
    });
  };

  return (
    <Kart className="flex flex-col gap-4">
      <KartBaslik ikon={Swords} baslik="Meydan oku" aciklama="Rakibini seç, bahsi koy, oyunu belirle" className="mb-0" />
      {veri.borclu && (
        <div className="flex gap-2.5 rounded-xl border border-kirmizi/35 bg-kirmizi/[0.07] p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-kirmizi" />
          Vadesi geçmiş kredi borcun var; ödeyene kadar düello açamaz ya da kabul edemezsin.
        </div>
      )}
      <button type="button" onClick={() => setSecici(true)} className="flex h-12 items-center gap-3 rounded-xl border border-cizgi bg-zemin/60 px-3 text-left transition-colors hover:border-cizgi-guclu">
        {rakip ? <Avatar uye={rakip} boyut={28} /> : <span className="grid size-7 place-items-center rounded-full bg-yuzey-3 text-silik"><UserRound className="size-4" /></span>}
        <span className={rakip ? 'flex-1 truncate font-medium' : 'flex-1 text-sm text-silik'}>{rakip ? rakip.ad : 'Rakip seç'}</span>
        {rakip && <span className="text-xs text-silik">değiştir</span>}
      </button>
      <div className="flex flex-col gap-1.5">
        <MiktarGirisi deger={bahis} degisti={setBahis} yer="Bahis: 500, 2.5k, yarı, hepsi" hizli={['100', '500', '1k', 'hepsi']} onEnter={ac} />
        <p className="text-xs text-silik">En az {bicim(d.bahisMin)} · senin tavanın {bicim(d.bahisTavani)} · kazanan havuzun %{100 - d.kasaPayiYuzde}'ini alır.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {d.oyunlar.map((k) => {
          const o = OYUNLAR[k];
          if (!o) return null;
          const Ikon = o.ikon;
          const aktif = oyun === k;
          return (
            <button key={k} type="button" role="radio" aria-checked={aktif} onClick={() => setOyun(k)} className={cn('secim flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors', aktif ? 'border-muz/50 bg-muz/10' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}>
              <Ikon className={cn('size-5', aktif ? 'text-muz' : 'text-soluk')} />
              <span className="text-sm font-semibold leading-none">{o.ad}</span>
              <span className="text-xs text-soluk">{o.aciklama}</span>
            </button>
          );
        })}
      </div>
      {oyun === 'yazitura' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-soluk">Senin seçimin</span>
          {[['yazi', 'Yazı'], ['tura', 'Tura'], ['rastgele', 'Rastgele']].map(([k, ad]) => (
            <Button key={k} boyut="sm" tur={secim === k ? 'ana' : 'hayalet'} onClick={() => setSecim(k)}>{ad}</Button>
          ))}
        </div>
      )}
      <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} disabled={veri.borclu} onClick={ac}><Swords />Meydan oku</Button>
      <UyeSecici acik={secici} degisti={setSecici} sec={setRakip} baslik="Kime meydan okuyorsun?" />
    </Kart>
  );
}

function MeydanKarti({ d, gelen, yenile, kabulSonucu }) {
  const [calistir, bekliyor] = useIslem();
  const o = OYUNLAR[d.oyun];
  const Ikon = o?.ikon ?? Swords;
  const eylem = (yol) => calistir(async () => {
    const r = await api(`/api/duello/${d.id}/${yol}`, { govde: {}, bakiyeErtele: yol === 'kabul' });
    if (yol === 'kabul') kabulSonucu(r);
    await yenile();
  });
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-cizgi bg-zemin/30 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <UyeEtiketi uye={gelen ? d.meydan : d.rakip} boyut={28} />
        <span className="shrink-0 text-xs text-soluk">{gelen ? 'seni çağırıyor' : 'rakibi bekleniyor'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <Rozet tur="muz"><Ikon />{o?.ad}</Rozet>
        {d.secim && <span className="text-soluk">{d.secim === 'yazi' ? 'yazı' : 'tura'} dedi</span>}
        <span className="flex items-center gap-1 text-soluk">bahis <Muz miktar={d.bahis} boyut={14} /></span>
        <span className="flex items-center gap-1 text-soluk">kazanan <Muz miktar={d.kazanc} boyut={14} /></span>
        <DiscordRozeti goster={d.discordda} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-soluk">Kalan <GeriSayim hedef={d.bitis} bitince="süresi doldu" onBitti={yenile} className="sayi text-metin" /></span>
        <div className="flex gap-2">
          {gelen ? (
            <>
              <Button tur="basari" boyut="sm" bekliyor={bekliyor} onClick={() => eylem('kabul')}>Kabul et</Button>
              <Button tur="hayalet" boyut="sm" disabled={bekliyor} onClick={() => eylem('reddet')}>Reddet</Button>
            </>
          ) : <Button tur="hayalet" boyut="sm" bekliyor={bekliyor} onClick={() => eylem('geri-cek')}>Geri çek</Button>}
        </div>
      </div>
    </li>
  );
}

function Liste({ ikon, baslik, liste, bos, children }) {
  return (
    <Kart>
      <KartBaslik ikon={ikon} baslik={baslik} sag={liste.length > 0 ? <Rozet tur="kirmizi">{liste.length}</Rozet> : null} />
      {liste.length === 0 ? <p className="py-3 text-center text-sm text-silik">{bos}</p> : <ul className="flex flex-col gap-3">{children}</ul>}
    </Kart>
  );
}

export function DuelloSekmesi({ veri, gecmis, yenile, beklet }) {
  const ben = useUygulama((s) => s.kullanici?.id);
  const [sonuc, setSonuc] = useState(null);
  const [tahta, setTahta] = useState(null);
  const ilk = useRef(true);

  // Açılışta süren oyun varsa tahtayı hemen aç (Discord'da başlayan oyuna devam).
  useEffect(() => {
    if (ilk.current && veri.xoxlar.length > 0) {
      ilk.current = false;
      setTahta(veri.xoxlar[0].id);
    }
  }, [veri.xoxlar]);

  const kabulSonucu = (r) => {
    if (r.sonuc) {
      beklet(true);
      setSonuc({ sonuc: r.sonuc, bakiye: r.bakiye });
    } else if (r.xox) {
      bakiyeGuncelle(r.bakiye);
      setTahta(r.xox.oyun.id);
    }
  };
  const sonucBitti = () => {
    beklet(false);
    if (sonuc) bakiyeGuncelle(sonuc.bakiye);
    yenile();
  };

  return (
    <div className="flex flex-col gap-4">
      {sonuc && <DuelloSonucu key={sonuc.sonuc.meydan.id + sonuc.bakiye} sonuc={sonuc.sonuc} onBitti={sonucBitti} kapat={() => setSonuc(null)} />}
      {tahta && <XoxTahtasi key={tahta} oyunId={tahta} kapat={() => setTahta(null)} yenile={yenile} />}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <MeydanOkuFormu veri={veri} yenile={yenile} />
        <div className="flex flex-col gap-4">
          <Liste ikon={Inbox} baslik="Gelen meydan okumalar" liste={veri.duello.gelen} bos="Sana gelen meydan okuma yok.">
            {veri.duello.gelen.map((d) => <MeydanKarti key={d.id} d={d} gelen yenile={yenile} kabulSonucu={kabulSonucu} />)}
          </Liste>
          <Liste ikon={Send} baslik="Gönderdiklerin" liste={veri.duello.giden} bos="Bekleyen meydan okuman yok.">
            {veri.duello.giden.map((d) => <MeydanKarti key={d.id} d={d} gelen={false} yenile={yenile} kabulSonucu={kabulSonucu} />)}
          </Liste>
          {veri.xoxlar.length > 0 && (
            <Kart>
              <KartBaslik ikon={OYUNLAR.xox.ikon} baslik="Süren XOX oyunların" />
              <ul className="flex flex-col gap-2">
                {veri.xoxlar.map((o) => {
                  const karsi = o.x.id === ben ? o.o : o.x;
                  const sirada = o.siradakiId === ben;
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-cizgi bg-zemin/30 p-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <UyeEtiketi uye={karsi} boyut={28} />
                        {sirada && <Rozet tur="muz">Sıra sende</Rozet>}
                      </div>
                      <Button boyut="sm" tur={tahta === o.id ? 'ikincil' : 'ana'} onClick={() => setTahta(o.id)}>{tahta === o.id ? 'Açık' : 'Tahtayı aç'}</Button>
                    </li>
                  );
                })}
              </ul>
            </Kart>
          )}
          <Kart>
            <KartBaslik ikon={Swords} baslik="Son sonuçlar" />
            {!gecmis || gecmis.duellolar.length === 0 ? <p className="py-3 text-center text-sm text-silik">Son 7 günde biten düello yok.</p> : (
              <ul className="flex flex-col divide-y divide-cizgi">
                {gecmis.duellolar.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Rozet tur={s.benKazandi ? 'yesil' : 'kirmizi'}>{s.benKazandi ? 'Kazandın' : 'Kaybettin'}</Rozet>
                      <UyeEtiketi uye={s.benKazandi ? s.kaybeden : s.kazanan} boyut={24} className="text-sm" />
                    </div>
                    <div className="flex shrink-0 flex-col items-end text-xs text-silik">
                      {s.benKazandi ? <Muz miktar={s.kazanc} isaretli boyut={14} /> : null}
                      {tarih(s.zaman)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Kart>
        </div>
      </div>
    </div>
  );
}

