import {
  CalendarX, ExternalLink, LifeBuoy, ShieldBan, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Md } from '@/components/Md.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { baglantiAc } from '@/lib/sdk.js';
import { useUygulama } from '@/lib/store.js';
import { tarih } from '@/lib/utils.js';

/**
 * Ekonomiden uzaklaştırma penceresi. Gerçek uzaklaştırmada kapatılamaz:
 * kapatma düğmesi, Esc ya da dışına tıklama yoktur ve arkadaki uygulama
 * `inert` olur. Asıl engel sunucudadır (web/sunucu.js 403 döner); pencere
 * bir şekilde kapansa da hiçbir ekonomi isteği geçmez.
 *
 * `uzakOnizleme` (yönetim paneli) aynı pencereyi yöneticinin önüne düşürür;
 * yalnız o zaman kapatılabilir ve talep açmaz.
 */
export function UzakPenceresi() {
  const uzak = useUygulama((s) => s.uzak);
  const onizleme = useUygulama((s) => s.uzakOnizleme);
  const kayit = uzak ?? onizleme;
  const onizlemeMi = !uzak && Boolean(onizleme);
  const [talep, setTalep] = useState(null);
  const [bekliyor, setBekliyor] = useState(false);
  // Pencere uygulama kurulmadan da açılır (bildirim kutusu yok); hata burada yazılır.
  const [hata, setHata] = useState(null);

  useEffect(() => {
    if (!kayit || onizlemeMi) return undefined;
    const kok = document.getElementById('uygulama');
    if (kok) kok.inert = true;
    return () => {
      if (kok) kok.inert = false;
    };
  }, [kayit, onizlemeMi]);

  if (!kayit) return null;

  const talepAc = async () => {
    if (onizlemeMi) {
      bildirimGoster('Önizleme: gerçek pencerede bu düğme destek talebi açar.', 'bilgi');
      return;
    }
    setBekliyor(true);
    setHata(null);
    try {
      setTalep(await api('/api/talep/ac', { govde: {} }));
    } catch (e) {
      setHata(e.message);
    } finally {
      setBekliyor(false);
    }
  };
  const talebeGit = () => baglantiAc(`https://discord.com/channels/${talep.guildId}/${talep.kanalId}`);

  return createPortal(
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-zemin/85 p-4 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-labelledby="uzak-baslik">
      <div className="relative flex w-full max-w-md flex-col gap-5 rounded-3xl border border-kirmizi/35 bg-yuzey p-6 shadow-2xl">
        {onizlemeMi && (
          <button
            type="button"
            onClick={() => useUygulama.getState().uzakOnizle(null)}
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-xl text-silik transition-colors hover:bg-yuzey-3 hover:text-metin"
            aria-label="Önizlemeyi kapat"
          >
            <X className="size-5" />
          </button>
        )}
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-kirmizi/15 text-kirmizi"><ShieldBan className="size-8" /></span>
          {onizlemeMi && <span className="rounded-full bg-muz/15 px-2.5 py-0.5 text-xs font-medium text-muz">Önizleme · yalnız sen görüyorsun</span>}
          <h2 id="uzak-baslik" className="font-display text-2xl font-bold">Ekonomiden uzaklaştırıldın</h2>
          <p className="text-sm text-soluk">Muz, kasa, kart ve diğer ekonomi özelliklerini kullanamazsın; sohbetten muz ve XP de kazanamazsın. Bakiyen ve envanterin donduruldu.</p>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-kirmizi/25 bg-kirmizi/[0.07] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-kirmizi">Sebep</p>
          <Md metin={kayit.sebep} className="text-sm text-metin" />
          <p className="flex items-center gap-1.5 text-xs text-silik"><CalendarX className="size-3.5" />{tarih(kayit.zaman, { yil: true })}</p>
        </div>

        {talep ? (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm text-soluk">
              {talep.mevcut ? 'Zaten açık bir talebin var' : 'Destek talebin açıldı'}: <b className="text-metin">#{talep.id}</b>. Yetkililer orada yazacak.
            </p>
            <Button tur="ana" boyut="lg" tam onClick={talebeGit}><ExternalLink />Talebe git</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-soluk">Bunun bir hata olduğunu düşünüyorsan yetkililere yaz.</p>
            <Button tur="ana" boyut="lg" tam bekliyor={bekliyor} onClick={talepAc} autoFocus><LifeBuoy />Destek talebi aç</Button>
            {hata && <Md metin={hata} className="text-center text-sm text-kirmizi" />}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
