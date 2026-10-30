import {
  ChartNoAxesColumn, HandCoins, Receipt, Tag, UserRound,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { HataKutusu } from '@/components/Durumlar.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { SekmeIcerik, Sekmeler } from '@/components/ui/sekmeler.jsx';
import { useApi } from '@/lib/kancalar.js';
import { cn } from '@/lib/utils.js';
import { KartKaresi, kartBilgisi } from '../pazar/ortak.jsx';
import { Ayarlar } from './pazar/Ayarlar.jsx';
import { Kayitlar } from './pazar/Kayitlar.jsx';
import { Ozet } from './pazar/Ozet.jsx';
import { DONEMLER, Secmeli, SuzgecEtiketi } from './pazar/ortak.jsx';

const ALT_SEKMELER = [
  { deger: 'ozet', ad: 'Özet', ikon: ChartNoAxesColumn },
  { deger: 'ilan', ad: 'İlanlar', ikon: Tag },
  { deger: 'istek', ad: 'Alım istekleri', ikon: HandCoins },
  { deger: 'satis', ad: 'Satışlar', ikon: Receipt },
];

/**
 * Topluluk pazarı yönetimi: ayarlar (aç/kapa, kesinti, tavan, ilan sınırı),
 * özet ve şüphe işaretleri, bütün ilanlar / alım istekleri / satışlar ve
 * yönetici işlemleri (düzenle, kaldır, el koy, geri al). Her işlem kayda geçer.
 */
export default function PazarYonetimi() {
  const [donem, setDonem] = useState('30g');
  const [yoneticiGizle, setYoneticiGizle] = useState(false);
  const [alt, setAlt] = useState('ozet');
  const [suzgec, setSuzgec] = useState({ uye: null, kart: null });
  const [secici, setSecici] = useState(false);
  const { veri: v, hata, yukleniyor, yenile } = useApi(`/api/yonetim/pazar?donem=${donem}${yoneticiGizle ? '&yoneticiGizle=1' : ''}`, { aralik: 30_000 });
  const tazele = () => yenile({ sessiz: true });

  // Özetten bir üyeye/karta dokununca satışlar o süzgeçle açılır.
  const uyeSec = (uye) => { setSuzgec((s) => ({ ...s, uye })); if (alt === 'ozet') setAlt('satis'); };
  const kartSec = (kart) => { setSuzgec((s) => ({ ...s, kart })); if (alt === 'ozet') setAlt('satis'); };

  return (
    <div className="flex flex-col gap-4">
      {hata && !v && <HataKutusu hata={hata} tekrar={yenile} />}
      {!v && !hata && <Iskelet className="h-56" />}
      {v && (
        <Sekmeler deger={alt} degisti={setAlt} liste={ALT_SEKMELER}>
          {alt !== 'ozet' && (
            <div className="flex flex-wrap items-center gap-2">
              {suzgec.uye
                ? <SuzgecEtiketi kaldir={() => setSuzgec((s) => ({ ...s, uye: null }))} etiket="Üye süzgecini kaldır"><Avatar uye={suzgec.uye} boyut={22} />{suzgec.uye.ad}</SuzgecEtiketi>
                : <Button boyut="sm" onClick={() => setSecici(true)}><UserRound />Üye seç</Button>}
              {suzgec.kart && (
                <SuzgecEtiketi kaldir={() => setSuzgec((s) => ({ ...s, kart: null }))} etiket="Kart süzgecini kaldır">
                  <KartKaresi kimlik={suzgec.kart} boyut={18} className="rounded-md" />{kartBilgisi(suzgec.kart).ad}
                </SuzgecEtiketi>
              )}
              {!suzgec.kart && <span className="text-xs text-silik">Karta süzmek için listede bir karta dokun.</span>}
            </div>
          )}
          <SekmeIcerik deger="ozet">
            <div className={cn('flex flex-col gap-3 transition-opacity', yukleniyor && 'opacity-60')}>
              <Ayarlar ayarlar={v.ayarlar} yenile={tazele} />
              <div className="flex flex-wrap items-center gap-3">
                <Secmeli liste={DONEMLER} deger={donem} degisti={setDonem} etiket="Dönem" />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-soluk">
                  <input type="checkbox" checked={yoneticiGizle} onChange={(e) => setYoneticiGizle(e.target.checked)} className="size-5 accent-[var(--color-muz)]" />
                  Yöneticileri gizle
                </label>
              </div>
              <Ozet v={v} uyeSec={uyeSec} kartSec={kartSec} />
            </div>
          </SekmeIcerik>
          {['ilan', 'istek', 'satis'].map((tur) => (
            <SekmeIcerik key={tur} deger={tur}>
              <Kayitlar tur={tur} suzgec={suzgec} uyeSec={(u) => setSuzgec((s) => ({ ...s, uye: u }))} kartSec={(k) => setSuzgec((s) => ({ ...s, kart: k }))} degisti={tazele} />
            </SekmeIcerik>
          ))}
        </Sekmeler>
      )}
      <UyeSecici acik={secici} degisti={setSecici} sec={(u) => setSuzgec((s) => ({ ...s, uye: u }))} baslik="Pazar kayıtları süzülecek üye" />
    </div>
  );
}
