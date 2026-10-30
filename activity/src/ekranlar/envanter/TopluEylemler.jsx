import { nadirlikRengi } from '../magaza/nadirlikRenk.js';
import { Combine, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';

import { onayIste } from '@/components/Onay.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { bicim } from '@/lib/utils.js';

function ToptanPenceresi({ veri, acik, degisti, sat }) {
  const nadirlikler = useUygulama((s) => s.katalog?.nadirlikler) ?? [];
  const [calistir, bekliyor] = useIslem();
  const secenekler = [
    { nadirlik: null, ad: 'Bütün kartlar', o: veri.toptan.hepsi, renk: 'var(--color-metin)' },
    ...[...nadirlikler].reverse().map((n) => ({ nadirlik: n.kimlik, ad: `Bütün ${n.ad} kartlar`, o: veri.toptan.nadirlikler[n.kimlik], renk: nadirlikRengi(n.kimlik) })),
  ];
  return (
    <Pencere acik={acik} degisti={degisti} baslik="Toptan sat" aciklama="Her karttan son kopya da gider ve koleksiyonundan silinir.">
      <div className="flex flex-col gap-2">
        {secenekler.map((s) => (
          <div key={s.nadirlik ?? 'hepsi'} className="flex items-center justify-between gap-3 rounded-xl border border-cizgi bg-zemin/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium" style={{ color: s.renk }}>{s.ad}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-soluk"><span className="sayi">{s.o.adet} kart</span><Muz miktar={s.o.tutar} boyut={14} className="text-xs" /></div>
            </div>
            <Button tur="tehlike" boyut="sm" bekliyor={bekliyor} disabled={s.o.adet === 0} onClick={() => calistir(async () => { if (await sat(s)) degisti(false); })}>Sat</Button>
          </div>
        ))}
      </div>
    </Pencere>
  );
}

/** Kartlar sekmesi üstündeki toplu eylemler. `birlestirSonucu(r)` birleştirme sonucunu gösterir. */
export function TopluEylemler({ veri, yenile, birlestirSonucu }) {
  const [toptan, setToptan] = useState(false);
  const [calistir, bekliyor] = useIslem();
  const bir = veri.birlestirme;

  const kopyalar = () => calistir(async () => {
    if (!await onayIste({ baslik: 'Kopyaları sat', metin: `**${veri.kopyalar.adet} kopya** satılacak: **+${bicim(veri.kopyalar.tutar)} muz**.\nHer karttan biri kalır.`, evet: 'Sat' })) return;
    const r = await api('/api/envanter/kopyalari-sat', { govde: {} });
    bildirimGoster(`${r.adet} kopya satıldı: **+${bicim(r.tutar)}** muz`, 'basari');
    await yenile({ sessiz: true });
  });
  const birlestir = () => calistir(async () => {
    if (!await onayIste({ baslik: 'Birleştir', metin: `**${bir.harcanan} kopya** → **${bir.birlestirme} kart** (bir üst nadirlik, rastgele).\nHer karttan 1 kopya kalır.`, evet: 'Birleştir' })) return;
    const r = await api('/api/envanter/birlestir', { govde: { kimlik: 'hepsi' } });
    await yenile({ sessiz: true });
    birlestirSonucu(r);
  });
  const toptanSat = async (s) => {
    if (!await onayIste({ baslik: 'Emin misin?', metin: `**${s.o.adet} kart** satılacak: **+${bicim(s.o.tutar)} muz**.\nKoleksiyonundan silinir; bu geri alınamaz.`, evet: 'Evet, sat', tehlikeli: true })) return false;
    const r = await api('/api/envanter/toptan-sat', { govde: { nadirlik: s.nadirlik } });
    bildirimGoster(`${r.adet} kart satıldı: **+${bicim(r.tutar)}** muz`, 'basari');
    await yenile({ sessiz: true });
    return true;
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button tur="ikincil" bekliyor={bekliyor} disabled={veri.kopyalar.adet === 0} onClick={kopyalar}><Copy />Kopyaları sat ({veri.kopyalar.adet})</Button>
      <Button tur="ikincil" bekliyor={bekliyor} disabled={bir.birlestirme === 0} onClick={birlestir}><Combine />Uygun kopyaları birleştir ({bir.birlestirme})</Button>
      <Button tur="cizgili" className="border-kirmizi/40 text-kirmizi hover:bg-kirmizi/10" disabled={veri.toptan.hepsi.adet === 0} onClick={() => setToptan(true)}><Trash2 />Toptan sat</Button>
      <ToptanPenceresi veri={veri} acik={toptan} degisti={setToptan} sat={toptanSat} />
    </div>
  );
}
