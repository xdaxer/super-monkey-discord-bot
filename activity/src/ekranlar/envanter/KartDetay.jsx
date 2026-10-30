import { nadirlikRengi } from '../magaza/nadirlikRenk.js';
import {
  ChevronRight, Combine, Gift, Handshake, Sparkles,
} from 'lucide-react';
import { useState } from 'react';

import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { git, nadirlik as nadirlikBul, nesne } from '@/lib/store.js';
import { bicim, cn } from '@/lib/utils.js';
import { AdetSecici } from '../magaza/AdetSecici.jsx';

const parlakKimlik = (k) => `parlak:${k}`;

/** Kart detay penceresi: sat, birleştir, hediye et. */
export function KartDetay({
  kart, veri, yenile, kapat, birlestirSonucu,
}) {
  const n = veri.kartlar[kart.kimlik] ?? 0;
  const p = veri.kartlar[parlakKimlik(kart.kimlik)] ?? 0;
  const [secim, setSecim] = useState('normal');
  const surum = (secim === 'parlak' && p > 0) || n === 0 ? 'parlak' : 'normal';
  const parlak = surum === 'parlak';
  const kimlik = parlak ? parlakKimlik(kart.kimlik) : kart.kimlik;
  const sahip = parlak ? p : n;
  const deger = nesne(kimlik)?.deger ?? kart.deger ?? 0;
  const nad = nadirlikBul(kart.nadirlik);
  const renk = nadirlikRengi(kart.nadirlik);

  const [satAdet, setSatAdet] = useState(1);
  const [bAdet, setBAdet] = useState(1);
  const [hAdet, setHAdet] = useState(1);
  const [uyeAcik, setUyeAcik] = useState(false);
  const [calistir, bekliyor] = useIslem();

  const kez = parlak ? 0 : (veri.birlestirme.kartlar[kart.kimlik]?.kez ?? 0);
  const bMax = Math.max(1, Math.min(kez, veri.birlestirme.sinir));
  const ust = veri.birlestirme.kartlar[kart.kimlik]?.ust;
  const ustAd = ust ? nadirlikBul(ust)?.ad : null;
  const hMax = Math.max(1, Math.min(sahip, veri.hediye.kalan));
  const sa = Math.min(satAdet, sahip);

  const sonra = async () => {
    const v = await yenile({ sessiz: true });
    if (v && (v.kartlar[kart.kimlik] ?? 0) + (v.kartlar[parlakKimlik(kart.kimlik)] ?? 0) === 0) kapat();
  };

  const sat = (tumu) => calistir(async () => {
    if (tumu && !await onayIste({
      baslik: 'Hepsini sat',
      metin: `**${sahip} × ${kart.ad}** satılacak: **+${bicim(deger * sahip)} muz**.\nSon kopya da gider.`,
      evet: 'Sat',
      tehlikeli: true,
    })) return;
    const r = await api('/api/envanter/sat', { govde: tumu ? { kimlik, tumu: true } : { kimlik, adet: sa } });
    bildirimGoster(`${r.adet} × **${r.kart.ad}** satıldı: **+${bicim(r.tutar)}** muz`, 'basari');
    setSatAdet(1);
    await sonra();
  });

  const birlestir = () => calistir(async () => {
    const r = await api('/api/envanter/birlestir', { govde: { kimlik: kart.kimlik, adet: bAdet } });
    await sonra();
    birlestirSonucu(r);
  });

  const hediye = (uye) => calistir(async () => {
    if (!await onayIste({ baslik: 'Hediye et', metin: `**${uye.ad}** üyesine ${hAdet} × **${kart.ad}** hediye edilecek.`, evet: 'Hediye et' })) return;
    const r = await api('/api/envanter/hediye', { govde: { aliciId: uye.id, kimlik, adet: hAdet } });
    bildirimGoster(`**${r.alici.ad}** üyesine ${r.adet} × **${r.nesne.ad}** hediye edildi. Bugün ${r.kalanHak} hakkın kaldı.`, 'basari');
    setHAdet(1);
    await sonra();
  });

  const bolum = 'flex flex-col gap-2 rounded-xl border border-cizgi bg-zemin/40 p-3.5';
  const etiket = 'text-xs font-medium uppercase tracking-wide text-silik';

  return (
    <Pencere acik degisti={(a) => { if (!a) kapat(); }} baslik={kart.ad}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div
            className="grid size-28 shrink-0 place-items-center rounded-2xl border"
            style={{ borderColor: renk, background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, ${renk} 22%, transparent), transparent 70%)` }}
          >
            <Gorsel g={nesne(kimlik)?.gorsel ?? nesne(kart.kimlik)?.gorsel} boyut={72} parlak={parlak} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold" style={{ color: renk }}>{nad?.ad}</span>
            <div className="flex items-center gap-2 text-sm text-soluk">Değer <Muz miktar={deger} boyut={16} className="text-metin" /></div>
            <div className="text-sm text-soluk">Sende: <span className="sayi text-metin">{n}</span>{p > 0 && <> · <span className="sayi text-muz">{p}</span> parlak</>}</div>
          </div>
        </div>

        {n > 0 && p > 0 && (
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-cizgi bg-yuzey p-1">
            {[['normal', 'Normal', n], ['parlak', 'Parlak', p]].map(([d, ad, a]) => (
              <button
                key={d}
                type="button"
                onClick={() => setSecim(d)}
                className={cn('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors', surum === d ? 'bg-yuzey-3 text-metin' : 'text-soluk hover:text-metin')}
              >
                {d === 'parlak' && <Sparkles className="size-3.5 text-muz" />}{ad} <span className="sayi">×{a}</span>
              </button>
            ))}
          </div>
        )}

        <div className={bolum}>
          <span className={etiket}>Sat</span>
          <div className="flex flex-wrap items-center gap-2">
            <AdetSecici deger={sa} degisti={setSatAdet} max={sahip} />
            <Button tur="ikincil" bekliyor={bekliyor} onClick={() => sat(false)}>Sat <Muz miktar={deger * sa} isaretli boyut={14} className="text-sm" /></Button>
            {sahip > 1 && <Button tur="hayalet" className="text-kirmizi hover:text-kirmizi" bekliyor={bekliyor} onClick={() => sat(true)}>Hepsini sat ({sahip})</Button>}
          </div>
          <button
            type="button"
            onClick={() => { kapat(); git('pazar', { kart: kimlik }); }}
            className="-mx-1 mt-1 flex items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm text-soluk transition-colors hover:text-metin"
          >
            <Handshake aria-hidden className="size-4 text-muz" />
            <span className="flex-1">Topluluk pazarında fiyatlara bak ya da üyelere sat</span>
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>

        {kez > 0 && (
          <div className={bolum}>
            <span className={etiket}>Birleştir</span>
            <p className="text-xs text-soluk"><span className="sayi">{veri.birlestirme.adet}</span> kopya → 1 kart{ustAd ? `, ${ustAd} nadirlik` : ', bir üst nadirlik'}</p>
            <div className="flex flex-wrap items-center gap-2">
              <AdetSecici deger={Math.min(bAdet, bMax)} degisti={setBAdet} max={bMax} />
              <Button tur="ikincil" bekliyor={bekliyor} onClick={birlestir}><Combine />Birleştir</Button>
            </div>
          </div>
        )}

        <div className={bolum}>
          <div className="flex items-center justify-between">
            <span className={etiket}>Hediye et</span>
            <span className="text-xs text-soluk">Bugün <span className="sayi">{veri.hediye.kalan}/{veri.hediye.gunluk}</span> hak</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdetSecici deger={Math.min(hAdet, hMax)} degisti={setHAdet} max={hMax} />
            <Button tur="ikincil" disabled={veri.hediye.kalan < 1} bekliyor={bekliyor} onClick={() => setUyeAcik(true)}><Gift />Üye seç</Button>
          </div>
        </div>
      </div>
      <UyeSecici acik={uyeAcik} degisti={setUyeAcik} sec={hediye} baslik="Hediye kime?" />
    </Pencere>
  );
}
