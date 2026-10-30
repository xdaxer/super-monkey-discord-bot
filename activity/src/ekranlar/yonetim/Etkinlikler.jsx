import {
  CalendarClock, CalendarOff, Check, History, Play, Square,
} from 'lucide-react';
import { useState } from 'react';

import { Bos } from '@/components/Durumlar.jsx';
import { GeriSayim } from '@/components/GeriSayim.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris } from '@/components/ui/giris.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { cn, tarih } from '@/lib/utils.js';

/** Etkinlik adı "<simge> 2x Muz" biçiminde gelir; arayüzde simge kullanmıyoruz. */
const sade = (ad) => ad.replace(/^\S+\s/u, '');

const SURE_ADLARI = { '30dk': '30 dk', '1sa': '1 saat', '6sa': '6 saat', '1g': '1 gün', '3g': '3 gün', '7g': '7 gün' };

export default function Etkinlikler({ veri, yenile }) {
  const [tur, setTur] = useState(veri.etkinlikTurleri[0]?.tur);
  const [sure, setSure] = useState('1sa');
  const [calistir, bekliyor] = useIslem();

  const baslat = () => calistir(async () => {
    const r = await api('/api/yonetim/etkinlik', { govde: { tur, sure } });
    const ad = sade(veri.etkinlikTurleri.find((t) => t.tur === tur).ad);
    bildirimGoster(`**${ad}** ${r.guncellendi ? 'süresi güncellendi' : 'başlatıldı'}. ${r.duyuruldu ? 'Duyuru kanala gönderildi.' : 'Duyuru gönderilmedi (ekonomi kanalı yok ya da erişilemiyor).'}`, 'basari');
    await yenile();
  });

  const bitir = (e) => calistir(async () => {
    const tamam = await onayIste({ baslik: 'Etkinlik bitirilsin mi?', metin: `**${sade(e.ad)}** şimdi sona erecek.`, evet: 'Bitir', tehlikeli: true });
    if (!tamam) return;
    await api('/api/yonetim/etkinlik/bitir', { govde: { tur: e.tur } });
    bildirimGoster(`**${sade(e.ad)}** bitirildi.`, 'bilgi');
    await yenile();
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Kart>
        <KartBaslik ikon={CalendarClock} baslik="Etkin etkinlikler" aciklama="Süresi dolmamış olanlar." />
        {veri.etkinlikler.length === 0 ? (
          <Bos ikon={CalendarOff} baslik="Etkin etkinlik yok" aciklama="Yandaki formdan bir tane başlatabilirsin." className="py-6" />
        ) : (
          <ul className="flex flex-col gap-3">
            {veri.etkinlikler.map((e) => (
              <li key={e.tur} className="flex flex-col gap-2 rounded-xl border border-cizgi bg-zemin/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{sade(e.ad)}</p>
                    <p className="mt-0.5 text-xs text-soluk">Başlatan {e.baslatan.ad} · bitiş {tarih(e.bitis)}</p>
                  </div>
                  <Rozet tur="muz"><GeriSayim hedef={e.bitis} bitince="bitti" onBitti={yenile} /></Rozet>
                </div>
                <Button tur="ikincil" boyut="sm" className="w-fit" disabled={bekliyor} onClick={() => bitir(e)}><Square />Bitir</Button>
              </li>
            ))}
          </ul>
        )}
      </Kart>

      <Kart>
        <KartBaslik ikon={Play} baslik="Etkinlik başlat" aciklama="Aynı tür etkinse yalnız süresi güncellenir." />
        <div className="flex flex-col gap-4">
          <div role="radiogroup" className="grid gap-2">
            {veri.etkinlikTurleri.map((t) => {
              const aktif = t.tur === tur;
              return (
                <button
                  key={t.tur}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  onClick={() => setTur(t.tur)}
                  className={cn('flex items-start gap-3 rounded-xl border p-3 text-left transition-colors', aktif ? 'border-muz/60 bg-muz/[0.08]' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
                >
                  <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border', aktif ? 'border-muz bg-muz text-muz-metin' : 'border-cizgi-guclu')}>
                    {aktif && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{sade(t.ad)}</span>
                    <span className="block text-xs text-soluk">{t.etki.replace(/[`*]/g, '')}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Alan etiket="Süre" ipucu="Serbest yazabilirsin: 45dk, 2sa, 2g (en az 10 dakika, en çok 7 gün).">
            <div className="flex flex-wrap gap-1.5">
              {veri.hazirSureler.map((s) => (
                <button key={s} type="button" onClick={() => setSure(s)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors', sure === s ? 'border-muz/50 bg-muz/10 text-muz' : 'border-cizgi text-soluk hover:border-cizgi-guclu hover:text-metin')}>{SURE_ADLARI[s] ?? s}</button>
              ))}
            </div>
            <Giris value={sure} onChange={(e) => setSure(e.target.value)} maxLength={8} placeholder="1sa" className="sayi" />
          </Alan>
          <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} disabled={!tur || !sure.trim()} onClick={baslat}><Play />Başlat</Button>
        </div>
      </Kart>

      <Kart className="lg:col-span-2">
        <KartBaslik ikon={History} baslik="Geçmiş" aciklama="Son 20 etkinlik. Uzatma aynı satırı uzatır; ekonomi panelinde döneme değenler ayrıca listelenir." />
        {veri.etkinlikGecmisi.length === 0 ? (
          <Bos ikon={History} baslik="Henüz kayıt yok" className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y divide-cizgi">
            {veri.etkinlikGecmisi.map((e) => (
              <li key={`${e.tur}-${e.baslangic}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="font-medium">{sade(e.ad)}</span>
                <span className="text-xs text-soluk">
                  {tarih(e.baslangic)} → {tarih(e.bitis)}{e.erken ? ' · erken bitti' : ''} · {e.baslatan.ad}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </div>
  );
}
