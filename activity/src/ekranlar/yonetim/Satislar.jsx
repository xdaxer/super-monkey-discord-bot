import {
  AtSign, ChevronLeft, ChevronRight, Package, Palette, Receipt, ShoppingBag, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Istatistik } from '@/components/Bolum.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { useApi } from '@/lib/kancalar.js';
import { bicim, cn, tarih } from '@/lib/utils.js';

const DONEMLER = [
  { kimlik: 'bugun', ad: 'Bugün' },
  { kimlik: '7g', ad: 'Son 7 gün' },
  { kimlik: '30g', ad: 'Son 30 gün' },
  { kimlik: 'tumu', ad: 'Tümü' },
];

const TUR_ADLARI = {
  kasa: 'Kasa', esya: 'Eşya', rol: 'Rol', renk: 'Renk rolü',
};

function sorgu({ donem, urun, uye, yoneticiGizle }, sayfa) {
  const p = new URLSearchParams({ donem, sayfa: String(sayfa) });
  if (urun) p.set('urun', urun.kimlik);
  if (uye) p.set('uye', uye.id);
  if (yoneticiGizle) p.set('yoneticiGizle', '1');
  return `/api/yonetim/satislar?${p}`;
}

/** Ürünün görseli: eşya/kasa emojisi, rolde rol rengiyle @, renk rolünde palet. */
function UrunIkonu({ urun, boyut = 22 }) {
  if (urun.gorsel) return <Gorsel g={urun.gorsel} boyut={boyut} />;
  const Ikon = urun.tur === 'renk' ? Palette : AtSign;
  return (
    <span className="grid shrink-0 place-items-center rounded-md bg-yuzey-3" style={{ width: boyut, height: boyut }}>
      <Ikon aria-hidden className="size-[70%]" style={{ color: urun.renk ?? (urun.tur === 'renk' ? 'var(--color-mor)' : 'var(--color-soluk)') }} />
    </span>
  );
}

/** Süzgeç düğmesi gibi davranan ürün/üye adı. */
function SuzenAd({ children, onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title} className="flex min-w-0 items-center gap-2 text-left hover:text-muz">
      {children}
    </button>
  );
}

