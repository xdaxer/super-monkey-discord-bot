import {
  Copy, Dices, Plus, TicketPercent, TimerOff, Users,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris } from '@/components/ui/giris.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { bicim, cn, tarih } from '@/lib/utils.js';

const SURE_ADLARI = {
  '30dk': '30 dakika', '1sa': '1 saat', '6sa': '6 saat', '1g': '1 gün', '3g': '3 gün', '7g': '7 gün',
};
const HARFLER = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rastgeleKod = () => `MUZ-${Array.from({ length: 5 }, () => HARFLER[Math.floor(Math.random() * HARFLER.length)]).join('')}`;

/** Promosyon kodları (app/lib/promo.js): oluştur, izle, erken bitir. */
export default function Promo() {
  const { veri, hata, yenile } = useApi('/api/yonetim/promo', { aralik: 30_000 });
  const [calistir, bekliyor] = useIslem();
  const [kod, setKod] = useState(rastgeleKod);
  const [odul, setOdul] = useState('1000');
  const [sinir, setSinir] = useState('');
  const [sure, setSure] = useState('1sa');

  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!veri) return <Iskelet className="h-72" />;

  const odulSayi = Number(odul.replace(/\D/g, ''));
  const sinirSayi = sinir.trim() ? Number(sinir.replace(/\D/g, '')) : null;
  const hazir = new RegExp(veri.kodDeseni).test(kod) && odulSayi >= 1 && odulSayi <= veri.odulMax;

  const olustur = async () => {
    const tamam = await onayIste({
      baslik: 'Promosyon kodu oluşturulsun mu?',
      metin: `**${kod}** kodu ${SURE_ADLARI[sure] ?? sure} boyunca kullanan ${sinirSayi ? `ilk **${bicim(sinirSayi)}** kişiye` : '**herkese**'} `
        + `birer kez **${bicim(odulSayi)}** muz verecek${sinirSayi ? ` (en çok ${bicim(sinirSayi * odulSayi)} muz)` : ''}. Emin misin?`,
      evet: 'Oluştur',
    });
    if (!tamam) return;
    await calistir(async () => {
      const r = await api('/api/yonetim/promo', {
        govde: {
          kod, odul: odulSayi, sinir: sinirSayi, sure,
        },
      });
      bildirimGoster(`**${r.kod}** oluşturuldu. Üyeler Activity'de ana ekrandan ya da \`/promo\` ile kullanabilir.`, 'basari');
      setKod(rastgeleKod());
      await yenile({ sessiz: true });
    });
  };

  const bitir = async (p) => {
    const tamam = await onayIste({
      baslik: 'Kod şimdi bitirilsin mi?',
      metin: `**${p.kod}** artık kullanılamayacak. Verilen ödüller geri alınmaz.`,
      evet: 'Bitir',
      tehlikeli: true,
    });
    if (!tamam) return;
    await calistir(async () => {
      await api('/api/yonetim/promo/bitir', { govde: { id: p.id } });
      bildirimGoster(`**${p.kod}** bitirildi.`, 'bilgi');
      await yenile({ sessiz: true });
    });
  };

  const kopyala = async (k) => {
    try {
      await navigator.clipboard.writeText(k);
      bildirimGoster(`**${k}** kopyalandı.`, 'basari');
    } catch {
      bildirimGoster('Kopyalanamadı; kodu elle seç.', 'hata');
    }
  };

  const simdi = Date.now();

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <Kart>
        <KartBaslik ikon={Plus} baslik="Kod oluştur" aciklama="Her üye bir kodu bir kez kullanır" />
        <div className="flex flex-col gap-4">
          <Alan etiket="Kod" ipucu="3–24 karakter: harf, rakam, tire. Büyük-küçük harf fark etmez.">
            <div className="flex gap-2">
              <Giris value={kod} onChange={(e) => setKod(e.target.value.toUpperCase().replace(/\s/g, ''))} maxLength={24} className="sayi flex-1 uppercase tracking-widest" />
              <Button tur="ikincil" onClick={() => setKod(rastgeleKod())} aria-label="Rastgele kod"><Dices /></Button>
            </div>
          </Alan>
          <div className="grid grid-cols-2 gap-3">
            <Alan etiket="Ödül (muz)">
              <Giris value={odul} onChange={(e) => setOdul(e.target.value)} inputMode="numeric" className="sayi" />
            </Alan>
            <Alan etiket="Kullanım sınırı" ipucu="Boş = sınırsız">
              <Giris value={sinir} onChange={(e) => setSinir(e.target.value)} inputMode="numeric" placeholder="Sınırsız" className="sayi" />
            </Alan>
          </div>
          <Alan etiket="Süre">
            <div className="grid grid-cols-3 gap-2">
              {veri.hazirSureler.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSure(s)}
                  aria-pressed={sure === s}
                  className={cn(
                    'h-10 rounded-xl border px-3 text-sm transition-colors pointer-coarse:h-11',
                    sure === s ? 'border-muz/60 bg-muz/10 text-muz' : 'border-cizgi bg-yuzey-3 text-soluk hover:text-metin',
                  )}
                >
                  {SURE_ADLARI[s] ?? s}
                </button>
              ))}
            </div>
          </Alan>
          <Button tur="ana" tam bekliyor={bekliyor} disabled={!hazir} onClick={olustur}><TicketPercent />Kodu oluştur</Button>
        </div>
      </Kart>

      <Kart>
        <KartBaslik ikon={TicketPercent} baslik="Kodlar" aciklama="Son 30 kod · 30 sn'de bir yenilenir" />
        {veri.liste.length === 0 ? (
          <Bos ikon={TicketPercent} baslik="Henüz kod yok" aciklama="Oluşturduğun kodlar burada listelenir." className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y divide-cizgi">
            {veri.liste.map((p) => {
              const etkin = p.bitis > simdi && (p.sinir === null || p.kullanim < p.sinir);
              return (
                <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => kopyala(p.kod)} className="sayi flex items-center gap-1.5 font-semibold tracking-widest hover:text-muz">
                        {p.kod}<Copy className="size-3.5 text-silik" />
                      </button>
                      <Rozet tur={etkin ? 'yesil' : 'notr'}>{etkin ? 'Yayında' : 'Bitti'}</Rozet>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-soluk">
                      <Muz miktar={p.odul} boyut={14} className="text-metin" />
                      <span className="flex items-center gap-1"><Users className="size-3.5" />{bicim(p.kullanim)}{p.sinir ? ` / ${bicim(p.sinir)}` : ''} kişi</span>
                      <span>· {etkin ? <>bitişe <GeriSayim hedef={p.bitis} bitince="bitti" className="sayi text-metin" /></> : tarih(p.bitis)}</span>
                    </p>
                    {p.sonKullananlar.length > 0 && (
                      <div className="mt-1.5 flex -space-x-1.5">
                        {p.sonKullananlar.map((u) => <Avatar key={u.id} uye={u} boyut={22} className="ring-2 ring-yuzey" />)}
                      </div>
                    )}
                  </div>
                  {etkin && <Button boyut="sm" tur="ikincil" bekliyor={bekliyor} onClick={() => bitir(p)} className="self-end sm:self-center"><TimerOff />Bitir</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </Kart>
    </div>
  );
}
