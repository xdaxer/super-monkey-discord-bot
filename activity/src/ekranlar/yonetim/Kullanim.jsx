import {
  Activity, CalendarDays, Clock, LayoutGrid, Timer, Users,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Istatistik } from '@/components/Bolum.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { EKRANLAR } from '@/ekranlar/index.js';
import { useApi } from '@/lib/kancalar.js';
import {
  bicim, cn, sure, tarih,
} from '@/lib/utils.js';

const DONEMLER = [
  { kimlik: 'bugun', ad: 'Bugün' },
  { kimlik: '7g', ad: 'Son 7 gün' },
  { kimlik: '30g', ad: 'Son 30 gün' },
  { kimlik: 'tumu', ad: 'Tümü' },
];

const ekranAdi = (k) => EKRANLAR.find((e) => e.kimlik === k)?.ad ?? (k === 'diger' ? 'Diğer' : k);
/** "2026-10-23" → "23.10" */
const gunAdi = (g) => `${g.slice(8, 10)}.${g.slice(5, 7)}`;
/** Süre; sıfırsa "—" (bir dakikadan kısa tek nabızlık ziyaret). */
const sureMetni = (ms) => (ms > 0 ? sure(ms) : '—');

/** Yatay çubuk listesi (Genel bakıştaki KalemListesi gibi). */
function CubukListesi({ satirlar }) {
  const en = Math.max(1, ...satirlar.map((s) => s.ms));
  return (
    <ul className="flex flex-col gap-3">
      {satirlar.map((s) => (
        <li key={s.anahtar} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-soluk">{s.ad}</span>
            <span className="sayi shrink-0 font-medium">{sure(s.ms)}<span className="ml-2 text-xs font-normal text-silik">{s.kisi} kişi</span></span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-yuzey-3">
            <div className="h-full rounded-full bg-muz" style={{ width: `${Math.max(2, (s.ms / en) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function UyeTablosu({ uyeler }) {
  if (uyeler.length === 0) return <Bos ikon={Users} baslik="Kayıt yok" aciklama="Bu dönemde arayüzü kullanan olmadı." className="py-6" />;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cizgi text-left text-xs uppercase tracking-wide text-silik">
              <th className="py-2 pr-3 font-medium">Üye</th>
              <th className="py-2 pr-3 text-right font-medium">Toplam</th>
              <th className="py-2 pr-3 text-right font-medium">Oturum</th>
              <th className="py-2 pr-3 text-right font-medium">En uzun</th>
              <th className="py-2 pr-3 font-medium">En çok</th>
              <th className="py-2 font-medium">Son görülme</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cizgi">
            {uyeler.map((u) => (
              <tr key={u.id}>
                <td className="py-2.5 pr-3">
                  <span className="flex min-w-0 items-center gap-2"><Avatar uye={u} boyut={24} /><span className="truncate">{u.ad}</span></span>
                </td>
                <td className="sayi py-2.5 pr-3 text-right font-medium">{sureMetni(u.ms)}</td>
                <td className="sayi py-2.5 pr-3 text-right text-soluk">{bicim(u.oturum)}</td>
                <td className="sayi py-2.5 pr-3 text-right text-soluk">{sureMetni(u.enUzun)}</td>
                <td className="py-2.5 pr-3">{u.ekran ? <Rozet>{ekranAdi(u.ekran)}</Rozet> : '—'}</td>
                <td className="sayi py-2.5 text-soluk">{u.son ? tarih(u.son) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {uyeler.map((u) => (
          <li key={u.id} className="flex flex-col gap-1.5 rounded-xl border border-cizgi bg-zemin/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2"><Avatar uye={u} boyut={24} /><span className="truncate font-medium">{u.ad}</span></span>
              <span className="sayi shrink-0 font-medium">{sureMetni(u.ms)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-silik">
              <span>{bicim(u.oturum)} oturum</span>
              <span>en uzun {sureMetni(u.enUzun)}</span>
              {u.ekran && <span>en çok {ekranAdi(u.ekran)}</span>}
              {u.son > 0 && <span>son {tarih(u.son)}</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Arayüzde geçen süre: yalnız yönetici görür (sunucu da denetler). */
export default function Kullanim() {
  const [donem, setDonem] = useState('7g');
  const { veri: k, hata, yenile } = useApi(`/api/yonetim/kullanim?donem=${donem}`, { aralik: 60_000 });

  const donemSecici = (
    <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-cizgi bg-yuzey p-1">
      {DONEMLER.map((d) => (
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
  );

  if (hata) return <div className="flex flex-col gap-4">{donemSecici}<HataKutusu hata={hata} tekrar={yenile} /></div>;
  if (!k || k.donem !== donem) {
    return (
      <div className="flex flex-col gap-4">
        {donemSecici}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Iskelet key={i} className="h-24" />)}</div>
        <Iskelet className="h-56" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {donemSecici}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Istatistik etiket="Toplam süre" deger={<span className="sayi">{sureMetni(k.toplamMs)}</span>} alt={`${bicim(k.kisi)} kişi`} ikon={Clock} />
        <Istatistik etiket="Kişi başı" deger={<span className="sayi">{sureMetni(k.kisi > 0 ? k.toplamMs / k.kisi : 0)}</span>} ikon={Users} />
        <Istatistik etiket="Oturum" deger={<span className="sayi">{bicim(k.oturum)}</span>} alt={`ortalama ${sureMetni(k.ortalamaOturumMs)}`} ikon={Timer} />
        <Istatistik etiket="En uzun oturum" deger={<span className="sayi">{sureMetni(k.enUzunOturumMs)}</span>} ikon={Activity} />
      </div>

      <Kart>
        <KartBaslik ikon={Activity} baslik="Şu an arayüzde" sag={<span className="sayi text-sm text-soluk">{k.simdiAktif.length} kişi</span>} />
        {k.simdiAktif.length === 0
          ? <p className="py-2 text-sm text-silik">Şu an kimse yok.</p>
          : (
            <div className="flex flex-wrap gap-2">
              {k.simdiAktif.map((u) => (
                <span key={u.id} className="flex items-center gap-2 rounded-full border border-cizgi bg-yuzey-2 py-1 pr-3 pl-1 text-sm">
                  <Avatar uye={u} boyut={22} />
                  {u.ad}
                  <span className="sayi text-xs text-silik">{sure(u.son - u.baslangic)}</span>
                </span>
              ))}
            </div>
          )}
      </Kart>

      <div className="grid gap-4 md:grid-cols-2">
        <Kart>
          <KartBaslik ikon={LayoutGrid} baslik="Ekranlara göre" />
          {k.ekranlar.length === 0
            ? <p className="py-4 text-center text-sm text-silik">Bu dönemde kayıt yok.</p>
            : <CubukListesi satirlar={k.ekranlar.map((e) => ({ anahtar: e.ekran, ad: ekranAdi(e.ekran), ms: e.ms, kisi: e.kisi }))} />}
        </Kart>
        <Kart>
          <KartBaslik ikon={CalendarDays} baslik="Günlere göre" />
          {k.gunluk.length === 0
            ? <p className="py-4 text-center text-sm text-silik">Bu dönemde kayıt yok.</p>
            : <CubukListesi satirlar={[...k.gunluk].reverse().map((g) => ({ anahtar: g.gun, ad: gunAdi(g.gun), ms: g.ms, kisi: g.kisi }))} />}
        </Kart>
      </div>

      <Kart>
        <KartBaslik ikon={Users} baslik="Üyeler" sag={<span className="text-xs text-silik">en çok 100 üye</span>} />
        <UyeTablosu uyeler={k.uyeler} />
      </Kart>
      <p className="text-xs text-silik">
        Süre, arayüz açık ve kullanılırken (son 5 dakikada dokunma/tıklama) dakikada bir gelen nabızla ölçülür; boşta bekleyen sekme sayılmaz.
      </p>
    </div>
  );
}
