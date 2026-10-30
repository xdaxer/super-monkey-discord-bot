import {
  AlertTriangle, ArrowLeftRight, Ban, HandCoins, History, Package, Receipt, ShoppingCart, Tag, TrendingUp, Undo2, Users, Wallet,
} from 'lucide-react';

import { Istatistik } from '@/components/Bolum.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { bicim, tarih } from '@/lib/utils.js';
import { kartBilgisi } from '../../pazar/ortak.jsx';
import { KartHucre, UyeAdi } from './ortak.jsx';

const bos = (metin) => <p className="py-4 text-center text-sm text-silik">{metin}</p>;

/** Günlük satırının okunur metni. */
function eylemMetni(g) {
  const a = g.ayrinti;
  const kart = a.kart ? kartBilgisi(a.kart).ad : '';
  switch (g.eylem) {
    case 'ayar': {
      const adlar = {
        acik: 'Pazar', kesintiYuzde: 'Kesinti %', tavanCarpani: 'Tavan katı', ilanSiniri: 'İlan sınırı',
      };
      return Object.entries(a).map(([k, { once, sonra }]) => (k === 'acik'
        ? `Pazarı ${sonra ? 'açtı' : 'kapattı'}`
        : `${adlar[k] ?? k}: ${bicim(once)} → ${bicim(sonra)}`)).join(' · ');
    }
    case 'ilan-duzenle':
      return [
        `${kart} ilanını düzenledi`,
        a.fiyat && `fiyat ${bicim(a.fiyat.once)} → ${bicim(a.fiyat.sonra)}`,
        a.adet && `adet ${a.adet.once} → ${a.adet.sonra}`,
      ].filter(Boolean).join(' · ');
    case 'ilan-kaldir':
      return `${a.adet} × ${kart} ilanını kaldırdı (${a.iade ? 'kartlar iade' : 'el konuldu'})${a.sebep ? ` · ${a.sebep}` : ''}`;
    case 'istek-kaldir':
      return `${a.adet} × ${kart} alım isteğini kaldırdı (${bicim(a.iade)} muz iade)${a.sebep ? ` · ${a.sebep}` : ''}`;
    case 'satis-geri':
      return `${a.adet} × ${kart} satışını geri aldı (${bicim(a.toplam)} muz)${a.sebep ? ` · ${a.sebep}` : ''}`;
    default:
      return g.eylem;
  }
}

const EYLEM_IKON = {
  ayar: Ban, 'ilan-duzenle': Tag, 'ilan-kaldir': Package, 'istek-kaldir': HandCoins, 'satis-geri': Undo2,
};

