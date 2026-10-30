import {
  ClipboardCheck, Crosshair, Hourglass, MousePointerClick, ShieldAlert, ThumbsDown, ThumbsUp, Users,
} from 'lucide-react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Istatistik } from '@/components/Bolum.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { EmojiIkon } from '@/lib/emoji.jsx';
import { useApi } from '@/lib/kancalar.js';
import { bicim, sure, tarih } from '@/lib/utils.js';

/**
 * Lucide ikonu yerine BTD maymunu: ikon alan bileşenlere (Istatistik,
 * KartBaslik, Bos) verilir. Sunucuda resim yoksa yedek ikon çizilir.
 */
function maymun(btd, yedek, boyut) {
  return function MaymunIkonu() {
    return <EmojiIkon btd={btd} yedek={yedek} boyut={boyut} />;
  };
}

const USTABASI = maymun('btd_engineer', ClipboardCheck, 26);
const USTABASI_BUYUK = maymun('btd_engineer', ClipboardCheck, 34);
const KISI = maymun('btd_wave', Users, 18);
const DOGRU = maymun('btd_thumbsup', ThumbsUp, 18);
const YANLIS = maymun('btd_thumbsdown', ThumbsDown, 18);
const SUPHELI = maymun('btd_ninja', ShieldAlert, 18);
/** Rozet içi: rozetin yazısıyla aynı boyda. */
const rozetMaymunu = (btd, yedek) => <EmojiIkon btd={btd} yedek={yedek} boyut={14} />;

/**
 * Ustabaşı yoklaması (lib/calis-yoklama.js): kim yoklandı, kim takıldı.
 * Makro izi: çok yanlış, betikle tık, pencerede boşa tıklama ve uzun süre
 * cevapsız kalan (takılı) yoklama. "Aynı nokta" tek başına şüphe değildir:
 * fareyi düğmede bırakıp tıklayan insan da aynı piksele basar.
 */
export default function Yoklama() {
  const { veri: o, hata, yenile } = useApi('/api/yonetim/yoklama', { aralik: 60_000 });
  if (hata && !o) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!o) return <Iskelet className="h-64" />;

  const oran = (n) => (o.dogru + o.yanlis > 0 ? ` · %${Math.round((n / (o.dogru + o.yanlis)) * 100)}` : '');
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Istatistik ikon={KISI} etiket="Yoklanan kişi" deger={bicim(o.kisi)} alt={`${bicim(o.toplam)} yoklama · ${o.gun} gün`} />
        <Istatistik ikon={DOGRU} etiket="Doğru" deger={bicim(o.dogru)} alt={`cevap${oran(o.dogru)}`} />
        <Istatistik ikon={YANLIS} etiket="Yanlış" deger={bicim(o.yanlis)} alt={`cevap${oran(o.yanlis)}`} />
        <Istatistik ikon={SUPHELI} etiket="Şüpheli" deger={bicim(o.supheli)} alt={`${bicim(o.bekleyen)} kişi şu an takılı`} />
      </div>

      <Kart>
        <KartBaslik
          ikon={USTABASI}
          baslik="Yoklanan çalışanlar"
          aciklama={`Her ${o.sira.alt}–${o.sira.ust} çalışmada bir; aynı noktaya basan ya da betikle tıklayan hemen yoklanır. Şüpheliler üstte.`}
        />
        {o.kisiler.length === 0 ? (
          <Bos ikon={USTABASI_BUYUK} baslik="Henüz yoklama yok" aciklama={`Son ${o.gun} günde kimse yoklanmadı.`} className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y divide-cizgi">
            {o.kisiler.map((k, i) => (
              <li key={k.uye?.id ?? i} className="flex items-start gap-3 py-2.5">
                <Avatar uye={k.uye} boyut={28} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-medium">{k.uye?.ad ?? 'Bilinmeyen üye'}</p>
                  <p className="sayi text-xs text-silik">
                    {bicim(k.toplam)} yoklama · {bicim(k.dogru)} doğru · {bicim(k.yanlis)} yanlış
                    {k.medyanMs !== null && ` · cevap ${sure(k.medyanMs)}`} · son {tarih(k.son)}
                  </p>
                  {(k.tik > 0 || k.sentetik > 0 || k.bosTik > 0 || k.bekliyor !== null) && (
                    <div className="flex flex-wrap gap-1.5">
                      {k.bekliyor !== null && <Rozet tur="muz">{rozetMaymunu('btd_sleep', Hourglass)}Takılı · {tarih(k.bekliyor)}</Rozet>}
                      {k.tik > 0 && <Rozet tur="mor">{rozetMaymunu('btd_sniper', Crosshair)}Aynı nokta ×{k.tik}</Rozet>}
                      {k.sentetik > 0 && <Rozet tur="mor">{rozetMaymunu('btd_shh', Crosshair)}Betik tıkı ×{k.sentetik}</Rozet>}
                      {k.bosTik > 0 && <Rozet>{rozetMaymunu('btd_dartling', MousePointerClick)}Boşa tık {bicim(k.bosTik)}</Rozet>}
                    </div>
                  )}
                </div>
                {k.supheli ? <Rozet tur="kirmizi">Şüpheli</Rozet> : <Rozet tur="yesil">Temiz</Rozet>}
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </div>
  );
}
