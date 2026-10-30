import {
  Flame, Landmark, Layers, ShieldCheck, Star, Trophy,
} from 'lucide-react';
import { motion } from 'motion/react';

import { Avatar } from '@/components/Avatar.jsx';
import { Istatistik } from '@/components/Bolum.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { useUygulama, git } from '@/lib/store.js';
import { bicim, carpanMetni } from '@/lib/utils.js';

function Halka({ oran, renk, boyut = 104, children }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const o = Math.max(0, Math.min(1, oran));
  return (
    <div className="relative shrink-0" style={{ width: boyut, height: boyut }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="5" className="stroke-yuzey-3" />
        <motion.circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
          style={{ stroke: renk, strokeDasharray: c }}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - o) }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Üst "kahraman" alanı: avatar + seviye halkası, ad, canlı bakiye, kısa istatistikler. */
export function Kahraman({ o }) {
  const canli = useUygulama((s) => s.bakiye);
  const p = o.profil;
  const renk = p.kademe?.renk ?? 'var(--color-muz)';
  const oran = p.sonraki > 0 ? p.suAnki / p.sonraki : 0;
  const kim = o.kullanici;

  return (
    <section
      className="yuzey-kart relative overflow-hidden p-5 sm:p-6"
      style={{ backgroundImage: `radial-gradient(520px 200px at 0% 0%, color-mix(in oklab, ${renk} 14%, transparent), transparent 70%)` }}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative">
            <Halka oran={oran} renk={renk}>
              <Avatar uye={kim} boyut={80} />
            </Halka>
            <span className="sayi absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-cizgi-guclu bg-yuzey-3 px-2 py-0.5 text-xs font-semibold">
              Sv {p.seviye}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-2xl font-bold leading-tight">{kim?.ad}</h2>
              {o.prestij.seviye > 0 && (
                <span className="flex shrink-0 items-center gap-0.5 text-muz" title="Prestij" aria-label={`Prestij ${o.prestij.seviye}`}>
                  <Star className="size-4 fill-current" /><span className="sayi text-sm font-semibold">{o.prestij.seviye}</span>
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-medium" style={{ color: renk }}>{p.kademe?.ad ?? 'Seviye rolü yok'}</p>
            <p className="sayi mt-1 text-xs text-soluk">{bicim(p.suAnki)} / {bicim(p.sonraki)} XP</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {o.prestij.seviye > 0 && <Rozet tur="muz"><Star />Prestij {carpanMetni(o.prestij.carpan)}</Rozet>}
              {o.uyelik && <Rozet tur="mor">{o.uyelik.ad} +%{o.uyelik.yuzde}</Rozet>}
              {o.yonetici && <Rozet tur="mavi"><ShieldCheck />Yönetici {carpanMetni(o.yonetici.carpan)}</Rozet>}
            </div>
          </div>
        </div>
        <div className="md:text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-silik">Bakiye</p>
          <Muz miktar={canli ?? o.bakiye} canli boyut={38} className="text-4xl font-bold text-muz sm:text-5xl" />
        </div>
      </div>
      {/* Seviye ilerlemesi avatar halkasında ve XP satırında; ayrıca çubuk yok. */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Istatistik etiket="Zenginlik" ikon={Trophy} deger={o.sira ? `#${o.sira}` : '—'} alt={p.xpSirasi ? `XP'de #${p.xpSirasi}` : undefined} onClick={() => git('siralama')} />
        <Istatistik etiket="Günlük seri" ikon={Flame} deger={`${o.seri} gün`} />
        <Istatistik etiket="Bankada" ikon={Landmark} deger={o.bankada > 0 ? <Muz miktar={o.bankada} boyut={16} /> : '—'} onClick={() => git('finans')} />
        <Istatistik etiket="Koleksiyon" ikon={Layers} deger={`${p.koleksiyon.farkli}/${p.koleksiyon.toplam}`} onClick={() => git('envanter')} />
      </div>
    </section>
  );
}
