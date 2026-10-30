import {
  Clock, FlaskConical, Megaphone, ThumbsDown, ThumbsUp, Users,
} from 'lucide-react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Istatistik } from '@/components/Bolum.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { useApi } from '@/lib/kancalar.js';
import { bicim, tarih } from '@/lib/utils.js';

const SONUCLAR = {
  kazandi: { ad: 'Bastırdı', tur: 'yesil' },
  kaybetti: { ad: 'Kaybetti', tur: 'kirmizi' },
  sure: { ad: 'Süre doldu', tur: 'kirmizi' },
};

function SonucRozeti({ k }) {
  const s = SONUCLAR[k.sonuc] ?? { ad: 'Yarım kaldı', tur: 'notr' };
  return <Rozet tur={s.tur}>{s.ad}</Rozet>;
}

/** Maymun grevi: kaç kişi yakalandı (yalnız yönetici görür; sunucu da denetler). */
export default function Grev() {
  const { veri: g, hata, yenile } = useApi('/api/yonetim/grev', { aralik: 60_000 });
  if (hata && !g) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!g) return <Iskelet className="h-64" />;

  const oran = (n) => (g.toplam > 0 ? ` · %${Math.round((n / g.toplam) * 100)}` : '');
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Istatistik ikon={Users} etiket="Yakalanan kişi" deger={bicim(g.kisi)} alt={`${bicim(g.toplam)} grev`} />
        <Istatistik ikon={ThumbsUp} etiket="Bastıran" deger={bicim(g.kazanan)} alt={`grev${oran(g.kazanan)}`} />
        <Istatistik ikon={ThumbsDown} etiket="Enerjisi giden" deger={bicim(g.kaybeden)} alt={`grev${oran(g.kaybeden)}`} />
        <Istatistik ikon={Clock} etiket="Son grev" deger={g.son ? tarih(g.son) : '—'} alt={`her çalışmada %${(g.sans * 100).toLocaleString('tr-TR')}`} />
      </div>

      <Kart>
        <KartBaslik
          ikon={Megaphone}
          baslik="Son grevler"
          aciklama={g.test > 0 ? `${bicim(g.test)} test grevi sayılara katılmadı` : 'En yeni 50 grev'}
        />
        {g.kayitlar.length === 0 ? (
          <Bos ikon={Megaphone} baslik="Henüz grev yok" aciklama="Maymunlar şimdilik halinden memnun." className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y divide-cizgi">
            {g.kayitlar.map((k, i) => (
              <li key={`${k.baslangic}-${i}`} className="flex items-center gap-3 py-2.5">
                <Avatar uye={k.uye} boyut={28} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {k.uye?.ad ?? 'Bilinmeyen üye'}
                    {k.test && <FlaskConical className="size-3.5 shrink-0 text-silik" aria-label="Test" />}
                  </p>
                  <p className="sayi text-xs text-silik">
                    {tarih(k.baslangic)}{k.vurulan !== null && ` · ${bicim(k.vurulan)} maymun işe döndü`}
                  </p>
                </div>
                <SonucRozeti k={k} />
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </div>
  );
}
