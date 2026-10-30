/**
 * Mağaza, kasa, envanter ve set rotaları. Slash komutlarla (magaza.js, kasa.js,
 * envanter.js) aynı lib fonksiyonlarını aynı sırada ve denetimlerle çağırır;
 * kural burada değil lib/'tedir.
 */

import { ANIMASYON_PAYI_MS } from '../../lib/akis.js';
import { ayarGetir } from '../../lib/ayarlar.js';
import {
  BIRLESTIRME_ADEDI, BIRLESTIRME_SINIRI, birlestir as birlestirKartlar, birlestirilebilirAdet, birlestirilebilirMi,
  toptanBirlestir, toptanBirlestirOnizleme, ustNadirlik,
} from '../../lib/birlestirme.js';
import {
  bakiye, SERI_KORUYUCU, trGunBaslangici,
} from '../../lib/ekonomi.js';
import {
  adet as esyaAdedi, envanter as envanterOku, etkinEtkiler, hareketToplami, serbestEnvanter,
} from '../../lib/envanter.js';
import { puanSatiri } from '../../lib/envanter-gorunum.js';
import {
  alinabilirMi, esyaGetir, esyaSatinAl, KASA_ALIM_SINIRI, KATEGORI_ADLARI, ozelRolGetir, RENK_DEGISIM, RENK_FIYAT,
  renkAyristir, renkMetni, renkSatinAl, rozetler, satilikEsyalar,
} from '../../lib/esyalar.js';
import { etkinlikFiyati } from '../../lib/etkinlik.js';
import { kasaOlaylari } from '../../lib/gorev-bilesen.js';
import {
  COKLU_ACMA, garantiDurumu, HEDIYE_GUNLUK, hediyeEt, KARTLAR, kartDegeri, kartGetir, kartMi, kartSat, KASA_ICERIKLERI,
  KASA_KIMLIKLERI, kasaAc, koleksiyon, kopyalariSat, NADIRLIK_SIRASI, NADIRLIKLER, PARLAK_CARPANI, PARLAK_SANS,
  sonucNadirligi, toptanOnizleme, toptanSat,
} from '../../lib/kasalar.js';
import {
  rolSatilabilirMi, satinAl, urunGetir, urunler,
} from '../../lib/magaza.js';
import { rozetRoluVer } from '../../lib/rozet-rol.js';
import { setDurumlari, setOduluAl } from '../../lib/setler.js';
import { uyeOzeti } from '../gorsel.js';
import {
  basarili, hata, kimlikMi, metin, tamSayi,
} from '../yardimci.js';

/** Şeritte dönen öğe sayısı; ödül sondan bu kadar önce durur (ön yüz yerleştirir). */
const SERIT_UZUNLUGU = 44;

const ROL_SEBEBI = 'Muz mağazasından satın alındı';

const renkHex = (sayi) => (typeof sayi === 'number' && sayi > 0 ? renkMetni(sayi) : null);

/** Eşya/kart ortak özeti. */
function nesneOzeti(b, nesne) {
  return { kimlik: nesne.kimlik, ad: nesne.ad, gorsel: b.gorsel(nesne) };
}

/** Rozet rolünü verir (rol yoksa/verilemezse null); hata atmaz. */
async function rozetRolu(b, kimlik, sebep) {
  const uye = await b.uye();
  const rolId = await rozetRoluVer(uye, kimlik, (a) => ayarGetir(b.db, b.guildId, a), sebep);
  if (!rolId) return null;
  return { id: rolId, ad: b.guild?.roles?.cache?.get(rolId)?.name ?? null };
}

/** Mağaza satırı: fiyat, indirim, sahip olunan adet/rozet, takviye bitişi ve şu an alınamıyorsa sebebi. */
function esyaSatiri(b, esya) {
  const { fiyat, eski, indirimli } = etkinlikFiyati(b.db, b.guildId, esya);
  const uygun = alinabilirMi(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, esya });
  const sahip = esyaAdedi(b.db, b.guildId, b.kullaniciId, esya.kimlik);
  const bitis = esya.tur === 'etki' ? (etkinEtkiler(b.db, b.guildId, b.kullaniciId)[esya.kimlik] ?? null) : null;
  return {
    ...nesneOzeti(b, esya),
    tur: esya.tur,
    aciklama: esya.aciklama,
    fiyat,
    eski,
    indirimli,
    sahip,
    rozetVar: esya.tur === 'rozet' ? sahip > 0 : undefined,
    calisBonus: esya.calisBonus ?? null,
    bitis,
    alinamaz: uygun.ok ? null : uygun.sebep,
  };
}

