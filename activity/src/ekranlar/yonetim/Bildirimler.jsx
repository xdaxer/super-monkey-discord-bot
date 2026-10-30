import {
  BellRing, Eye, Send, Trash2, UserPlus, Users, X,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { DuyuruIcerik } from '@/components/OlayPenceresi.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris, girisSinifi } from '@/components/ui/giris.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { DUYURU_IKONLARI, duyuruIkonu } from '@/lib/duyuru-ikon.js';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { davetSesi } from '@/lib/ses.js';
import { useUygulama } from '@/lib/store.js';
import { cn, tarih } from '@/lib/utils.js';

const SURE_ADLARI = {
  '30dk': '30 dakika', '1sa': '1 saat', '6sa': '6 saat', '1g': '1 gün', '3g': '3 gün', '7g': '7 gün',
};

function Secenek({ secili, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={secili}
      className={cn(
        'flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors pointer-coarse:h-11',
        secili ? 'border-muz/60 bg-muz/10 text-muz' : 'border-cizgi bg-yuzey-3 text-soluk hover:text-metin',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Bildirim gönder (lib/duyuru.js): herkese ya da seçili üyelere Activity'de
 * sesli açılır pencere. Göndermeden önce onay istenir.
 */
export default function Bildirimler() {
  const { veri, hata, yenile } = useApi('/api/yonetim/duyurular');
  const ben = useUygulama((s) => s.kullanici);
  const [calistir, bekliyor] = useIslem();
  const [baslik, setBaslik] = useState('');
  const [metin, setMetin] = useState('');
  const [ikon, setIkon] = useState('megafon');
  const [herkes, setHerkes] = useState(true);
  const [alicilar, setAlicilar] = useState([]);
  const [sure, setSure] = useState('1g');
  const [secici, setSecici] = useState(false);
  const [onizleme, setOnizleme] = useState(false);

  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!veri) return <Iskelet className="h-72" />;

  const hazir = baslik.trim() && metin.trim() && (herkes || alicilar.length > 0);
  const uyeEkle = (u) => setAlicilar((l) => (l.some((x) => x.id === u.id) || l.length >= veri.aliciSiniri ? l : [...l, u]));

  const onizle = () => {
    setOnizleme(true);
    davetSesi();
  };

  const gonder = async () => {
    const kime = herkes ? '**herkese**' : `**${alicilar.length} üyeye** (${alicilar.map((u) => u.ad).join(', ')})`;
    const tamam = await onayIste({
      baslik: 'Bildirim gönderilsin mi?',
      metin: `**${baslik.trim()}** başlıklı bildirim ${kime} açılır pencere ve sesle gönderilecek. `
        + `${SURE_ADLARI[sure] ?? sure} boyunca Activity'yi açan görecek. Emin misin?`,
      evet: herkes ? 'Evet, herkese gönder' : 'Evet, gönder',
      tehlikeli: herkes,
    });
    if (!tamam) return;
    await calistir(async () => {
      await api('/api/yonetim/duyuru', {
        govde: {
          baslik: baslik.trim(), metin: metin.trim(), ikon, sure, hedef: herkes ? 'herkes' : 'secili', alicilar: herkes ? [] : alicilar.map((u) => u.id),
        },
      });
      bildirimGoster(`Bildirim ${herkes ? 'herkese' : `${alicilar.length} üyeye`} gönderildi.`, 'basari');
      setBaslik('');
      setMetin('');
      setAlicilar([]);
      await yenile({ sessiz: true });
    });
  };

  const gerical = async (d) => {
    const tamam = await onayIste({
      baslik: 'Bildirim geri çekilsin mi?',
      metin: `**${d.baslik}** henüz görmemiş olanlara artık düşmeyecek. Görenlerde değişiklik olmaz.`,
      evet: 'Geri çek',
      tehlikeli: true,
    });
    if (!tamam) return;
    await calistir(async () => {
      await api('/api/yonetim/duyuru/sil', { govde: { id: d.id } });
      bildirimGoster('Bildirim geri çekildi.', 'bilgi');
      await yenile({ sessiz: true });
    });
  };

  const simdi = Date.now();

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      <Kart>
        <KartBaslik
          ikon={BellRing}
          baslik="Bildirim gönder"
          aciklama="Activity'de sesli açılır pencere"
          sag={<Button boyut="sm" tur="ikincil" disabled={!baslik.trim() || !metin.trim()} onClick={onizle}><Eye />Önizle</Button>}
        />
        <div className="flex flex-col gap-4">
          <Alan etiket="Kime">
            <div className="grid grid-cols-2 gap-2">
              <Secenek secili={herkes} onClick={() => setHerkes(true)}><Users className="size-4" />Herkese</Secenek>
              <Secenek secili={!herkes} onClick={() => setHerkes(false)}><UserPlus className="size-4" />Belirli üyelere</Secenek>
            </div>
          </Alan>
          {!herkes && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {alicilar.map((u) => (
                  <span key={u.id} className="flex items-center gap-1.5 rounded-full border border-cizgi bg-yuzey-3 py-1 pl-1 pr-2 text-sm">
                    <Avatar uye={u} boyut={20} />{u.ad}
                    <button type="button" onClick={() => setAlicilar((l) => l.filter((x) => x.id !== u.id))} aria-label={`${u.ad} kaldır`} className="text-silik hover:text-metin"><X className="size-3.5" /></button>
                  </span>
                ))}
              </div>
              <Button tur="ikincil" boyut="sm" onClick={() => setSecici(true)} disabled={alicilar.length >= veri.aliciSiniri} className="self-start">
                <UserPlus />Üye ekle
              </Button>
            </div>
          )}
          <Alan etiket="İkon">
            <div className="grid grid-cols-4 gap-2">
              {veri.ikonlar.map((k) => {
                const { Ikon, ad } = DUYURU_IKONLARI[k] ?? { Ikon: BellRing, ad: k };
                return <Secenek key={k} secili={ikon === k} onClick={() => setIkon(k)}><Ikon className="size-4" /><span className="sr-only sm:not-sr-only">{ad}</span></Secenek>;
              })}
            </div>
          </Alan>
          <Alan etiket="Başlık" ipucu={`${baslik.length}/${veri.baslikUzunluk}`}>
            <Giris value={baslik} onChange={(e) => setBaslik(e.target.value)} maxLength={veri.baslikUzunluk} placeholder="2x Muz etkinliği başladı" />
          </Alan>
          <Alan etiket="Mesaj" ipucu={`**kalın** ve satır sonları desteklenir · ${metin.length}/${veri.metinUzunluk}`}>
            <textarea
              value={metin}
              onChange={(e) => setMetin(e.target.value)}
              maxLength={veri.metinUzunluk}
              rows={5}
              placeholder="Bu akşam 01:00'e kadar günlük ödül, sohbet ve çalışma muzu 2 kat."
              className={cn(girisSinifi, 'h-auto resize-y py-2')}
            />
          </Alan>
          <Alan etiket="Geçerlilik" ipucu="Bu süre içinde Activity'yi açan herkes görür; her cihazda bir kez çıkar.">
            <div className="grid grid-cols-3 gap-2">
              {veri.hazirSureler.map((s) => <Secenek key={s} secili={sure === s} onClick={() => setSure(s)}>{SURE_ADLARI[s] ?? s}</Secenek>)}
            </div>
          </Alan>
          <Button tur="ana" tam bekliyor={bekliyor} disabled={!hazir} onClick={gonder}>
            <Send />{herkes ? 'Herkese gönder' : `${alicilar.length} üyeye gönder`}
          </Button>
        </div>
      </Kart>

      <Kart>
        <KartBaslik ikon={Send} baslik="Gönderilenler" aciklama="Son 30 bildirim" />
        {veri.liste.length === 0 ? (
          <Bos ikon={BellRing} baslik="Henüz bildirim yok" aciklama="Gönderdiğin bildirimler burada listelenir." className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y divide-cizgi">
            {veri.liste.map((d) => {
              const Ikon = duyuruIkonu(d.ikon);
              const etkin = d.bitis > simdi;
              return (
                <li key={d.id} className="flex items-start gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muz/12 text-muz"><Ikon className="size-4.5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="truncate">{d.baslik}</span>
                      <Rozet tur={etkin ? 'yesil' : 'notr'}>{etkin ? 'Yayında' : 'Süresi doldu'}</Rozet>
                    </p>
                    <p className="line-clamp-2 text-sm text-soluk">{d.metin}</p>
                    <p className="sayi mt-1 text-xs text-silik">
                      {tarih(d.zaman)} · {d.gonderen?.ad ?? 'Yönetici'} · {d.alicilar ? `${d.alicilar.length} üye: ${d.alicilar.map((u) => u.ad).join(', ')}` : 'Herkese'}
                    </p>
                  </div>
                  {etkin && <Button boyut="sm" tur="hayalet" bekliyor={bekliyor} onClick={() => gerical(d)} aria-label="Geri çek"><Trash2 /></Button>}
                </li>
              );
            })}
          </ul>
        )}
      </Kart>

      <UyeSecici acik={secici} degisti={setSecici} sec={uyeEkle} baslik="Bildirim alacak üye" />
      <Pencere acik={onizleme} degisti={setOnizleme} baslik="Bildirim" ikon={duyuruIkonu(ikon)} aciklama="Önizleme · yalnız sen görüyorsun">
        <DuyuruIcerik o={{ baslik: baslik.trim(), metin: metin.trim(), ikon, gonderen: ben }} kapat={() => setOnizleme(false)} />
      </Pencere>
    </div>
  );
}
