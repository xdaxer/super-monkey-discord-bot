import {
  Award, Layers, Package, PartyPopper, Shield, TriangleAlert, FlaskConical,
} from 'lucide-react';

import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Gorsel, nadirlikRengi } from '@/components/Gorsel.jsx';
import { Md } from '@/components/Md.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Bos } from '@/components/Durumlar.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ipucu } from '@/components/ui/ipucu.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { git } from '@/lib/store.js';
import { tarih } from '@/lib/utils.js';

export function BorcUyarisi({ borc }) {
  if (!borc) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-kirmizi/40 bg-kirmizi/[0.07] p-4 sm:flex-row sm:items-center">
      <TriangleAlert className="size-6 shrink-0 text-kirmizi" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-kirmizi">{borc.gecikmis ? 'Vadesi geçmiş kredi borcun var' : 'Kredi borcun var'}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-metin/85">
          Kalan: <Muz miktar={borc.kalan} boyut={14} /> · {borc.gecikmis ? 'vadesi geçti' : `vade ${tarih(borc.vade)}`}
        </p>
        {borc.gecikmis && <p className="mt-1 text-xs text-soluk">Ödeyene kadar kumar oynayamaz, muz gönderemez ya da takasa muz koyamazsın.</p>}
      </div>
      <Button tur="tehlike" boyut="sm" onClick={() => git('finans')}>Ödemeye git</Button>
    </div>
  );
}

/** Açılmamış kasa hatırlatması; kasa yoksa hiçbir şey göstermez. */
export function KasaHatirlatma({ adet }) {
  if (!adet) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-muz/30 bg-muz/[0.06] p-4 sm:flex-row sm:items-center">
      <Package className="size-6 shrink-0 text-muz" />
      <p className="min-w-0 flex-1 text-sm">Envanterinde <b>{adet}</b> açılmamış kasa var.</p>
      <Button tur="ana" boyut="sm" onClick={() => git('envanter', { sekme: 'kasalar' })}>Kasaları aç</Button>
    </div>
  );
}

export function RozetKart({ rozetler, bonus = 0 }) {
  return (
    <Kart>
      <KartBaslik
        ikon={Award}
        baslik="Rozetler"
        aciklama={bonus > 0 ? `Çalışma kazancına +%${bonus}` : 'Her rozet çalışma kazancına kalıcı bonus verir'}
        sag={<Rozet>{rozetler.length}</Rozet>}
      />
      {rozetler.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {rozetler.map((r) => (
            <Ipucu key={r.kimlik} metin={`${r.ad} · çalışmaya +%${r.calisBonus}`}>
              <span className="grid size-12 place-items-center rounded-xl border border-cizgi bg-yuzey-3"><Gorsel g={r.gorsel} boyut={32} /></span>
            </Ipucu>
          ))}
          <Button tur="hayalet" boyut="sm" onClick={() => git('magaza', { sekme: 'rozet' })} className="self-center">Daha fazla</Button>
        </div>
      ) : (
        <Bos baslik="Henüz rozetin yok" aciklama="Kırmızı Balon 1.000 muz ve çalışmaya +%2 verir." eylem={<Button boyut="sm" onClick={() => git('magaza', { sekme: 'rozet' })}>Rozetlere bak</Button>} className="py-4" />
      )}
    </Kart>
  );
}

export function TakviyeKart({ o }) {
  const var1 = o.takviyeler.length > 0 || o.seriKoruyucu > 0;
  if (!var1 && o.etkinlikler.length === 0) return null;
  return (
    <Kart className="flex flex-col gap-5">
      {var1 && (
        <div>
          <KartBaslik ikon={FlaskConical} baslik="Etkin takviyeler" className="mb-3" />
          <ul className="flex flex-col divide-y divide-cizgi text-sm">
            {o.takviyeler.map((t) => (
              <li key={t.tur} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2.5"><Gorsel g={t.gorsel} boyut={24} />{t.ad}</span>
                <span className="text-soluk"><GeriSayim hedef={t.bitis} bitince="bitti" className="sayi text-metin" /> kaldı</span>
              </li>
            ))}
            {o.seriKoruyucu > 0 && (
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2.5"><Shield className="size-5 text-mavi" />Seri Koruyucu</span>
                <Rozet tur="mavi">{o.seriKoruyucu} tane</Rozet>
              </li>
            )}
          </ul>
        </div>
      )}
      {o.etkinlikler.length > 0 && (
        <div>
          <KartBaslik ikon={PartyPopper} baslik="Etkinlikler" className="mb-3" />
          <ul className="flex flex-col divide-y divide-cizgi text-sm">
            {o.etkinlikler.map((e) => (
              <li key={e.tur} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium"><Md metin={e.ad} /></span>
                <span className="text-soluk">bitiş <GeriSayim hedef={e.bitis} bitince="bitti" className="sayi text-metin" /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Kart>
  );
}

export function KartlarKart({ profil }) {
  const kartlar = profil.enDegerliKartlar;
  const k = profil.koleksiyon;
  return (
    <Kart>
      <KartBaslik
        ikon={Layers}
        baslik="En değerli kartlar"
        aciklama={`Koleksiyon puanı ${k.puan.toLocaleString('tr-TR')}`}
        sag={<Button tur="hayalet" boyut="sm" onClick={() => git('envanter')}>Envanter</Button>}
      />
      {kartlar.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {kartlar.map((c) => (
            <Ipucu key={c.kimlik} metin={`${c.ad}${c.adet > 1 ? ` ×${c.adet}` : ''}`}>
              <div className="relative flex flex-col items-center gap-2 rounded-xl border bg-yuzey-3/50 px-2 py-3" style={{ borderColor: `color-mix(in oklab, ${nadirlikRengi(c.nadirlik)} 55%, transparent)` }}>
                <Gorsel g={c.gorsel} boyut={44} />
                <span className="w-full truncate text-center text-xs text-soluk">{c.ad}</span>
                {c.adet > 1 && <span className="sayi absolute right-1.5 top-1 text-[11px] font-semibold text-metin">×{c.adet}</span>}
              </div>
            </Ipucu>
          ))}
        </div>
      ) : <Bos baslik="Henüz kartın yok" aciklama="Kasa açarak koleksiyonuna başla." className="py-4" />}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-cizgi pt-3 text-xs text-soluk">
        {[...k.kademeler].map((d) => (
          <span key={d.nadirlik} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: nadirlikRengi(d.nadirlik) }} />
            {d.ad} <span className="sayi text-metin">{d.sahip}/{d.toplam}</span>
          </span>
        ))}
      </div>
    </Kart>
  );
}