async function magazaRolleri(b) {
  const uye = await b.uye();
  return urunler(b.db, b.guildId).map((u) => {
    const rol = b.guild?.roles?.cache?.get(u.rol_id) ?? null;
    return {
      rolId: u.rol_id,
      ad: rol?.name ?? null,
      renk: renkHex(rol?.color),
      fiyat: u.fiyat,
      sahip: Boolean(uye?.roles?.cache?.has(u.rol_id)),
      // Rol sunucudan silinmiş ya da bot veremiyor: ön yüz düğmeyi kapatır.
      verilebilir: rol ? rolSatilabilirMi(rol, b.guild?.members?.me?.roles?.highest?.position ?? 0).ok : false,
    };
  });
}

function icerikSatiri(b, o, toplam) {
  const satir = { yuzde: (o.agirlik / toplam) * 100, tur: o.tur };
  if (o.tur === 'muz') return { ...satir, min: o.min, max: o.max };
  if (o.tur === 'kart') {
    const n = NADIRLIKLER[o.nadirlik];
    return { ...satir, nadirlik: o.nadirlik, nadirlikAd: n.ad, simge: n.simge, deger: n.deger };
  }
  return { ...satir, ...nesneOzeti(b, esyaGetir(o.kimlik)), tur: o.tur };
}

/** Kasa içeriğinden ağırlığa göre rastgele bir öğe. */
function agirlikliOge(icerik, toplam) {
  let kalan = Math.random() * toplam;
  for (const o of icerik) {
    kalan -= o.agirlik;
    if (kalan < 0) return o;
  }
  return icerik[icerik.length - 1];
}

/**
 * Animasyon şeridi: kasanın içeriğinden rastgele görsel öğeler (kasa-bilesen.js
 * seritOgesi mantığı). Muz → para simgesi, kart → o nadirlikten rastgele kart,
 * eşya/kasa → kendi kimliği. Gerçek ödül ön yüzde şeride yerleştirilir.
 */
function seritUret(kasa) {
  const icerik = KASA_ICERIKLERI[kasa];
  const toplam = icerik.reduce((t, o) => t + o.agirlik, 0);
  return Array.from({ length: SERIT_UZUNLUGU }, () => {
    const o = agirlikliOge(icerik, toplam);
    if (o.tur === 'muz') return { tur: 'para', nadirlik: sonucNadirligi({ tur: 'muz', miktar: (o.min + o.max) / 2 }) };
    if (o.tur === 'kart') {
      const havuz = KARTLAR.filter((k) => k.nadirlik === o.nadirlik);
      return { tur: 'kart', kimlik: havuz[Math.floor(Math.random() * havuz.length)].kimlik, nadirlik: o.nadirlik };
    }
    return { tur: 'esya', kimlik: o.kimlik, nadirlik: sonucNadirligi({ tur: o.tur, kimlik: o.kimlik }) };
  });
}

/** Garanti durumu (kasa garantisizse null): kaç açılış içinde hangi nadirlik kesin. */
function garantiOzeti(g) {
  return g ? {
    nadirlik: g.nadirlik, nadirlikAd: NADIRLIKLER[g.nadirlik].ad, esik: g.esik, kalan: g.kalan,
  } : null;
}

/** Açma sonucunu ön yüze uygun düz nesneye çevirir. */
function sonucOzeti(b, s) {
  const nadirlik = sonucNadirligi(s);
  if (s.tur === 'muz') {
    return {
      tur: 'muz', nadirlik, miktar: s.miktar, yerine: s.yerine ? { kimlik: s.yerine, ad: esyaGetir(s.yerine).ad } : null,
    };
  }
  const nesne = s.tur === 'kart' ? kartGetir(s.kimlik) : esyaGetir(s.kimlik);
  return {
    tur: s.tur,
    nadirlik,
    ...nesneOzeti(b, nesne),
    adet: s.adet ?? null,
    bitis: s.bitis ?? null,
    yeniKart: Boolean(s.yeniKart),
    parlak: Boolean(s.parlak),
    garanti: Boolean(s.garanti),
    rozet: s.tur === 'esya' && nesne.tur === 'rozet',
  };
}

