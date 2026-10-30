import { TicketPercent } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button.jsx';
import { Giris } from '@/components/ui/giris.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { konfetiPatlat } from '@/ekranlar/prestij/konfeti.js';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { zaferSesi } from '@/lib/ses.js';
import { bicim } from '@/lib/utils.js';

/** Promosyon kodu: yayında ya da duyuruda dağıtılan kodu girip muz al (app/lib/promo.js). */
export function PromoKart({ yenile }) {
  const [kod, setKod] = useState('');
  const [calistir, bekliyor] = useIslem();

  const kullan = (e) => {
    e.preventDefault();
    if (!kod.trim()) return undefined;
    return calistir(async () => {
      const r = await api('/api/promo', { govde: { kod: kod.trim() } });
      setKod('');
      zaferSesi();
      konfetiPatlat(true);
      bildirimGoster(`**${r.kod}** kodu sana **${bicim(r.odul)}** muz kazandırdı.`, 'basari');
      yenile();
    });
  };

  return (
    <Kart>
      <KartBaslik ikon={TicketPercent} baslik="Promosyon kodu" aciklama="Yayınlarda ve duyurularda dağıtılan kodu gir" />
      <form onSubmit={kullan} className="flex gap-2">
        <Giris
          value={kod}
          onChange={(e) => setKod(e.target.value.toUpperCase())}
          placeholder="KOD"
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          className="sayi flex-1 uppercase tracking-widest"
        />
        <Button type="submit" tur="ana" bekliyor={bekliyor} disabled={!kod.trim()}>Kullan</Button>
      </form>
    </Kart>
  );
}
