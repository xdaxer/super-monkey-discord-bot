import {
  ArrowDownRight, ArrowLeftRight, ArrowUpRight, CalendarClock, Dices, Landmark, Layers, Package, Send, Trophy, Users, Wrench,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Istatistik } from '@/components/Bolum.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { useApi } from '@/lib/kancalar.js';
import { bicim, cn, kisa, tarih, yuzde } from '@/lib/utils.js';

/** Basılan ya da yok edilen kalemlerin çubuk listesi; `en` ortak ölçek (iki sütun kıyaslanabilsin). */
function KalemListesi({ baslik, toplam, kalemler, en, renk, ikon }) {
  return (
    <Kart>
      <KartBaslik ikon={ikon} baslik={baslik} sag={<Muz miktar={toplam} />} />
      {kalemler.length === 0 && <p className="py-4 text-center text-sm text-silik">Bu dönemde kayıt yok.</p>}
      <ul className="flex flex-col gap-3">
        {kalemler.map((k) => (
          <li key={k.kod ?? k.ad} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-soluk">{k.ad}</span>
              <span className="sayi shrink-0 font-medium">{bicim(k.miktar)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-yuzey-3">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (k.miktar / en) * 100)}%`, background: renk }} />
            </div>
          </li>
        ))}
      </ul>
    </Kart>
  );
}

export default function Genel({ veri }) {
  const [donem, setDonem] = useState('bugun');
  // Varsayılan yöneticiler hariç: ×5 gelirleri ve bakiyeleri üye ekonomisini şişirmesin.
  const [dahil, setDahil] = useState(false);
  const { veri: p, hata, yenile } = useApi(`/api/yonetim/panel?donem=${donem}${dahil ? '&yoneticiler=dahil' : ''}`);

  const donemSecici = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-fit gap-1 rounded-xl border border-cizgi bg-yuzey p-1">
        {veri.donemler.map((d) => (
          <button
            key={d.kimlik}
            type="button"
            onClick={() => setDonem(d.kimlik)}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', donem === d.kimlik ? 'bg-yuzey-3 text-metin' : 'text-soluk hover:text-metin')}
          >
            {d.ad}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-soluk">
        <input type="checkbox" checked={dahil} onChange={(e) => setDahil(e.target.checked)} className="size-4 accent-[var(--color-muz)]" />
        Yöneticileri dahil et
      </label>
    </div>
  );

  if (hata) return <div className="flex flex-col gap-4">{donemSecici}<HataKutusu hata={hata} tekrar={yenile} /></div>;
  if (!p || p.donem !== donem || p.yoneticiHaric === dahil) {
    return (
      <div className="flex flex-col gap-4">
        {donemSecici}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Iskelet key={i} className="h-24" />)}</div>
        <div className="grid gap-4 md:grid-cols-2"><Iskelet className="h-56" /><Iskelet className="h-56" /></div>
      </div>
    );
  }

  const en = Math.max(1, ...p.basilan.map((k) => k.miktar), ...p.yokEdilen.map((k) => k.miktar));
  const enflasyon = p.net >= 0;

  return (
    <div className="flex flex-col gap-4">
      {donemSecici}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Istatistik etiket="Toplam arz" deger={<Muz miktar={p.arz} />} alt={`Dolaşımda ${bicim(p.bakiyeler)} · bankada ${bicim(p.bankada)}${p.hissede > 0 ? ` · hissede ${bicim(p.hissede)}` : ''}`} ikon={Landmark} />
        <Istatistik etiket="Muzu olan üye" deger={<span className="sayi">{bicim(p.uyeSayisi)}</span>} ikon={Users} />
        <Istatistik
          etiket={enflasyon ? 'Net enflasyon' : 'Net deflasyon'}
          deger={<Muz miktar={p.net} isaretli />}
          alt={p.degisimYuzde === null || p.degisimYuzde === undefined ? 'Arzda değişim yok' : `Arzda ${yuzde(p.degisimYuzde)}`}
          ikon={enflasyon ? ArrowUpRight : ArrowDownRight}
        />
        <Istatistik etiket="Kasa · kart" deger={<span className="sayi">{bicim(p.kasaAcilan)} · {bicim(p.kartSatilan)}</span>} alt="açılan kasa · satılan kart" ikon={Package} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <KalemListesi baslik="Basılan muz" toplam={p.toplamBasilan} kalemler={p.basilan} en={en} renk="var(--color-yesil)" ikon={ArrowUpRight} />
        <KalemListesi baslik="Yok edilen muz" toplam={p.toplamYokEdilen} kalemler={p.yokEdilen} en={en} renk="var(--color-kirmizi)" ikon={ArrowDownRight} />
      </div>

      <Kart>
        <KartBaslik ikon={Trophy} baslik="En çok kazananlar" aciklama="Dönemde bakiyesi en çok artan 5 üye (yönetici işlemleri ve mevduat hariç)." />
        {p.kazananlar.length === 0 ? <Bos ikon={Layers} baslik="Kazanan yok" aciklama="Bu dönemde net kazancı olan üye çıkmadı." className="py-6" /> : (
          <ol className="flex flex-col divide-y divide-cizgi">
            {p.kazananlar.map((k, i) => (
              <li key={k.id} className="flex items-center gap-3 py-2.5">
                <span className="sayi w-5 text-center text-sm text-silik">{i + 1}</span>
                <Avatar uye={k} boyut={32} />
                <span className="min-w-0 flex-1 truncate font-medium">{k.ad}</span>
                <Muz miktar={k.net} isaretli />
              </li>
            ))}
          </ol>
        )}
      </Kart>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <KumarOyunlari oyunlar={p.kumarOyunlari} />
        <DonemEtkinlikleri etkinlikler={p.etkinlikler} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <YoneticiGonderim g={p.yoneticiGonderim} />
        <Takaslar t={p.takaslar} />
      </div>
    </div>
  );
}

/** Oyun başına yatırılan, ödenen ve gerçekleşen geri ödeme (oyun 24 Ekim'den beri deftere yazılıyor). */
function KumarOyunlari({ oyunlar }) {
  return (
    <Kart>
      <KartBaslik ikon={Dices} baslik="Kumar oyunları" aciklama="Geri ödeme = ödenen ÷ yatırılan. %100'ün altı kasanın kârı, yani yok edilen muz. Düello ve Katıl iadesi dahil değil." />
      {oyunlar.length === 0 ? <Bos ikon={Dices} baslik="Bu dönemde bahis yok" className="py-6" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-silik">
              <tr><th className="py-1.5 font-medium">Oyun</th><th className="py-1.5 text-right font-medium">Bahis</th><th className="py-1.5 text-right font-medium">Yatırılan</th><th className="py-1.5 text-right font-medium">Geri ödeme</th></tr>
            </thead>
            <tbody className="divide-y divide-cizgi">
              {oyunlar.map((o) => (
                <tr key={o.oyun ?? 'yok'}>
                  <td className="py-2"><span className={cn(!o.oyun && 'text-silik')}>{o.ad}</span> <span className="text-xs text-silik">· {bicim(o.kisi)} kişi</span></td>
                  <td className="sayi py-2 text-right">{bicim(o.adet)}</td>
                  <td className="sayi py-2 text-right">{kisa(o.bahis)}</td>
                  <td className={cn('sayi py-2 text-right font-medium', o.geriOdeme > 100 ? 'text-kirmizi' : 'text-metin')}>
                    {o.geriOdeme === null ? '—' : `%${o.geriOdeme.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Kart>
  );
}

/** Döneme değen etkinlikler: arzdaki sıçramaları açıklamak için. */
function DonemEtkinlikleri({ etkinlikler }) {
  return (
    <Kart>
      <KartBaslik ikon={CalendarClock} baslik="Dönemdeki etkinlikler" aciklama="Bu döneme değen 2x muz, 2x XP, kasa indirimi ve seviye kasası etkinlikleri." />
      {etkinlikler.length === 0 ? <Bos ikon={CalendarClock} baslik="Etkinlik yok" className="py-6" /> : (
        <ul className="flex flex-col divide-y divide-cizgi">
          {etkinlikler.map((e) => (
            <li key={`${e.tur}-${e.baslangic}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium">{e.ad}</span>
              <span className="text-xs text-soluk">{tarih(e.baslangic)} → {tarih(e.bitis)}{e.erken ? ' · erken bitti' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Kart>
  );
}

/** Yöneticilerden üyelere muz gönderimi (transferden ayrı; ×5 gelir üyeye geçer). */
function YoneticiGonderim({ g }) {
  return (
    <Kart>
      <KartBaslik ikon={Send} baslik="Yönetici gönderimleri" aciklama="Sahip ve geliştiricilerden üyelere giden muz. Yönetici geliri ×5 olduğu için fiilen basılan muz sayılır." />
      {g.adet === 0 ? <Bos ikon={Send} baslik="Gönderim yok" className="py-6" /> : (
        <>
          <p className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-soluk">
            Toplam <Muz miktar={g.toplam} /> · {bicim(g.adet)} gönderim · {bicim(g.aliciSayisi)} üye
          </p>
          <ol className="flex flex-col divide-y divide-cizgi">
            {g.alicilar.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <Avatar uye={a} boyut={28} />
                <span className="min-w-0 flex-1 truncate font-medium">{a.ad}</span>
                <span className="text-xs text-silik">{bicim(a.adet)}×</span>
                <Muz miktar={a.toplam} />
              </li>
            ))}
          </ol>
        </>
      )}
    </Kart>
  );
}

/** Kabul edilen takaslar; değeri en dengesiz olanlar (karşılıksız devir şüphesi). */
function Takaslar({ t }) {
  return (
    <Kart>
      <KartBaslik ikon={ArrowLeftRight} baslik="Takaslar" aciklama="Değer: kart satış değeri, kasa mağaza fiyatı ve muz. Büyük fark karşılıksız aktarım olabilir." />
      {t.adet === 0 ? <Bos ikon={ArrowLeftRight} baslik="Takas yok" className="py-6" /> : (
        <>
          <p className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-soluk">
            {bicim(t.adet)} takas · toplam değer <Muz miktar={t.toplamDeger} />
            {t.yoneticili > 0 && <> · {bicim(t.yoneticili)} tanesinde yönetici taraf</>}
          </p>
          <ol className="flex flex-col divide-y divide-cizgi">
            {t.dengesiz.map((x) => (
              <li key={x.id} className="flex flex-col gap-1 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar uye={x.eden} boyut={22} />
                  <span className="min-w-0 truncate">{x.eden.ad}</span>
                  <ArrowLeftRight className="size-3.5 shrink-0 text-silik" />
                  <Avatar uye={x.karsi} boyut={22} />
                  <span className="min-w-0 truncate">{x.karsi.ad}</span>
                  {x.yonetici && <Wrench className="size-3.5 shrink-0 text-muz" />}
                </div>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-soluk">
                  <Muz miktar={x.verDeger} boyut={12} /> <ArrowLeftRight className="size-3 text-silik" aria-label="karşılığında" /> <Muz miktar={x.isteDeger} boyut={12} /> · fark <b className="text-kirmizi"><Muz miktar={x.fark} boyut={12} /></b>
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </Kart>
  );
}
