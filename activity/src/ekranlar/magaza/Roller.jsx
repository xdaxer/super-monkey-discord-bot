import { Check, ShieldCheck } from 'lucide-react';

import { Bos } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ipucu } from '@/components/ui/ipucu.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { alimBildirimi } from './bildirim.jsx';

function RolSatiri({ r, yenile, onSon }) {
  const [calistir, bekliyor] = useIslem();
  const bakiye = useUygulama((s) => s.bakiye);
  const yetmez = bakiye !== null && r.fiyat > bakiye;
  const al = () => calistir(async () => {
    const s = await api('/api/magaza/rol', { govde: { rolId: r.rolId } });
    const metin = `**${s.rol.ad}** rolünü aldın.`;
    alimBildirimi(metin, false);
    onSon({ metin, kasa: false });
    await yenile({ sessiz: true });
  });
  const kapali = !r.verilebilir || yetmez;
  const dugme = (
    <Button tur="ana" boyut="sm" bekliyor={bekliyor} disabled={kapali} onClick={al}>
      {yetmez && r.verilebilir ? 'Bakiye yetersiz' : 'Satın al'}
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="size-3 shrink-0 rounded-full ring-2 ring-cizgi-guclu" style={{ background: r.renk ?? 'var(--color-silik)' }} />
        <span className="truncate font-medium" style={{ color: r.renk ?? undefined }}>{r.ad ?? `Rol ${r.rolId.slice(-4)}`}</span>
        {r.sahip && <Rozet tur="yesil"><Check />Sende</Rozet>}
      </div>
      {!r.sahip && (
        <div className="flex items-center gap-4">
          <Muz miktar={r.fiyat} className="text-base font-semibold" />
          {!r.verilebilir
            ? <Ipucu metin="Bu rol şu an verilemiyor; bir yöneticiye haber ver."><span>{dugme}</span></Ipucu>
            : dugme}
        </div>
      )}
    </div>
  );
}

export function Roller({ veri, yenile, onSon }) {
  if (veri.roller.length === 0) {
    return <div className="yuzey-kart"><Bos ikon={ShieldCheck} baslik="Satışta rol yok" aciklama="Yöneticiler /magaza ekle ile rol koyabilir." /></div>;
  }
  return (
    <div className="yuzey-kart divide-y divide-cizgi overflow-hidden">
      {veri.roller.map((r) => <RolSatiri key={r.rolId} r={r} yenile={yenile} onSon={onSon} />)}
    </div>
  );
}
