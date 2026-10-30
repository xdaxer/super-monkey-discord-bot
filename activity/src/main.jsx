import { DiscordSDK } from '@discord/embedded-app-sdk';
import { LoaderCircle, MonitorSmartphone, RotateCw, ShieldOff } from 'lucide-react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import './stil.css';
import App from '@/App.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Md } from '@/components/Md.jsx';
import { EKRANLAR } from '@/ekranlar/index.js';
import { api, oturumAyarla, yenidenGirisAyarla } from '@/lib/api.js';
import { sdkAyarla } from '@/lib/sdk.js';
import { useUygulama } from '@/lib/store.js';
import { UzakPenceresi } from '@/components/UzakPenceresi.jsx';
import { depo } from '@/lib/utils.js';

/** SDK el sıkışması + OAuth kodu → bizim oturumumuz (app/web/oturum.js). */
async function girisKur() {
  const sdk = new DiscordSDK(__CLIENT_ID__);
  await sdk.ready();
  sdkAyarla(sdk);
  const girisYap = async () => {
    const { code } = await sdk.commands.authorize({
      client_id: __CLIENT_ID__, response_type: 'code', state: '', prompt: 'none', scope: ['identify'],
    });
    const yanit = await fetch('/api/giris', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kod: code }),
    });
    const veri = await yanit.json().catch(() => ({}));
    if (!yanit.ok) throw new Error(veri.sebep ?? 'Giriş yapılamadı.');
    oturumAyarla(veri.oturum);
    useUygulama.getState().setKullanici(veri.kullanici);
    // SDK'nın kullanıcıya bağlı komutları için; başarısızsa uygulama yine çalışır.
    await sdk.commands.authenticate({ access_token: veri.erisim }).catch(() => null);
  };
  await girisYap();
  yenidenGirisAyarla(girisYap);
}

function Ortada({ ikon: Ikon, baslik, children, donen = false }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-muz to-muz-koyu text-muz-metin shadow-[0_10px_30px_-10px_rgb(255_212_59/0.8)]">
          <Ikon className={donen ? 'size-7 animate-spin' : 'size-7'} />
        </div>
        <h1 className="font-display text-2xl font-bold">{baslik}</h1>
        {children}
      </div>
    </div>
  );
}

function Acilis() {
  const [durum, setDurum] = useState({ tur: 'yukleniyor', metin: 'Discord\'a bağlanıyor…' });
  const hazir = useUygulama((s) => s.katalog !== null && s.kullanici !== null);

  const baslat = async () => {
    const parametre = new URLSearchParams(location.search);
    // Yalnız geliştirme derlemesi (npm run dev): Discord'suz önizleme oturumu.
    // Yayın derlemesinde import.meta.env.DEV false olduğu için bu dal tamamen düşer.
    const onizleme = import.meta.env.DEV ? parametre.get('onizleme') : null;
    if (!onizleme && !parametre.has('frame_id')) {
      setDurum({ tur: 'disarida' });
      return;
    }
    try {
      setDurum({ tur: 'yukleniyor', metin: 'Discord\'a bağlanıyor…' });
      if (onizleme) {
        oturumAyarla(onizleme);
        const b = await api('/api/ben');
        useUygulama.getState().setKullanici({ ...b.kullanici, yonetici: b.yonetici });
      } else {
        await girisKur();
      }
      setDurum({ tur: 'yukleniyor', metin: 'Ekonomi yükleniyor…' });
      // Uzaklaştırılmış üye için ekonomi rotaları 403 döner: önce kim olduğuna bak.
      const ben = await api('/api/ben');
      useUygulama.getState().setKullanici({ ...useUygulama.getState().kullanici, yonetici: ben.yonetici });
      if (ben.uzak) {
        useUygulama.getState().setUzak(ben.uzak);
        setDurum({ tur: 'uzak' });
        return;
      }
      const katalog = await api('/api/katalog');
      if (!ben.ekonomiAcik) {
        setDurum({ tur: 'kapali' });
        return;
      }
      useUygulama.getState().setKatalog(katalog);
      await api('/api/ozet').catch(() => null);
      // Slash komutla açıldıysa o komutun ekranı, yoksa son kalınan ekran.
      const son = (onizleme && parametre.get('ekran')) || ben.acilis?.ekran || depo.oku('son-ekran');
      if (EKRANLAR.some((e) => e.kimlik === son)) useUygulama.getState().git(son, ben.acilis?.secenek);
      setDurum({ tur: 'hazir' });
    } catch (e) {
      setDurum({ tur: 'hata', metin: e?.message ?? String(e) });
    }
  };

  useEffect(() => { baslat(); }, []);

  if (durum.tur === 'hazir' && hazir) return <App />;
  if (durum.tur === 'disarida') {
    return (
      <Ortada ikon={MonitorSmartphone} baslik="Muz Ekonomisi">
        <p className="text-sm text-soluk">Bu uygulama Discord içinde çalışır. Bir ses kanalında <strong className="text-metin">Etkinlikler</strong> menüsünden aç.</p>
      </Ortada>
    );
  }
  // Uygulama hiç kurulmaz; arkada boş bir zemin, önde kapanmayan pencere.
  if (durum.tur === 'uzak') return <UzakPenceresi />;
  if (durum.tur === 'kapali') {
    return (
      <Ortada ikon={ShieldOff} baslik="Ekonomi kapalı">
        <p className="text-sm text-soluk"><Md metin="Ekonomi sistemi bu sunucuda kapalı. Yönetici `/ayar sistem` ile açabilir." /></p>
      </Ortada>
    );
  }
  if (durum.tur === 'hata') {
    return (
      <Ortada ikon={ShieldOff} baslik="Bağlanılamadı">
        <p className="text-sm text-soluk"><Md metin={durum.metin} /></p>
        <Button tur="ana" onClick={baslat}><RotateCw />Tekrar dene</Button>
      </Ortada>
    );
  }
  return (
    <Ortada ikon={LoaderCircle} donen baslik="Muz Ekonomisi">
      <p className="text-sm text-soluk">{durum.metin}</p>
    </Ortada>
  );
}

createRoot(document.getElementById('uygulama')).render(<StrictMode><Acilis /></StrictMode>);
