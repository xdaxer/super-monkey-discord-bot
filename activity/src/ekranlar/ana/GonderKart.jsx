import { Send, UserRound } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { MiktarGirisi } from '@/components/MiktarGirisi.jsx';
import { Muz } from '@/components/Muz.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { bicim } from '@/lib/utils.js';

/** Muz gönder: alıcı, miktar, vergi ve kalan günlük limit. */
export function GonderKart({ o, yenile }) {
  const g = o.gonderim;
  const [alici, setAlici] = useState(null);
  const [secici, setSecici] = useState(false);
  const [miktar, setMiktar] = useState('');
  const [calistir, bekliyor] = useIslem();

  const gonder = () => {
    if (!alici) { bildirimGoster('Önce alıcıyı seç.', 'hata'); return undefined; }
    if (!miktar.trim()) { bildirimGoster('Göndereceğin miktarı yaz: `500`, `2.5k`, `yarı`.', 'hata'); return undefined; }
    return calistir(async () => {
      const r = await api('/api/gonder', { govde: { aliciId: alici.id, miktar: miktar.trim() } });
      setMiktar('');
      bildirimGoster(`**${r.alici?.ad ?? alici.ad}** kişisine ${bicim(r.net)} muz ulaştı${r.vergi > 0 ? ` (${bicim(r.vergi)} vergi kesildi)` : ''}.`, 'basari');
      yenile();
    });
  };

  return (
    <Kart className="flex flex-col gap-4">
      <KartBaslik ikon={Send} baslik="Muz gönder" aciklama={`%${g.vergiYuzde} vergi kesilir · en az ${g.min}`} className="mb-0" />
      <button
        type="button"
        onClick={() => setSecici(true)}
        className="flex h-12 items-center gap-3 rounded-xl border border-cizgi bg-zemin/60 px-3 text-left transition-colors hover:border-cizgi-guclu"
      >
        {alici
          ? <Avatar uye={alici} boyut={28} />
          : <span className="grid size-7 place-items-center rounded-full bg-yuzey-3 text-silik"><UserRound className="size-4" /></span>}
        <span className={alici ? 'flex-1 truncate font-medium' : 'flex-1 text-sm text-silik'}>{alici ? alici.ad : 'Alıcı seç'}</span>
        <span className="text-xs text-silik">{alici ? 'değiştir' : ''}</span>
      </button>
      <MiktarGirisi deger={miktar} degisti={setMiktar} hizli={['100', '500', '1k', 'yarı']} onEnter={gonder} />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-soluk">
          <span>Bugün kalan limit</span>
          <span className="sayi"><Muz miktar={g.kalan} boyut={13} /> / {bicim(g.limit)}</span>
        </div>
        <Ilerleme oran={g.limit > 0 ? g.kalan / g.limit : 0} yukseklik={4} renk="var(--color-soluk)" />
      </div>
      <Button tur="ana" tam bekliyor={bekliyor} onClick={gonder}><Send />Gönder</Button>
      <UyeSecici acik={secici} degisti={setSecici} sec={setAlici} baslik="Muz gönder: alıcıyı seç" />
    </Kart>
  );
}
