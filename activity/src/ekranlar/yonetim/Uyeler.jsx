import {
  CircleMinus, CirclePlus, History, RotateCcw, UserRound, UserSearch,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Giris } from '@/components/ui/giris.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { bicim, tarih } from '@/lib/utils.js';

const HIZLI = ['100', '1k', '10k', '100k'];

function Bilgi({ etiket, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-silik">{etiket}</span>
      <span className="truncate font-display text-lg font-semibold">{children}</span>
    </div>
  );
}

function Hareketler({ liste }) {
  if (liste.length === 0) return <Bos ikon={History} baslik="Hareket yok" aciklama="Bu üyenin defterde kaydı bulunmuyor." className="py-6" />;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cizgi text-left text-xs uppercase tracking-wide text-silik">
              <th className="py-2 pr-3 font-medium">Zaman</th>
              <th className="py-2 pr-3 font-medium">Tür</th>
              <th className="py-2 pr-3 text-right font-medium">Miktar</th>
              <th className="py-2 pr-3 text-right font-medium">Bakiye sonrası</th>
              <th className="py-2 font-medium">Karşı taraf</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cizgi">
            {liste.map((h, i) => (
              <tr key={`${h.zaman}-${i}`}>
                <td className="sayi py-2.5 pr-3 text-soluk">{tarih(h.zaman)}</td>
                <td className="py-2.5 pr-3"><Rozet>{h.tur}</Rozet></td>
                <td className="py-2.5 pr-3 text-right"><Muz miktar={h.miktar} isaretli /></td>
                <td className="py-2.5 pr-3 text-right"><Muz miktar={h.bakiyeSonra} /></td>
                <td className="py-2.5 text-soluk">{h.karsi ? h.karsi.ad : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {liste.map((h, i) => (
          <li key={`${h.zaman}-${i}`} className="flex flex-col gap-1.5 rounded-xl border border-cizgi bg-zemin/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <Rozet>{h.tur}</Rozet>
              <span className="sayi text-xs text-silik">{tarih(h.zaman)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <Muz miktar={h.miktar} isaretli />
              <span className="flex items-center gap-1.5 text-xs text-soluk">sonra <Muz miktar={h.bakiyeSonra} boyut={14} className="text-soluk" /></span>
            </div>
            {h.karsi && <span className="text-xs text-silik">Karşı: {h.karsi.ad}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Uyeler() {
  const kendim = useUygulama((s) => s.kullanici);
  const [secici, setSecici] = useState(false);
  const [secili, setSecili] = useState(null);
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState(null);
  const [miktar, setMiktar] = useState('');
  const [calistir, bekliyor] = useIslem();

  const yukle = useCallback(async (id) => {
    try {
      setVeri(await api(`/api/yonetim/uye/${id}`));
      setHata(null);
    } catch (e) {
      setHata(e);
    }
  }, []);

  useEffect(() => {
    setVeri(null);
    if (secili) yukle(secili.id);
  }, [secili, yukle]);

  const uygula = (islem) => calistir(async () => {
    if (islem === 'sifirla') {
      const tamam = await onayIste({
        baslik: 'Bakiye sıfırlansın mı?',
        metin: `**${secili.ad}** üyesinin tüm muzu silinecek. Bu işlem geri alınamaz; deftere kaydedilir.`,
        evet: 'Sıfırla',
        tehlikeli: true,
      });
      if (!tamam) return;
    }
    const r = await api('/api/yonetim/muz', { govde: { uyeId: secili.id, islem, miktar } });
    bildirimGoster(r.mesaj, 'basari');
    if (islem !== 'sifirla') setMiktar('');
    await yukle(secili.id);
  });

  const u = veri?.uye;
  const gecerli = miktar.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <Kart>
        <KartBaslik ikon={UserSearch} baslik="Üye seç" aciklama="Bakiyesini yönetmek ya da hareketlerini incelemek istediğin üyeyi bul." />
        <div className="flex flex-wrap gap-2">
          <Button tur="ana" onClick={() => setSecici(true)}><UserSearch />Üye ara</Button>
          {kendim && <Button tur="ikincil" onClick={() => setSecili(kendim)}><UserRound />Ben</Button>}
        </div>
        <UyeSecici acik={secici} degisti={setSecici} sec={setSecili} />
      </Kart>

      {!secili && <Bos ikon={UserRound} baslik="Üye seçilmedi" aciklama="Seçtiğin üyenin özeti ve son hareketleri burada görünür." />}
      {secili && hata && <HataKutusu hata={hata} tekrar={() => yukle(secili.id)} />}
      {secili && !hata && !veri && <div className="grid gap-4 md:grid-cols-2"><Iskelet className="h-44" /><Iskelet className="h-44" /></div>}

      {u && (
        <>
          <div className="grid gap-4 md:grid-cols-5 [&>*]:min-w-0">
            <Kart className="md:col-span-3">
              <div className="mb-4 flex items-center gap-3">
                <Avatar uye={u} boyut={48} />
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">{u.ad}</h3>
                  <p className="text-xs text-silik">{u.sira ? `Zenginlik sırası ${u.sira}.` : 'Sıralamada değil'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Bilgi etiket="Bakiye"><Muz miktar={u.bakiye} /></Bilgi>
                <Bilgi etiket="Seviye"><span className="sayi">{bicim(u.seviye)}</span></Bilgi>
                <Bilgi etiket="Bankada"><Muz miktar={u.bankada} /></Bilgi>
                <Bilgi etiket="Borç">{u.borc > 0 ? <Muz miktar={u.borc} className="text-kirmizi" /> : <span className="text-soluk">Yok</span>}</Bilgi>
              </div>
            </Kart>

            <Kart className="md:col-span-2">
              <KartBaslik baslik="Muz işlemi" aciklama="Kimseden kesilmez; deftere senin adınla yazılır." />
              <div className="flex flex-col gap-3">
                <Giris value={miktar} onChange={(e) => setMiktar(e.target.value)} placeholder="Miktar: 500, 2.5k, yarı, hepsi" maxLength={20} className="sayi" />
                <div className="flex flex-wrap gap-1.5">
                  {HIZLI.map((h) => (
                    <button key={h} type="button" onClick={() => setMiktar(h)} className="rounded-lg border border-cizgi px-2.5 py-1 text-xs font-medium text-soluk transition-colors hover:border-cizgi-guclu hover:text-metin">{h}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button tur="ana" bekliyor={bekliyor} disabled={!gecerli} onClick={() => uygula('ver')}><CirclePlus />Ver</Button>
                  <Button tur="ikincil" bekliyor={bekliyor} disabled={!gecerli} onClick={() => uygula('al')}><CircleMinus />Al</Button>
                </div>
                <Button tur="hayalet" boyut="sm" className="text-kirmizi hover:text-kirmizi" bekliyor={bekliyor} onClick={() => uygula('sifirla')}><RotateCcw />Bakiyeyi sıfırla</Button>
              </div>
            </Kart>
          </div>

          <Kart>
            <KartBaslik ikon={History} baslik="Son hareketler" aciklama="Defterdeki en yeni 15 kayıt." />
            <Hareketler liste={veri.hareketler} />
          </Kart>
        </>
      )}
    </div>
  );
}
