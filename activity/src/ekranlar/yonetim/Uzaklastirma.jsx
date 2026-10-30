import {
  Eye, ShieldBan, ShieldCheck, UserRound, UserX,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Md } from '@/components/Md.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris, girisSinifi } from '@/components/ui/giris.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { cn, tarih } from '@/lib/utils.js';

const ORNEK_SEBEP = 'Yan hesapla başarım ve ödül kasıp ana hesaba aktarma.';

/**
 * Ekonomiden uzaklaştırma (lib/ekonomi-uzak.js): uzaklaştırılan üye ekonomiye
 * giremez, sohbetten muz ve XP kazanamaz, kimse ona aktarım yapamaz.
 */
export default function Uzaklastirma() {
  const { veri, hata, yenile } = useApi('/api/yonetim/uzaklastirma');
  const [calistir, bekliyor] = useIslem();
  const [secici, setSecici] = useState(false);
  const [uye, setUye] = useState(null);
  const [kimlik, setKimlik] = useState('');
  const [sebep, setSebep] = useState('');

  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!veri) return <Iskelet className="h-64" />;

  const hedefId = uye?.id ?? (/^\d{17,20}$/.test(kimlik.trim()) ? kimlik.trim() : null);
  const hedefAd = uye?.ad ?? (hedefId ? `Kimlik ${hedefId}` : null);

  const onizle = () => useUygulama.getState().uzakOnizle({ sebep: sebep.trim() || ORNEK_SEBEP, zaman: Date.now() });

  const uzaklastir = async () => {
    const tamam = await onayIste({
      baslik: 'Ekonomiden uzaklaştırılsın mı?',
      metin: `**${hedefAd}** ekonomiye giremeyecek; sohbetten muz ve XP kazanamayacak, kimse ona aktarım yapamayacak. Bakiyesi ve envanteri dondurulur.`,
      evet: 'Uzaklaştır',
      tehlikeli: true,
    });
    if (!tamam) return;
    await calistir(async () => {
      const r = await api('/api/yonetim/uzaklastir', { govde: { uyeId: hedefId, sebep: sebep.trim() } });
      bildirimGoster(`**${hedefAd}** ${r.yeni ? 'ekonomiden uzaklaştırıldı' : 'için sebep güncellendi'}.`, 'basari');
      setUye(null);
      setKimlik('');
      setSebep('');
      await yenile({ sessiz: true });
    });
  };

  const kaldir = async (k) => {
    const tamam = await onayIste({
      baslik: 'Uzaklaştırma kaldırılsın mı?',
      metin: `**${k.uye?.ad ?? 'Bu üye'}** ekonomiye geri döner; bakiyesi ve envanteri olduğu gibi açılır.`,
      evet: 'Kaldır',
    });
    if (!tamam) return;
    await calistir(async () => {
      await api('/api/yonetim/uzaklastirma-kaldir', { govde: { uyeId: k.uye.id } });
      bildirimGoster(`**${k.uye?.ad ?? 'Üye'}** ekonomiye geri döndü.`, 'basari');
      await yenile({ sessiz: true });
    });
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Kart>
        <KartBaslik
          ikon={ShieldBan}
          baslik="Ekonomiden uzaklaştır"
          sag={<Button boyut="sm" tur="ikincil" onClick={onizle}><Eye />Pencereyi önizle</Button>}
        />
        <div className="flex flex-col gap-4">
          <Alan etiket="Üye" ipucu="Sunucudan çıkmış bir hesap için kullanıcı kimliğini yaz.">
            <div className="flex items-center gap-2">
              <Button tur="ikincil" className="min-w-0 flex-1 justify-start" onClick={() => setSecici(true)}>
                {uye ? <><Avatar uye={uye} boyut={20} /><span className="truncate">{uye.ad}</span></> : <><UserRound />Üye seç</>}
              </Button>
              {uye && <Button tur="hayalet" onClick={() => setUye(null)} aria-label="Seçimi temizle"><UserX /></Button>}
            </div>
            {!uye && (
              <Giris value={kimlik} onChange={(e) => setKimlik(e.target.value)} placeholder="ya da kullanıcı kimliği" inputMode="numeric" className="sayi" />
            )}
          </Alan>
          <Alan etiket="Sebep" ipucu={`Üye bunu pencerede görecek · ${sebep.length}/${veri.sebepUzunluk}`}>
            <textarea
              value={sebep}
              onChange={(e) => setSebep(e.target.value)}
              maxLength={veri.sebepUzunluk}
              rows={4}
              placeholder={ORNEK_SEBEP}
              className={cn(girisSinifi, 'h-auto resize-y py-2')}
            />
          </Alan>
          <Button tur="tehlike" tam bekliyor={bekliyor} disabled={!hedefId || !sebep.trim()} onClick={uzaklastir}>
            <ShieldBan />Ekonomiden uzaklaştır
          </Button>
        </div>
      </Kart>

      <Kart>
        <KartBaslik ikon={UserX} baslik="Uzaklaştırılanlar" aciklama={`${veri.liste.length} üye`} />
        {veri.liste.length === 0 ? (
          <Bos ikon={ShieldCheck} baslik="Kimse uzaklaştırılmamış" aciklama="Uzaklaştırılan üyeler burada listelenir." className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y divide-cizgi">
            {veri.liste.map((k) => (
              <li key={k.uye.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar uye={k.uye} boyut={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{k.uye.ad}</p>
                    <Md metin={k.sebep} className="text-sm text-soluk" />
                    <p className="sayi mt-1 text-xs text-silik">
                      {tarih(k.zaman, { yil: true })} · {k.yetkili?.ad ?? 'Bilinmeyen yetkili'} · dondurulan bakiye <Muz miktar={k.bakiye} boyut={12} />
                    </p>
                  </div>
                </div>
                <Button boyut="sm" tur="ikincil" bekliyor={bekliyor} onClick={() => kaldir(k)} className="self-end sm:self-start"><ShieldCheck />Kaldır</Button>
              </li>
            ))}
          </ul>
        )}
      </Kart>

      <UyeSecici acik={secici} degisti={setSecici} sec={setUye} baslik="Uzaklaştırılacak üye" />
    </div>
  );
}
