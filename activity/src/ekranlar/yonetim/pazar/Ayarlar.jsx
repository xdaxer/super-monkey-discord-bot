import { Save, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris } from '@/components/ui/giris.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { cn } from '@/lib/utils.js';

const ALANLAR = [
  {
    ad: 'kesintiYuzde', etiket: 'Satış kesintisi (%)', min: 0, max: 50, ipucu: 'Satıcıya geçmeden düşülür; yok edilen muz.',
  },
  {
    ad: 'tavanCarpani', etiket: 'Fiyat tavanı (değerin katı)', min: 1, max: 100, ipucu: 'Taban her zaman kartın sistem değeri.',
  },
  {
    ad: 'ilanSiniri', etiket: 'Kişi başı açık ilan', min: 1, max: 200, ipucu: 'Var olan fazla ilanlar kalır; yenisi açılamaz.',
  },
];

/** Pazar ayarları: açık/kapalı anahtarı ve sayısal kurallar. */
export function Ayarlar({ ayarlar, yenile }) {
  const [taslak, setTaslak] = useState(ayarlar);
  const [calistir, bekliyor] = useIslem();
  useEffect(() => { setTaslak(ayarlar); }, [ayarlar]);

  const kaydet = (degisiklik) => calistir(async () => {
    const r = await api('/api/yonetim/pazar/ayarlar', { govde: degisiklik });
    bildirimGoster(r.degisti ? 'Pazar ayarları kaydedildi.' : 'Değişen bir ayar yok.', 'basari');
    yenile();
  });

  const acikDegistir = async () => {
    const yeni = !ayarlar.acik;
    if (!yeni && !await onayIste({
      baslik: 'Pazarı kapat',
      metin: 'Kapalıyken kimse ilan açamaz ve satın alamaz. Var olan ilanlar durur; üyeler ilanlarını kaldırabilir.',
      evet: 'Kapat',
      tehlikeli: true,
    })) return;
    kaydet({ acik: yeni });
  };

  const sayilar = Object.fromEntries(ALANLAR.map((a) => [a.ad, Number(taslak[a.ad])]));
  const hatali = ALANLAR.some((a) => !Number.isInteger(sayilar[a.ad]) || sayilar[a.ad] < a.min || sayilar[a.ad] > a.max);
  const degisti = ALANLAR.some((a) => sayilar[a.ad] !== ayarlar[a.ad]);

  return (
    <Kart className="p-4 sm:p-5">
      <KartBaslik ikon={Settings2} baslik="Pazar ayarları" aciklama="Değişiklikler hemen geçerli olur ve işlem kayıtlarına yazılır." />
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-cizgi bg-zemin/40 px-3.5 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Alım satım {ayarlar.acik ? 'açık' : 'kapalı'}</span>
            <span className="block text-xs text-silik">Kapatınca yeni ilan ve satın alma durur.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ayarlar.acik}
            aria-label="Pazar açık"
            disabled={bekliyor}
            onClick={acikDegistir}
            className={cn(
              // Görünen 32 px; dokunma alanı 48 px (HIG en az 44).
              "relative h-8 w-[52px] shrink-0 rounded-full transition-colors after:absolute after:-inset-2 after:content-[''] disabled:opacity-50",
              ayarlar.acik ? 'bg-yesil' : 'bg-yuzey-3 ring-1 ring-cizgi-guclu',
            )}
          >
            <span className={cn('absolute top-1 size-6 rounded-full bg-white shadow transition-[left] duration-200', ayarlar.acik ? 'left-[24px]' : 'left-1')} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {ALANLAR.map((a) => (
            <Alan key={a.ad} etiket={a.etiket} ipucu={`${a.min}–${a.max}. ${a.ipucu}`}>
              <Giris
                inputMode="numeric"
                value={taslak[a.ad]}
                onChange={(e) => setTaslak((t) => ({ ...t, [a.ad]: e.target.value.replace(/[^\d]/g, '') }))}
                aria-invalid={!Number.isInteger(sayilar[a.ad]) || sayilar[a.ad] < a.min || sayilar[a.ad] > a.max}
              />
            </Alan>
          ))}
        </div>
        <div className="flex justify-end">
          <Button tur="ana" disabled={!degisti || hatali} bekliyor={bekliyor} onClick={() => kaydet(sayilar)}><Save />Kaydet</Button>
        </div>
      </div>
    </Kart>
  );
}
