import {
  ArrowDownLeft, ArrowUpRight, HandCoins, History, Tag, X,
} from 'lucide-react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { bicim, cn, tarih } from '@/lib/utils.js';
import {
  kartBilgisi, KartAdi, KartKaresi, netHesapla,
} from './ortak.jsx';

function IlanSatiri({ ilan, yuzde, ac, sonra }) {
  const [calistir, bekliyor] = useIslem();
  const kaldir = () => calistir(async () => {
    const ad = kartBilgisi(ilan.kart).ad;
    if (!await onayIste({ baslik: 'İlanı kaldır', metin: `Kalan ${ilan.adet} × **${ad}** envanterine döner.`, evet: 'Kaldır' })) return;
    const r = await api(`/api/pazar/ilan/${ilan.id}/iptal`, { govde: {} });
    bildirimGoster(`İlan kaldırıldı; ${r.adet} × **${ad}** envanterine döndü.`, 'basari');
    sonra();
  });
  return (
    <li className="flex items-center gap-3 py-2.5">
      <button type="button" onClick={() => ac(ilan.kart)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <KartKaresi kimlik={ilan.kart} boyut={32} />
        <KartAdi
          kimlik={ilan.kart}
          alt={ilan.adet < ilan.ilkAdet ? `${bicim(ilan.ilkAdet - ilan.adet)}/${bicim(ilan.ilkAdet)} satıldı` : `${bicim(ilan.adet)} adet`}
          className="text-sm"
        />
      </button>
      <span className="flex shrink-0 flex-col items-end">
        <Muz miktar={ilan.fiyat} boyut={14} className="text-sm" />
        <span className="sayi text-[11px] text-silik">sana {bicim(netHesapla(ilan.fiyat, yuzde))}</span>
      </span>
      <Button tur="hayalet" boyut="ikon" aria-label="İlanı kaldır" title="İlanı kaldır" bekliyor={bekliyor} onClick={kaldir}><X /></Button>
    </li>
  );
}

function IstekSatiri({ istek, ac, sonra }) {
  const [calistir, bekliyor] = useIslem();
  const kaldir = () => calistir(async () => {
    const ad = kartBilgisi(istek.kart).ad;
    if (!await onayIste({ baslik: 'İsteği kaldır', metin: `Emanetteki **${bicim(istek.emanet)} muz** bakiyene döner.`, evet: 'Kaldır' })) return;
    const r = await api(`/api/pazar/istek/${istek.id}/iptal`, { govde: {} });
    bildirimGoster(`**${ad}** alım isteği kaldırıldı; **${bicim(r.iade)}** muz bakiyene döndü.`, 'basari');
    sonra();
  });
  return (
    <li className="flex items-center gap-3 py-2.5">
      <button type="button" onClick={() => ac(istek.kart)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <KartKaresi kimlik={istek.kart} boyut={32} />
        <KartAdi
          kimlik={istek.kart}
          alt={istek.adet < istek.ilkAdet ? `${bicim(istek.ilkAdet - istek.adet)}/${bicim(istek.ilkAdet)} alındı` : `${bicim(istek.adet)} adet`}
          className="text-sm"
        />
      </button>
      <span className="flex shrink-0 flex-col items-end">
        <Muz miktar={istek.fiyat} boyut={14} className="text-sm" />
        <span className="sayi text-[11px] text-silik">emanet {bicim(istek.emanet)}</span>
      </span>
      <Button tur="hayalet" boyut="ikon" aria-label="İsteği kaldır" title="İsteği kaldır" bekliyor={bekliyor} onClick={kaldir}><X /></Button>
    </li>
  );
}

/** Üyenin açık ilanları, alım istekleri ve alım-satım geçmişi. */
export function Hesabim({
  veri, hata, yenile, ac, satisAc, istekAc,
}) {
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!veri) return <div className="grid gap-4 lg:grid-cols-2"><Iskelet className="h-56" /><Iskelet className="h-56" /></div>;
  const sonra = () => yenile({ sessiz: true });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Kart className="p-4 sm:p-5">
        <KartBaslik
          ikon={Tag}
          baslik="Satıştaki ilanların"
          aciklama={`${veri.ilanlar.length}/${veri.ilanSiniri} ilan · satışta %${veri.kesintiYuzde} kesinti`}
        />
        {veri.ilanlar.length === 0 ? (
          <Bos
            ikon={Tag}
            baslik="Açık ilanın yok"
            aciklama="Elindeki kartlardan birini fiyatını belirleyip pazara koy."
            eylem={<Button tur="ana" onClick={() => satisAc(null)}><Tag />Kart sat</Button>}
            className="py-6"
          />
        ) : (
          <ul className="divide-y divide-cizgi">
            {veri.ilanlar.map((i) => <IlanSatiri key={i.id} ilan={i} yuzde={veri.kesintiYuzde} ac={ac} sonra={sonra} />)}
          </ul>
        )}
      </Kart>

      <Kart className="p-4 sm:p-5">
        <KartBaslik
          ikon={HandCoins}
          baslik="Alım isteklerin"
          aciklama={`${veri.istekler.length}/${veri.ilanSiniri} istek · satan çıkınca kart kendiliğinden gelir`}
        />
        {veri.istekler.length === 0 ? (
          <Bos
            ikon={HandCoins}
            baslik="Açık isteğin yok"
            aciklama="İstediğin kartı fiyatını belirleyip iste; muz emanette bekler, satan çıkınca kart sana geçer."
            eylem={<Button onClick={() => istekAc(null)}><HandCoins />Alım isteği ver</Button>}
            className="py-6"
          />
        ) : (
          <ul className="divide-y divide-cizgi">
            {veri.istekler.map((i) => <IstekSatiri key={i.id} istek={i} ac={ac} sonra={sonra} />)}
          </ul>
        )}
      </Kart>

      <Kart className="p-4 sm:p-5 lg:col-span-2">
        <KartBaslik ikon={History} baslik="Geçmiş" aciklama="Son 50 alım ve satışın" />
        {veri.gecmis.length === 0 ? (
          <p className="py-6 text-center text-sm text-silik">Henüz pazarda alım ya da satım yapmadın.</p>
        ) : (
          <ul className="divide-y divide-cizgi">
            {veri.gecmis.map((g) => {
              const satis = g.yon === 'satis';
              const Ok = satis ? ArrowUpRight : ArrowDownLeft;
              return (
                <li key={`${g.yon}-${g.id}`} className="flex items-center gap-3 py-2.5">
                  <button type="button" onClick={() => ac(g.kart)} className="relative shrink-0" aria-label={kartBilgisi(g.kart).ad}>
                    <KartKaresi kimlik={g.kart} boyut={28} />
                    <span className={`absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-yuzey ${satis ? 'bg-yesil text-zemin' : 'bg-mavi text-zemin'}`}>
                      <Ok aria-hidden className="size-3" strokeWidth={3} />
                    </span>
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm">
                      <span className="truncate">{satis ? 'Sattın' : 'Aldın'}: {kartBilgisi(g.kart).ad}{g.adet > 1 ? ` ×${g.adet}` : ''}</span>
                      {g.geriAlindi && <span className="shrink-0 rounded-md bg-turuncu/15 px-1.5 py-px text-[11px] font-semibold text-turuncu">Geri alındı</span>}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-silik">
                      <Avatar uye={g.karsi} boyut={14} />
                      <span className="truncate">{g.karsi.ad}</span>
                      <span className="shrink-0">· {tarih(g.zaman)}</span>
                    </span>
                  </span>
                  <Muz miktar={satis ? g.tutar : -g.tutar} isaretli={!g.geriAlindi} boyut={14} className={cn('shrink-0 text-sm', g.geriAlindi && 'text-silik line-through')} />
                </li>
              );
            })}
          </ul>
        )}
      </Kart>
    </div>
  );
}