/** Pazarın genel durumu: sayılar, en çok satanlar, şüpheli işaretler ve işlem kayıtları. */
export function Ozet({ v, uyeSec, kartSec }) {
  const s = v.satis;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Istatistik etiket="Satış hacmi" deger={<Muz miktar={s.hacim} boyut={20} />} alt={`${bicim(s.islem)} işlem · ${bicim(s.adet)} kart`} ikon={TrendingUp} />
        <Istatistik etiket="Kesinti" deger={<Muz miktar={s.kesinti} boyut={20} />} alt="yok edilen muz" ikon={Wallet} />
        <Istatistik etiket="Satıcı / alıcı" deger={<span className="sayi">{bicim(s.satici)} / {bicim(s.alici)}</span>} alt={v.geriAlinan ? `${bicim(v.geriAlinan)} satış geri alındı` : null} ikon={Users} />
        <Istatistik etiket="Açık ilan" deger={<span className="sayi">{bicim(v.acikIlanlar.ilan)}</span>} alt={`${bicim(v.acikIlanlar.adet)} kart · ${bicim(v.acikIlanlar.deger)} muz`} ikon={Tag} />
        <Istatistik etiket="Açık alım isteği" deger={<span className="sayi">{bicim(v.acikIstekler.istek)}</span>} alt={`${bicim(v.acikIstekler.adet)} kart · ${bicim(v.acikIstekler.emanet)} muz emanet`} ikon={HandCoins} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Kart className="p-4 sm:p-5">
          <KartBaslik ikon={ShoppingCart} baslik="En çok satan kartlar" aciklama="Hacme göre; dokununca satışları süzülür." />
          {v.kartlar.length === 0 ? bos('Bu dönemde satış yok.') : (
            <ul className="flex flex-col divide-y divide-cizgi">
              {v.kartlar.map((k) => (
                <li key={k.kart} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><KartHucre kimlik={k.kart} sec={kartSec} /></span>
                  <span className="flex shrink-0 flex-col items-end">
                    <Muz miktar={k.hacim} boyut={13} className="text-sm" />
                    <span className="sayi text-[11px] text-silik">{bicim(k.adet)} adet · ort. {bicim(k.ortalama)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Kart>

        <Kart className="p-4 sm:p-5">
          <KartBaslik ikon={Receipt} baslik="En çok kazanan ve harcayanlar" aciklama="Satıcıya geçen net / alıcının ödediği" />
          {s.islem === 0 ? bos('Bu dönemde satış yok.') : (
            <div className="grid gap-4 sm:grid-cols-2">
              {[['Satıcılar', v.saticilar], ['Alıcılar', v.alicilar]].map(([ad, liste]) => (
                <div key={ad} className="min-w-0">
                  <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-silik">{ad}</h4>
                  <ol className="flex flex-col gap-1.5 text-sm">
                    {liste.map((u) => (
                      <li key={u.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1"><UyeAdi uye={u} sec={uyeSec} /></span>
                        <span className="flex shrink-0 flex-col items-end">
                          <Muz miktar={u.tutar} boyut={12} className="text-[13px]" />
                          <span className="sayi text-[11px] text-silik">{bicim(u.adet)} kart</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Kart>

        <Kart className="p-4 sm:p-5">
          <KartBaslik ikon={ArrowLeftRight} baslik="Sık alışveriş eden çiftler" aciklama="Aynı satıcı ve alıcı arasında 2+ satış; alt hesap şüphesi için bak." />
          {v.ciftler.length === 0 ? bos('Tekrarlayan çift yok.') : (
            <ul className="flex flex-col divide-y divide-cizgi text-sm">
              {v.ciftler.map((c) => (
                <li key={`${c.saticiId}-${c.aliciId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                  <UyeAdi uye={c.satici} sec={uyeSec} />
                  <span className="text-silik" aria-label="sattı">→</span>
                  <UyeAdi uye={c.alici} sec={uyeSec} />
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="sayi text-xs text-soluk">{bicim(c.islem)} satış</span>
                    <Muz miktar={c.hacim} boyut={12} className="text-[13px]" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Kart>

        <Kart className="p-4 sm:p-5">
          <KartBaslik ikon={AlertTriangle} baslik="Pahalı satışlar" aciklama={`Sistem değerinin ${v.pahaliKat} katı ve üstü; muz taşıma şüphesi için bak.`} />
          {v.pahali.length === 0 ? bos('Pahalı satış yok.') : (
            <ul className="flex flex-col divide-y divide-cizgi text-sm">
              {v.pahali.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0"><KartHucre kimlik={p.kart} sec={kartSec} boyut={20} /></span>
                    <Muz miktar={p.fiyat} boyut={13} className="shrink-0 text-sm text-turuncu" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-soluk">
                    <UyeAdi uye={p.satici} sec={uyeSec} boyut={16} />
                    <span>→</span>
                    <UyeAdi uye={p.alici} sec={uyeSec} boyut={16} />
                    <span className="sayi ml-auto text-silik">{tarih(p.zaman)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Kart>
      </div>

      <Kart className="p-4 sm:p-5">
        <KartBaslik ikon={History} baslik="Yönetici işlemleri" aciklama="Pazardaki her yönetici işlemi; son 30 kayıt." />
        {v.gunluk.length === 0 ? bos('Henüz yönetici işlemi yok.') : (
          <ul className="flex flex-col divide-y divide-cizgi text-sm">
            {v.gunluk.map((g) => {
              const Ikon = EYLEM_IKON[g.eylem] ?? History;
              return (
                <li key={g.id} className="flex items-start gap-3 py-2.5">
                  <Ikon aria-hidden className="mt-0.5 size-4 shrink-0 text-muz" />
                  <span className="min-w-0 flex-1">
                    <span className="block">{eylemMetni(g)}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-silik">
                      <UyeAdi uye={g.yonetici} boyut={14} />
                      {g.uye && <><span>·</span><span>üye</span><UyeAdi uye={g.uye} sec={uyeSec} boyut={14} /></>}
                    </span>
                  </span>
                  <span className="sayi shrink-0 text-xs text-silik">{tarih(g.zaman)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Kart>
    </div>
  );
}