/** Set ödülünün gösterimi: muz + kasalar. */
function odulOzeti(b, odul) {
  return {
    muz: odul.muz,
    kasalar: Object.entries(odul.kasalar).map(([kimlik, adet]) => ({ ...nesneOzeti(b, esyaGetir(kimlik)), adet })),
  };
}

/** Birleştirme sonuçlarını kart başına gruplar (komuttaki birlestirmeSatirlari gibi). */
function birlestirmeGruplari(b, sonuclar) {
  const gruplar = new Map();
  for (const s of sonuclar) {
    const g = gruplar.get(s.kart.kimlik) ?? {
      ...nesneOzeti(b, s.kart), nadirlik: s.kart.nadirlik, adet: 0, yeni: false,
    };
    g.adet += 1;
    g.yeni ||= s.yeniKart;
    gruplar.set(s.kart.kimlik, g);
  }
  return [...gruplar.values()];
}

/** Her karttan birini bırakıp kopyaları satmanın önizlemesi (yazmadan). */
function kopyaOnizleme(sahip) {
  let adet = 0;
  let tutar = 0;
  for (const [kimlik, n] of Object.entries(sahip)) {
    const kart = kartGetir(kimlik);
    if (!kart || n < 2) continue;
    adet += n - 1;
    tutar += (n - 1) * kartDegeri(kart);
  }
  return { adet, tutar };
}