/** Ürün dökümü: harcamaya göre çubuk; dokununca o ürünü alanlar süzülür. */
function UrunListesi({ urunler, secili, sec }) {
  const en = Math.max(1, ...urunler.map((u) => u.toplam));
  return (
    <ul className="flex flex-col gap-1">
      {urunler.map((u) => {
        const acik = secili?.kimlik === u.kimlik;
        return (
          <li key={u.kimlik}>
            <button
              type="button"
              aria-pressed={acik}
              onClick={() => sec(acik ? null : u)}
              className={cn(
                'flex w-full flex-col gap-1.5 rounded-xl px-2.5 py-2 text-left transition-colors pointer-coarse:py-2.5',
                acik ? 'bg-muz/10 ring-1 ring-muz/40' : 'hover:bg-yuzey-2',
              )}
            >
              <span className="flex items-center gap-2.5">
                <UrunIkonu urun={u} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.ad}</span>
                  <span className="block text-xs text-silik">
                    {TUR_ADLARI[u.tur]} · <span className="sayi">{bicim(u.adet)}</span> adet · <span className="sayi">{bicim(u.alici)}</span> kişi
                  </span>
                </span>
                <Muz miktar={u.toplam} boyut={14} className="shrink-0 text-sm" />
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-yuzey-3">
                <span className="block h-full rounded-full bg-muz" style={{ width: `${Math.max(2, (u.toplam / en) * 100)}%` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AliciListesi({ alicilar, sec }) {
  return (
    <ol className="flex flex-col divide-y divide-cizgi">
      {alicilar.map((a, i) => (
        <li key={a.id} className="flex items-center gap-3 py-2">
          <span className="sayi w-5 shrink-0 text-right text-xs text-silik">{i + 1}</span>
          <SuzenAd onClick={() => sec(a)} title="Bu üyenin alımlarını göster">
            <Avatar uye={a} boyut={26} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{a.ad}</span>
              <span className="block text-xs text-silik">
                <span className="sayi">{bicim(a.alim)}</span> alım · <span className="sayi">{bicim(a.cesit)}</span> çeşit
              </span>
            </span>
          </SuzenAd>
          <Muz miktar={a.toplam} boyut={14} className="ml-auto shrink-0 text-sm" />
        </li>
      ))}
    </ol>
  );
}

function SatisListesi({ satirlar, uyeSec, urunSec }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cizgi text-left text-xs uppercase tracking-wide text-silik">
              <th className="py-2 pr-3 font-medium">Zaman</th>
              <th className="py-2 pr-3 font-medium">Üye</th>
              <th className="py-2 pr-3 font-medium">Ürün</th>
              <th className="py-2 pr-3 text-right font-medium">Adet</th>
              <th className="py-2 text-right font-medium">Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cizgi">
            {satirlar.map((h) => (
              <tr key={h.id}>
                <td className="sayi whitespace-nowrap py-2 pr-3 text-soluk">{tarih(h.zaman)}</td>
                <td className="max-w-44 py-2 pr-3">
                  <SuzenAd onClick={() => uyeSec(h.uye)} title="Bu üyenin alımlarını göster"><Avatar uye={h.uye} boyut={22} /><span className="truncate">{h.uye.ad}</span></SuzenAd>
                </td>
                <td className="max-w-56 py-2 pr-3">
                  <SuzenAd onClick={() => urunSec(h.urun)} title="Bu ürünün satışlarını göster"><UrunIkonu urun={h.urun} boyut={20} /><span className="truncate">{h.urun.ad}</span></SuzenAd>
                </td>
                <td className="sayi py-2 pr-3 text-right">{bicim(h.adet)}</td>
                <td className="py-2 text-right"><Muz miktar={h.tutar} boyut={14} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {satirlar.map((h) => (
          <li key={h.id} className="flex flex-col gap-2 rounded-xl border border-cizgi bg-zemin/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <SuzenAd onClick={() => uyeSec(h.uye)} title="Bu üyenin alımlarını göster"><Avatar uye={h.uye} boyut={22} /><span className="truncate">{h.uye.ad}</span></SuzenAd>
              <span className="sayi shrink-0 text-xs text-silik">{tarih(h.zaman)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <SuzenAd onClick={() => urunSec(h.urun)} title="Bu ürünün satışlarını göster">
                <UrunIkonu urun={h.urun} boyut={20} />
                <span className="truncate">{h.urun.ad}</span>
                {h.adet > 1 && <span className="sayi shrink-0 text-xs text-silik">×{bicim(h.adet)}</span>}
              </SuzenAd>
              <Muz miktar={h.tutar} boyut={14} className="shrink-0" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Kaldırılabilir süzgeç etiketi (seçili üye ya da ürün). */
function SuzgecEtiketi({ children, kaldir, etiket }) {
  return (
    <span className="flex items-center gap-2 rounded-xl border border-muz/40 bg-muz/10 py-1 pr-1 pl-1.5 text-sm">
      {children}
      <button type="button" onClick={kaldir} className="grid size-7 place-items-center rounded-md text-soluk hover:text-metin pointer-coarse:size-9" aria-label={etiket}>
        <X className="size-4" />
      </button>
    </span>
  );
}

/** Mağaza satışları: ne, kaç adet, kaç muza, kim aldı. */
export default function Satislar() {
  const [suzgec, setSuzgec] = useState({
    donem: '30g', urun: null, uye: null, yoneticiGizle: false,
  });
  const [sayfa, setSayfa] = useState(1);
  const [secici, setSecici] = useState(false);
  const { veri: v, hata, yukleniyor, yenile } = useApi(sorgu(suzgec, sayfa), { aralik: 30_000 });

  const degis = (alan, deger) => { setSuzgec((s) => ({ ...s, [alan]: deger })); setSayfa(1); };

  const suzgecler = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-cizgi bg-yuzey p-1">
          {DONEMLER.map((d) => (
            <button
              key={d.kimlik}
              type="button"
              aria-pressed={suzgec.donem === d.kimlik}
              onClick={() => degis('donem', d.kimlik)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:py-2', suzgec.donem === d.kimlik ? 'bg-yuzey-3 text-metin' : 'text-soluk hover:text-metin')}
            >
              {d.ad}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-soluk">
          <input type="checkbox" checked={suzgec.yoneticiGizle} onChange={(e) => degis('yoneticiGizle', e.target.checked)} className="size-4 accent-[var(--color-muz)]" />
          Yöneticileri gizle
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {suzgec.uye
          ? <SuzgecEtiketi kaldir={() => degis('uye', null)} etiket="Üye süzgecini kaldır"><Avatar uye={suzgec.uye} boyut={22} />{suzgec.uye.ad}</SuzgecEtiketi>
          : <Button boyut="sm" onClick={() => setSecici(true)}><UserRound />Üye seç</Button>}
        {suzgec.urun && (
          <SuzgecEtiketi kaldir={() => degis('urun', null)} etiket="Ürün süzgecini kaldır"><UrunIkonu urun={suzgec.urun} boyut={20} />{suzgec.urun.ad}</SuzgecEtiketi>
        )}
      </div>
    </div>
  );

  if (hata && !v) return <div className="flex flex-col gap-4">{suzgecler}<HataKutusu hata={hata} tekrar={yenile} /></div>;
  if (!v) {
    return (
      <div className="flex flex-col gap-4">
        {suzgecler}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Iskelet key={i} className="h-24" />)}</div>
        <Iskelet className="h-64" />
      </div>
    );
  }

  const { ozet } = v;
  return (
    <div className={cn('flex flex-col gap-4 transition-opacity', yukleniyor && 'opacity-60')} aria-busy={yukleniyor}>
      {suzgecler}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Istatistik etiket="Harcanan" deger={<Muz miktar={ozet.toplam} boyut={20} />} ikon={Wallet} />
        <Istatistik etiket="Satın alma" deger={<span className="sayi">{bicim(ozet.alim)}</span>} alt={`${bicim(ozet.adet)} adet ürün`} ikon={Receipt} />
        <Istatistik etiket="Alıcı" deger={<span className="sayi">{bicim(ozet.alici)}</span>} ikon={Users} />
        <Istatistik etiket="Kişi başı" deger={<Muz miktar={ozet.alici ? Math.round(ozet.toplam / ozet.alici) : 0} boyut={20} />} ikon={UserRound} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Kart>
          <KartBaslik ikon={Package} baslik="Ürünler" aciklama="Dokununca o ürünü alanlar süzülür." />
          {v.urunler.length === 0
            ? <Bos ikon={ShoppingBag} baslik="Satış yok" aciklama="Bu dönemde mağazadan bir şey alınmadı." className="py-6" />
            : <UrunListesi urunler={v.urunler} secili={suzgec.urun} sec={(u) => degis('urun', u)} />}
        </Kart>
        <Kart>
          <KartBaslik ikon={Users} baslik={v.secili ? `${v.secili.ad} alanlar` : 'En çok harcayanlar'} sag={<span className="text-xs text-silik">ilk 20</span>} />
          {v.alicilar.length === 0
            ? <p className="py-6 text-center text-sm text-silik">Bu süzgeçle alıcı yok.</p>
            : <AliciListesi alicilar={v.alicilar} sec={(u) => degis('uye', u)} />}
        </Kart>
      </div>

      <Kart>
        <KartBaslik ikon={Receipt} baslik="Satın almalar" aciklama={`${bicim(ozet.alim)} kayıt`} />
        {v.satirlar.length === 0
          ? <Bos ikon={Receipt} baslik="Kayıt yok" aciklama="Bu süzgeçle eşleşen satın alma bulunmadı." className="py-8" />
          : (
            <>
              <SatisListesi satirlar={v.satirlar} uyeSec={(u) => degis('uye', u)} urunSec={(u) => degis('urun', u)} />
              {v.sayfaSayisi > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Button boyut="sm" disabled={v.sayfa <= 1 || yukleniyor} onClick={() => setSayfa(v.sayfa - 1)}><ChevronLeft />Önceki</Button>
                  <span className="sayi text-sm text-soluk">Sayfa {v.sayfa} / {v.sayfaSayisi}</span>
                  <Button boyut="sm" disabled={v.sayfa >= v.sayfaSayisi || yukleniyor} onClick={() => setSayfa(v.sayfa + 1)}>Sonraki<ChevronRight /></Button>
                </div>
              )}
            </>
          )}
      </Kart>
      <p className="text-xs text-silik">
        Eşya, kasa, satılık rol ve özel renk rolü alımları sayılır. Rol verilemeyip iade edilen alımlar düşülür.
      </p>
      <UyeSecici acik={secici} degisti={setSecici} sec={(u) => degis('uye', u)} baslik="Alımları gösterilecek üye" />
    </div>
  );
}
