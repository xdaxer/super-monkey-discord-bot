import { Fragment } from 'react';

import { EmojiIkon, emojiliMetin } from '@/lib/emoji.jsx';
import { tarih } from '@/lib/utils.js';

/**
 * lib metinleri için Discord markdown'ının küçük bir alt kümesi: **kalın**,
 * *eğik*, ~~çizik~~, `kod`, satır sonu, `-# küçük`, özel emoji <:ad:id>,
 * <t:sn:R> zaman. Unicode emojiler ikona döner (lib/emoji.jsx). HTML hiçbir
 * zaman yorumlanmaz.
 */
const DESEN = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|<a?:\w+:\d+>|<t:\d+(?::\w)?>|<@&?\d+>|\*[^*\s][^*]*\*)/g;

function satir(s, anahtar) {
  return s.split(DESEN).filter(Boolean).map((p, i) => {
    const k = `${anahtar}-${i}`;
    // Kalın/çizik içinde emoji ve zaman da olabilir (sıralama "**44.722 <:muz:id>**" gönderir).
    if (p.startsWith('**')) return <strong key={k} className="font-semibold text-metin">{satir(p.slice(2, -2), k)}</strong>;
    if (p.startsWith('~~')) return <s key={k} className="text-silik">{satir(p.slice(2, -2), k)}</s>;
    if (p.startsWith('`')) return <code key={k} className="rounded bg-yuzey-3 px-1 py-px font-mono text-[0.88em] text-muz-acik">{p.slice(1, -1)}</code>;
    const emoji = /^<(a?):(\w+):(\d+)>$/.exec(p);
    // Para simgesi (uygulama emojisi "muz") arayüzde ikon; diğer özel emojiler (kart portreleri) resim.
    if (emoji?.[2] === 'muz') return <EmojiIkon key={k} emoji="🍌" boyut="1.1em" className="mx-[0.08em] align-[-0.2em]" />;
    if (emoji) return <img key={k} src={`/api/emoji/${emoji[3]}${emoji[1] ? '?a=1' : ''}`} alt="" className="inline-block size-[1.15em] align-[-0.2em]" />;
    if (p.startsWith('<t:')) return <span key={k}>{tarih(Number(/<t:(\d+)/.exec(p)[1]) * 1000)}</span>;
    if (p.startsWith('<@')) return <span key={k} className="text-mavi">@üye</span>;
    if (p.startsWith('*') && p.length > 2) return <em key={k}>{emojiliMetin(p.slice(1, -1), k)}</em>;
    return <Fragment key={k}>{emojiliMetin(p, k)}</Fragment>;
  });
}

export function Md({ metin, className }) {
  const satirlar = String(metin ?? '').split('\n');
  return (
    <span className={className}>
      {satirlar.map((s, i) => {
        const kucuk = s.startsWith('-# ');
        const icerik = satir(kucuk ? s.slice(3) : s, i);
        return (
          <Fragment key={i}>
            {kucuk ? <small className="text-xs text-silik">{icerik}</small> : icerik}
            {i < satirlar.length - 1 && <br />}
          </Fragment>
        );
      })}
    </span>
  );
}