export const rotalar = [
  // ── Mağaza ──────────────────────────────────────────────────────────────
  {
    yontem: 'GET',
    yol: '/api/magaza',
    async calistir(b) {
      const satilik = satilikEsyalar();
      const kategoriler = ['kasa', 'takviye', 'rozet'].map((kimlik) => ({
        kimlik,
        ad: KATEGORI_ADLARI[kimlik],
        esyalar: satilik.filter((e) => e.kategori === kimlik).map((e) => esyaSatiri(b, e)),
      }));

      const altin = esyaGetir('rozet-altin');
      const kayit = ozelRolGetir(b.db, b.guildId, b.kullaniciId);
      const rol = kayit ? (b.guild?.roles?.cache?.get(kayit.rol_id) ?? null) : null;

      return {
        kategoriler,
        kasaAlimSiniri: KASA_ALIM_SINIRI,
        // Satılmayan rozet: yalnız not olarak gösterilir.
        altinRozet: {
          ...nesneOzeti(b, altin),
          aciklama: altin.aciklama,
          sahip: esyaAdedi(b.db, b.guildId, b.kullaniciId, altin.kimlik) > 0,
          not: 'Yalnız Altın ve Elmas Kasa\'dan çıkar.',
        },
        renkRolu: {
          fiyat: RENK_FIYAT,
          degisim: RENK_DEGISIM,
          mevcut: kayit ? {
            rolId: kayit.rol_id, renk: renkMetni(kayit.renk), ad: rol?.name ?? null, var: Boolean(rol),
          } : null,
        },
        roller: await magazaRolleri(b),
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/magaza/al',
    async calistir(b) {
      const kimlik = metin(b.govde, 'kimlik');
      const esya = esyaGetir(kimlik);
      if (!esya) hata('Bunu mağazada bulamadım.');
      const kac = tamSayi(b.govde, 'adet', {
        zorunlu: false, min: 1, max: KASA_ALIM_SINIRI, varsayilan: 1,
      });

      const sonuc = basarili(esyaSatinAl(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, kimlik, adet: kac,
      }));
      const rol = esya.tur === 'rozet' ? await rozetRolu(b, esya.kimlik, 'Mağazadan rozet') : null;
      b.gorev([{ tur: 'magaza' }]);

      const yerine = sonuc.sonuc.yerine ?? null;
      return {
        esya: nesneOzeti(b, esya),
        tur: esya.tur,
        adet: sonuc.adet,
        odenen: sonuc.odenen,
        // Kasada/stokta "artık n tane"; etkide bitiş; muz çıktıysa (yerine) miktar.
        sahip: sonuc.sonuc.adet ?? null,
        bitis: sonuc.sonuc.bitis ?? null,
        enerji: sonuc.sonuc.enerji ?? null,
        muz: sonuc.sonuc.tur === 'muz' ? { miktar: sonuc.sonuc.miktar, yerine } : null,
        rozetRolu: rol,
        // Görev ödülü (b.gorev) cüzdana yattıysa lib'in bakiyesi eskidir.
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/magaza/rol',
    async calistir(b) {
      const rolId = metin(b.govde, 'rolId');
      if (!kimlikMi(rolId)) hata('`rolId` geçersiz.');
      if (!b.guild) hata('Sunucu bulunamadı.', 500);
      const rol = b.guild.roles.cache.get(rolId) ?? await b.guild.roles.fetch(rolId).catch(() => null);
      const urun = urunGetir(b.db, b.guildId, rolId);
      if (!urun || !rol) hata('Bu rol satışta değil.');

      const uye = await b.uye();
      if (!uye) hata('Sunucu üyesi bulunamadı.', 403);
      if (uye.roles?.cache?.has(rol.id)) hata(`**${rol.name}** zaten sende.`);

      const uygun = rolSatilabilirMi(rol, b.guild.members.me?.roles?.highest?.position ?? 0);
      if (!uygun.ok) hata(`Bu rol şu an verilemiyor: ${uygun.sebep} Bir yöneticiye haber ver.`);

      const sonuc = basarili(await satinAl(b.db, {
        guildId: b.guildId,
        kullaniciId: b.kullaniciId,
        urun,
        rolVer: () => uye.roles.add(rol.id, ROL_SEBEBI),
      }));
      b.gorev([{ tur: 'magaza' }]);
      return {
        rol: { id: rol.id, ad: rol.name, renk: renkHex(rol.color) },
        odenen: urun.fiyat,
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/magaza/renk',
    async calistir(b) {
      const sayi = renkAyristir(metin(b.govde, 'renk', { uzunluk: 7 }));
      if (sayi === null) hata('Rengi anlayamadım. Örnek: `#ff8800` (tam siyah olmaz, `#010101` kullan).');
      const { guild } = b;
      if (!guild) hata('Sunucu bulunamadı.', 500);
      const uye = await b.uye();
      if (!uye) hata('Sunucu üyesi bulunamadı.', 403);
      const botUst = guild.members.me?.roles?.highest;

      const sonuc = basarili(await renkSatinAl(b.db, {
        guildId: b.guildId,
        kullaniciId: b.kullaniciId,
        renk: sayi,
        rolBul: (id) => guild.roles.fetch(id).catch(() => null),
        rolOlustur: async (r) => {
          const rol = await guild.roles.create({
            name: `🎨 ${uye.user?.username ?? uye.displayName}`.slice(0, 100),
            colors: { primaryColor: r },
            permissions: [],
            mentionable: false,
            reason: 'Muz mağazası: özel renk rolü',
          });
          // Rengin görünmesi için botun en üst rolünün hemen altı (komuttaki gibi); sıralama başarısızsa da rol işe yarar.
          if (botUst) await rol.setPosition(Math.max(1, botUst.position - 1)).catch(() => null);
          await uye.roles.add(rol, 'Muz mağazası: özel renk rolü');
          return rol;
        },
        rolRenkle: async (rol, r) => {
          await rol.edit({ colors: { primaryColor: r }, reason: 'Muz mağazası: renk değişimi' });
          if (!uye.roles?.cache?.has(rol.id)) await uye.roles.add(rol, 'Muz mağazası: özel renk rolü');
        },
      }));
      b.gorev([{ tur: 'magaza' }]);
      return {
        yeni: sonuc.yeni,
        rolId: sonuc.rolId,
        renk: renkMetni(sayi),
        odenen: sonuc.fiyat,
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },

  // ── Envanter ────────────────────────────────────────────────────────────
  {
    yontem: 'GET',
    yol: '/api/envanter',
    calistir(b) {
      const sahip = envanterOku(b.db, b.guildId, b.kullaniciId);
      const kol = koleksiyon(b.db, b.guildId, b.kullaniciId);
      const { puan, sayim, metin: puanMetni } = puanSatiri(sahip);
      const bugun = hareketToplami(b.db, b.guildId, b.kullaniciId, 'hediye-ver', trGunBaslangici());
      const etkiler = etkinEtkiler(b.db, b.guildId, b.kullaniciId);

      const serbest = serbestEnvanter(b.db, b.guildId, b.kullaniciId); // çalışmaya kilitli maymun satılmaz
      const nadirlikToptan = Object.fromEntries(NADIRLIK_SIRASI.map((n) => [n, toptanOnizleme(serbest, n)]));
      const birlestirme = toptanBirlestirOnizleme(sahip);

      return {
        kasalar: KASA_KIMLIKLERI.map((k) => ({ ...nesneOzeti(b, esyaGetir(k)), adet: sahip[k] ?? 0 })),
        // Normal ve parlak sürümler ayrı kimlikle: { 'kart-quincy': 2, 'parlak:kart-quincy': 1 }.
        kartlar: Object.fromEntries(Object.entries(sahip).filter(([k]) => kartMi(k))),
        rozetler: rozetler(b.db, b.guildId, b.kullaniciId).reverse().map((r) => nesneOzeti(b, r)),
        seriKoruyucu: sahip[SERI_KORUYUCU] ?? 0,
        etkiler: Object.entries(etkiler).map(([kimlik, bitis]) => ({ ...nesneOzeti(b, esyaGetir(kimlik)), bitis })),
        koleksiyon: {
          farkli: kol.farkli,
          toplam: kol.toplam,
          kartSayisi: kol.kartSayisi,
          kademeler: kol.kademeler,
          puan,
          sayim,
          puanMetni,
        },
        toptan: { hepsi: toptanOnizleme(serbest), nadirlikler: nadirlikToptan },
        kopyalar: kopyaOnizleme(sahip),
        birlestirme: {
          ...birlestirme,
          adet: BIRLESTIRME_ADEDI,
          sinir: BIRLESTIRME_SINIRI,
          // Karttan kaç kez birleştirilebilir (son kopya hep kalır) ve bir üst nadirlik.
          kartlar: Object.fromEntries(KARTLAR
            .filter((k) => birlestirilebilirAdet(sahip[k.kimlik] ?? 0) > 0)
            .map((k) => [k.kimlik, { kez: birlestirilebilirAdet(sahip[k.kimlik]), ust: ustNadirlik(k.nadirlik) }])),
        },
        parlakCarpani: PARLAK_CARPANI,
        hediye: { gunluk: HEDIYE_GUNLUK, kalan: Math.max(0, HEDIYE_GUNLUK - bugun) },
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/envanter/sat',
    calistir(b) {
      const kimlik = metin(b.govde, 'kimlik');
      if (!kartMi(kimlik)) hata('Böyle bir kart yok.');
      const tumu = b.govde.tumu === true;
      const kac = tumu
        ? Math.max(1, envanterOku(b.db, b.guildId, b.kullaniciId)[kimlik] ?? 0)
        : tamSayi(b.govde, 'adet', {
          zorunlu: false, min: 1, max: 1000, varsayilan: 1,
        });
      const sonuc = basarili(kartSat(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, kimlik, adet: kac,
      }));
      b.gorev([{ tur: 'kart-sat', miktar: sonuc.adet }]);
      return {
        kart: nesneOzeti(b, sonuc.kart),
        adet: sonuc.adet,
        tutar: sonuc.tutar,
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/envanter/toptan-sat',
    calistir(b) {
      const nadirlik = b.govde.nadirlik ?? null;
      if (nadirlik !== null && !NADIRLIKLER[nadirlik]) hata('`nadirlik` geçersiz.');
      const onizleme = toptanOnizleme(serbestEnvanter(b.db, b.guildId, b.kullaniciId), nadirlik);
      if (onizleme.adet === 0) hata('Satılacak kartın yok.');
      // Onay anındaki envanter satılır (ön yüz önizlemeyi gösterip onay almıştır).
      const sonuc = toptanSat(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, nadirlik });
      if (sonuc.adet > 0) b.gorev([{ tur: 'kart-sat', miktar: sonuc.adet }]);
      return { adet: sonuc.adet, tutar: sonuc.tutar, bakiye: bakiye(b.db, b.guildId, b.kullaniciId) };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/envanter/kopyalari-sat',
    calistir(b) {
      const sonuc = kopyalariSat(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });
      if (sonuc.adet === 0) hata('Satılacak kopya kartın yok.');
      b.gorev([{ tur: 'kart-sat', miktar: sonuc.adet }]);
      return { adet: sonuc.adet, tutar: sonuc.tutar, bakiye: bakiye(b.db, b.guildId, b.kullaniciId) };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/envanter/birlestir',
    calistir(b) {
      const kimlik = metin(b.govde, 'kimlik');
      const toptan = kimlik === 'hepsi';

      let sonuc;
      if (toptan) {
        sonuc = toptanBirlestirOnizleme(envanterOku(b.db, b.guildId, b.kullaniciId)).birlestirme > 0
          ? toptanBirlestir(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId })
          : { ok: false, sebep: `Birleştirilecek kopyan yok: her karttan 1 kopya kalacak şekilde ${BIRLESTIRME_ADEDI}'li grup gerekir.` };
      } else {
        if (!kartMi(kimlik)) hata('Böyle bir kart yok.');
        sonuc = birlestirKartlar(b.db, {
          guildId: b.guildId,
          kullaniciId: b.kullaniciId,
          kimlik,
          adet: tamSayi(b.govde, 'adet', {
            zorunlu: false, min: 1, max: BIRLESTIRME_SINIRI, varsayilan: 1,
          }),
        });
      }
      basarili(sonuc);
      if (sonuc.yeniKart > 0) b.gorev([{ tur: 'kart-yeni', miktar: sonuc.yeniKart }]);

      const ust = !toptan && birlestirilebilirMi(kimlik) ? NADIRLIKLER[ustNadirlik(sonuc.kaynak.nadirlik)] : null;
      return {
        harcanan: sonuc.harcanan,
        birlestirme: sonuc.sonuclar.length,
        yeniKart: sonuc.yeniKart,
        kaynak: toptan ? null : nesneOzeti(b, sonuc.kaynak),
        ustNadirlik: ust ? { ad: ust.ad, simge: ust.simge } : null,
        sonuclar: birlestirmeGruplari(b, sonuc.sonuclar),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/envanter/hediye',
    async calistir(b) {
      const aliciId = metin(b.govde, 'aliciId');
      if (!kimlikMi(aliciId)) hata('`aliciId` geçersiz.');
      const kimlik = metin(b.govde, 'kimlik');
      const kac = tamSayi(b.govde, 'adet', {
        zorunlu: false, min: 1, max: HEDIYE_GUNLUK, varsayilan: 1,
      });
      if (aliciId === b.kullaniciId) hata('Kendine hediye edemezsin.');
      const alici = await b.guild?.members.fetch(aliciId).catch(() => null);
      if (!alici) hata('Alıcı bu sunucunun üyesi değil.');
      if (alici.user?.bot) hata('Botlara hediye veremezsin.');

      const sonuc = basarili(hediyeEt(b.db, {
        guildId: b.guildId, gonderenId: b.kullaniciId, aliciId, kimlik, adet: kac,
      }));
      const nesne = kartGetir(kimlik) ?? esyaGetir(kimlik);
      return {
        adet: sonuc.adet,
        kalanHak: sonuc.kalanHak,
        nesne: nesneOzeti(b, nesne),
        alici: uyeOzeti(b.guild, aliciId),
      };
    },
  },

  // ── Kasa ────────────────────────────────────────────────────────────────
  {
    yontem: 'GET',
    yol: '/api/kasa/:kimlik',
    calistir(b) {
      const kimlik = b.params.kimlik;
      const icerik = KASA_ICERIKLERI[kimlik];
      if (!icerik) hata('Böyle bir kasa yok.', 404);
      const esya = esyaGetir(kimlik);
      const toplam = icerik.reduce((t, o) => t + o.agirlik, 0);
      return {
        ...nesneOzeti(b, esya),
        aciklama: esya.aciklama,
        fiyat: etkinlikFiyati(b.db, b.guildId, esya).fiyat,
        sahip: esyaAdedi(b.db, b.guildId, b.kullaniciId, kimlik),
        parlakSans: PARLAK_SANS,
        parlakCarpani: PARLAK_CARPANI,
        garanti: garantiOzeti(garantiDurumu(b.db, b.guildId, b.kullaniciId, kimlik)),
        icerik: [...icerik].sort((x, y) => y.agirlik - x.agirlik).map((o) => icerikSatiri(b, o, toplam)),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/kasa/ac',
    async calistir(b) {
      const kasa = metin(b.govde, 'kasa');
      if (!KASA_ICERIKLERI[kasa]) hata('Böyle bir kasa yok.');
      const kac = tamSayi(b.govde, 'adet', {
        zorunlu: false, min: 1, max: COKLU_ACMA, varsayilan: 1,
      });

      const sonuclar = [];
      let kalan = 0;
      let garanti = null;
      for (let i = 0; i < kac; i += 1) {
        const s = kasaAc(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, kasa });
        if (!s.ok) {
          if (i === 0) basarili(s);
          break;
        }
        sonuclar.push(s.sonuc);
        kalan = s.kalan;
        garanti = s.garanti;
      }

      // Çoklu açılışta en iyi sonuç önce (cokluAc gibi); tekte sıra anlamsız.
      const sira = (s) => NADIRLIK_SIRASI.indexOf(sonucNadirligi(s));
      const sirali = [...sonuclar].sort((x, y) => sira(y) - sira(x));
      const ozetler = [];
      for (const s of sirali) {
        const ozet = sonucOzeti(b, s);
        // Rozet çıktıysa rol (komuttaki odulRoluVer): rol yoksa/verilemezse sessiz.
        if (ozet.rozet) ozet.rozetRolu = await rozetRolu(b, s.kimlik, 'Kasadan rozet');
        ozetler.push(ozet);
      }
      b.gorev(kasaOlaylari(sonuclar));
      const kasaOzeti = nesneOzeti(b, esyaGetir(kasa));
      // Tek açılış şeritle kayarak açılır; çoklu açılış animasyonsuz.
      b.akis.kasa({ kasa: kasaOzeti, sonuclar: sirali, ozetler }, { gecikmeMs: kac === 1 ? ANIMASYON_PAYI_MS : 0 });

      const kol = koleksiyon(b.db, b.guildId, b.kullaniciId);
      return {
        kasa: kasaOzeti,
        sonuclar: ozetler,
        kalan,
        garanti: garantiOzeti(garanti),
        // Tek açılışta ön yüz bununla kayan şeridi doldurur; çoklu açılış animasyonsuz.
        serit: kac === 1 ? seritUret(kasa) : null,
        koleksiyon: { farkli: kol.farkli, toplam: kol.toplam },
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },

  // ── Setler ──────────────────────────────────────────────────────────────
  {
    yontem: 'GET',
    yol: '/api/setler',
    calistir(b) {
      const sahip = envanterOku(b.db, b.guildId, b.kullaniciId);
      const durumlar = setDurumlari(b.db, b.guildId, b.kullaniciId);
      return {
        setler: durumlar.map((d) => ({
          kimlik: d.set.kimlik,
          ad: d.set.ad,
          simge: d.set.simge,
          tur: d.set.tur,
          // Kartın normal ya da parlak sürümü yeterli (kartSahibiMi ile aynı).
          kartlar: d.set.kartlar.map((k) => ({
            kimlik: k, sahip: (sahip[k] ?? 0) > 0 || (sahip[`parlak:${k}`] ?? 0) > 0,
          })),
          sahip: d.sahip,
          toplam: d.toplam,
          tamam: d.tamam,
          alindi: d.alindi,
          alinabilir: d.alinabilir,
          odul: odulOzeti(b, d.set.odul),
        })),
        alinan: durumlar.filter((d) => d.alindi).length,
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/setler/odul',
    calistir(b) {
      const sonuc = basarili(setOduluAl(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, setKimligi: metin(b.govde, 'set'),
      }));
      return {
        set: { kimlik: sonuc.set.kimlik, ad: sonuc.set.ad, simge: sonuc.set.simge },
        odul: odulOzeti(b, sonuc.odul),
        bakiye: sonuc.bakiye,
      };
    },
  },
];
