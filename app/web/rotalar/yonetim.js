/**
 * Yönetici paneli: ekonomi yönetimi, panel, etkinlikler, boss çağırma,
 * mağaza rolleri ve sistem durumu. Bütün rotalar `yonetici: true`'dur
 * (Discord'da Yönetici izni; sunucu denetler). Kurallar lib/'tedir; burada
 * slash komutlarla (ekonomi-yonet, ekonomi-panel, ekonomi-etkinlik, boss
 * cagir, magaza ekle/kaldir) aynı çağrılar yapılır. Muz işlemleri deftere
 * yöneticinin kimliğiyle yazılır.
 */

import { PermissionFlagsBits } from 'discord.js';

import { OYUN_ADLARI } from '../../lib/akis.js';
import { kullanimOzeti } from '../../lib/arayuz-sure.js';
import { AYARLAR, ayarGetir } from '../../lib/ayarlar.js';
import { sureAyristir } from '../../lib/bicim.js';
import { aktifBoss, BOSSLAR, bossCikar, bossGetir, bossGorunumu } from '../../lib/boss.js';
import { kilitliToplam } from '../../lib/banka.js';
import {
  bakiye as bakiyeOku, dus, ekle, miktarAyristir, sifirla, TURLER, zenginlikSirasi,
} from '../../lib/ekonomi.js';
import {
  DONEMLER, donemAraligi, HAREKET_SIRALAMALARI, hareketAra, magazaSatislari, panelOzeti, sonHareketler, TUR_ETIKETLERI,
  TUR_GRUPLARI,
} from '../../lib/ekonomi-panel.js';
import {
  SEBEP_UZUNLUK, uzaklastir, uzaklastirmaKaldir, uzaklastirmaListesi,
} from '../../lib/ekonomi-uzak.js';
import {
  ALICI_SINIRI, BASLIK_UZUNLUK, duyuruGonder, duyuruListesi, duyuruSil, IKONLAR, METIN_UZUNLUK,
} from '../../lib/duyuru.js';
import { esyaGetir } from '../../lib/esyalar.js';
import {
  KOD_DESENI, ODUL_MAX, promoBitir, promoKullananlar, promoListesi, promoOlustur, SINIR_MAX,
} from '../../lib/promo.js';
import {
  aktifEtkinlikler, ETKINLIK_TURLERI, ETKINLIKLER, etkinlikAdi, etkinlikBaslat, etkinlikBitir, etkinlikGecmisi,
} from '../../lib/etkinlik.js';
import { grevOzeti } from '../../lib/grev.js';
import { yoklamaOzeti } from '../../lib/calis-yoklama.js';
import { kanalYetkisiKontrol, yetkiliKimlikler } from '../../lib/izin.js';
import { kartGetir } from '../../lib/kasalar.js';
import { aktifKredi, borcOzeti } from '../../lib/kredi.js';
import {
  FIYAT_MAX, rolSatilabilirMi, urunEkle, urunKaldir, urunler,
} from '../../lib/magaza.js';
import { kullaniciGetir } from '../../lib/seviye.js';
import { bossMesajiGonder } from '../../servisler/boss.js';
import { duyuruEmbed } from '../../commands/ekonomi/ekonomi-etkinlik.js';
import { uyeOzeti } from '../gorsel.js';
import {
  basarili, hata, kimlikMi, metin,
} from '../yardimci.js';

/** Slash komuttaki üst sınır (ekonomi-yonet). */
const MIKTAR_MAX = 100_000_000;

/** Hazır etkinlik süreleri (ön yüz düğmeleri). */
const HAZIR_SURELER = ['30dk', '1sa', '6sa', '1g', '3g', '7g'];

/** Sistem durumunda gösterilen ayarlar (salt okuma). */
const AYAR_ANAHTARLARI = [
  'ekonomi.kanallar', 'ekonomi.maksBahis', 'ekonomi.vergiYuzde', 'ekonomi.seviyeOdulu',
  'ekonomi.mesajOdulu', 'ekonomi.akisKanal', 'ekonomi.akisEsik', 'boss.kanal', 'piyango.kanal', 'hisse.kanal', 'seviye.sesXpGunluk',
];

/** Defterdeki `karsi_id` → okunur karşı taraf: üye, rol, eşya ya da kayıt adı. */
const KARSI_ONEKLERI = {
  kredi: 'Kredi', boss: 'Boss', alim: 'Pazar alım isteği', promo: 'Promosyon kodu',
};
const KARSI_ADLARI = {
  baslangic: 'Başlangıç muzu', bedel: 'Prestij bedeli', sifirlama: 'Prestij sıfırlaması', 'renk-rolu': 'Özel renk rolü',
};
function karsiAciklama(b, karsiId) {
  if (!karsiId) return null;
  if (kimlikMi(karsiId)) {
    const rol = b.guild?.roles?.cache?.get(karsiId);
    if (rol && !b.guild?.members?.cache?.has(karsiId)) return { tur: 'rol', ad: `@${rol.name}` };
    return { tur: 'uye', ...uyeOzeti(b.guild, karsiId) };
  }
  const esya = kartGetir(karsiId) ?? esyaGetir(karsiId);
  if (esya) return { tur: 'esya', ad: esya.ad };
  const [onek, no] = karsiId.split('-');
  if (KARSI_ONEKLERI[onek] && no) return { tur: 'kayit', ad: `${KARSI_ONEKLERI[onek]} #${no}` };
  if (onek === 'piyango') return { tur: 'kayit', ad: 'Piyango çekilişi' };
  const ciftlik = {
    kur: 'Çiftlik kurma',
    yukselt: 'Çiftlik yükseltme',
    hasat: 'Çiftlik hasadı',
    sat: 'Çiftlik satışı',
    iade: 'Çiftlik geçiş iadesi',
    prestij: 'Çiftlik prestij devri',
  }[onek];
  if (ciftlik && no) return { tur: 'kayit', ad: `${ciftlik} (arsa ${Number(no) + 1})` };
  return { tur: 'kayit', ad: KARSI_ADLARI[karsiId] ?? karsiId };
}

/** Mağaza satışındaki ürün (`karsi_id`): eşya/kasa, satılan rol ya da özel renk rolü. */
function satisUrunu(b, kimlik) {
  if (kimlik === 'renk-rolu') return { kimlik, ad: 'Özel renk rolü', tur: 'renk' };
  const esya = esyaGetir(kimlik);
  if (esya) return { kimlik, ad: esya.ad, tur: esya.tur === 'kasa' ? 'kasa' : 'esya', gorsel: b.gorsel(esya) };
  const rol = b.guild?.roles?.cache?.get(kimlik);
  return {
    kimlik,
    ad: rol ? `@${rol.name}` : 'Silinmiş rol',
    tur: 'rol',
    renk: rol?.color ? `#${Number(rol.color).toString(16).padStart(6, '0')}` : null,
  };
}

/** Gövdedeki üye kimliği → sunucu üyesi (bot olamaz, sunucuda olmalı). */
async function hedefUye(b) {
  const uyeId = metin(b.govde, 'uyeId');
  if (!kimlikMi(uyeId)) hata('`uyeId` geçersiz.');
  const uye = await b.guild?.members.fetch(uyeId).catch(() => null);
  if (!uye) hata('Bu üye sunucuda bulunamadı.', 404);
  if (uye.user?.bot) hata('Botların bakiyesi tutulmuyor.');
  return uye;
}

/** Üyenin yönetici için özeti: bakiye, seviye, bankada, borç. */
function uyeBilgisi(b, id) {
  const k = aktifKredi(b.db, b.guildId, id);
  return {
    ...uyeOzeti(b.guild, id),
    bakiye: bakiyeOku(b.db, b.guildId, id),
    seviye: kullaniciGetir(b.db, b.guildId, id).seviye,
    bankada: kilitliToplam(b.db, b.guildId, id),
    borc: k ? borcOzeti(k).kalan : 0,
    sira: zenginlikSirasi(b.db, b.guildId, id, []),
  };
}

/** Duyuru kanalı: `ekonomi.kanallar` ilk kanalı; yoksa null. */
async function duyuruKanali(b) {
  const kanalId = ayarGetir(b.db, b.guildId, 'ekonomi.kanallar')?.[0];
  if (!kanalId) return null;
  const kanal = b.guild?.channels?.cache?.get(kanalId) ?? await b.client?.channels?.fetch?.(kanalId).catch(() => null);
  return kanal ?? null;
}

/** Ayar satırı: etiket, tür ve kanal kimliklerinin adları (`kanallar`). */
function ayarSatiri(b, anahtar) {
  const deger = ayarGetir(b.db, b.guildId, anahtar);
  const tur = AYARLAR[anahtar].tur;
  const kanalAdi = (id) => `#${b.guild?.channels?.cache?.get(id)?.name ?? id}`;
  const kanallar = tur === 'kanal' ? (deger ? [kanalAdi(deger)] : []) : tur === 'kanalListesi' ? deger.map(kanalAdi) : null;
  return {
    anahtar, etiket: AYARLAR[anahtar].etiket, tur, deger, kanallar,
  };
}

/** Mağaza için sunucu rolleri: satış durumu ve uygunluk (nedenli). */
function rolListesi(b) {
  const botUst = b.guild?.members?.me?.roles?.highest?.position ?? 0;
  const satistakiler = new Map(urunler(b.db, b.guildId).map((u) => [u.rol_id, u.fiyat]));
  const roller = [...(b.guild?.roles?.cache?.values() ?? [])]
    .filter((r) => r.id !== b.guild.id)
    .sort((a, c) => c.position - a.position)
    .map((r) => {
      const uygun = rolSatilabilirMi(r, botUst);
      return {
        id: r.id,
        ad: r.name,
        renk: r.color ? `#${Number(r.color).toString(16).padStart(6, '0')}` : null,
        fiyat: satistakiler.get(r.id) ?? null,
        uygun: uygun.ok,
        sebep: uygun.ok ? null : uygun.sebep,
      };
    });
  // Rolü silinmiş ama hâlâ satıştaki ürünler de kaldırılabilsin.
  const var_ = new Set(roller.map((r) => r.id));
  for (const [rolId, fiyat] of satistakiler) {
    if (!var_.has(rolId)) roller.push({ id: rolId, ad: null, renk: null, fiyat, uygun: false, sebep: 'Rol sunucuda artık yok.' });
  }
  return roller;
}

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/yonetim',
    yonetici: true,
    async calistir(b) {
      const savas = aktifBoss(b.db, b.guildId);
      return {
        etkinlikler: aktifEtkinlikler(b.db, b.guildId).map((e) => ({
          tur: e.tur, ad: etkinlikAdi(e.tur), etki: ETKINLIKLER[e.tur]?.etki ?? '', bitis: e.bitis, baslatan: uyeOzeti(b.guild, e.baslatan),
        })),
        etkinlikTurleri: ETKINLIK_TURLERI.map((tur) => ({ tur, ad: etkinlikAdi(tur), etki: ETKINLIKLER[tur].etki })),
        etkinlikGecmisi: etkinlikGecmisi(b.db, b.guildId).map((e) => ({
          tur: e.tur, ad: etkinlikAdi(e.tur), baslangic: e.baslangic, bitis: e.bitis, erken: e.erken, baslatan: uyeOzeti(b.guild, e.baslatan),
        })),
        hazirSureler: HAZIR_SURELER,
        bosslar: BOSSLAR.map((x) => ({ kimlik: x.kimlik, ad: x.ad, gorsel: b.gorsel(bossGorunumu(x.kimlik, false)) })),
        aktifBoss: savas ? { boss: savas.boss, elit: savas.elit === 1, bitis: savas.bitis } : null,
        bossKanalAyarli: Boolean(ayarGetir(b.db, b.guildId, 'boss.kanal')),
        donemler: Object.entries(DONEMLER).map(([kimlik, d]) => ({ kimlik, ad: d.ad })),
        roller: rolListesi(b),
        ayarlar: AYAR_ANAHTARLARI.map((anahtar) => ayarSatiri(b, anahtar)),
        fiyatMax: FIYAT_MAX,
      };
    },
  },
  {
    yontem: 'GET',
    yol: '/api/yonetim/panel',
    yonetici: true,
    async calistir(b) {
      const donem = b.sorgu.get('donem') ?? 'bugun';
      if (!DONEMLER[donem]) hata('Dönem `bugun`, `7g` ya da `30g` olmalı.');
      // Varsayılan yöneticiler hariç (×5 gelir üye ekonomisini şişirmesin); `yoneticiler=dahil` hepsini sayar.
      const dahil = b.sorgu.get('yoneticiler') === 'dahil';
      const o = panelOzeti(b.db, b.guildId, donem, Date.now(), { haric: dahil ? [] : yetkiliKimlikler() });
      return {
        donem,
        yoneticiHaric: o.yoneticiHaric,
        arz: o.arz,
        bakiyeler: o.bakiyeler,
        bankada: o.bankada,
        hissede: o.hissede ?? 0,
        uyeSayisi: o.uyeSayisi,
        basilan: o.basilan,
        yokEdilen: o.yokEdilen,
        toplamBasilan: o.toplamBasilan,
        toplamYokEdilen: o.toplamYokEdilen,
        net: o.net,
        degisimYuzde: o.degisimYuzde,
        kasaAcilan: o.kasaAcilan,
        kartSatilan: o.kartSatilan,
        kazananlar: o.kazananlar.map((k) => ({ ...uyeOzeti(b.guild, k.kullanici_id), net: k.net })),
        yoneticiGonderim: {
          toplam: o.yoneticiGonderim.toplam,
          adet: o.yoneticiGonderim.adet,
          aliciSayisi: o.yoneticiGonderim.aliciSayisi,
          alicilar: o.yoneticiGonderim.alicilar.map((a) => ({ ...uyeOzeti(b.guild, a.kullanici_id), toplam: a.toplam, adet: a.adet })),
        },
        takaslar: {
          adet: o.takaslar.adet,
          toplamDeger: o.takaslar.toplamDeger,
          yoneticili: o.takaslar.yoneticili,
          dengesiz: o.takaslar.dengesiz.map((t) => ({
            ...t, eden: uyeOzeti(b.guild, t.edenId), karsi: uyeOzeti(b.guild, t.karsiId),
          })),
        },
        kumarOyunlari: o.kumarOyunlari,
        etkinlikler: o.etkinlikler.map((e) => ({
          tur: e.tur, ad: e.ad, baslangic: e.baslangic, bitis: e.bitis, erken: e.erken,
        })),
      };
    },
  },
  {
    // Bütün ekonomi defteri: süzgeç (tür/grup, üye, yön, en az miktar, dönem), sıralama, sayfa.
    yontem: 'GET',
    yol: '/api/yonetim/hareketler',
    yonetici: true,
    calistir(b) {
      const q = (ad) => b.sorgu.get(ad) ?? '';
      const turler = q('tur').split(',').filter((t) => TUR_ETIKETLERI[t]);
      const uyeId = q('uye');
      if (uyeId && !kimlikMi(uyeId)) hata('`uye` geçersiz.');
      const yon = ['giris', 'cikis'].includes(q('yon')) ? q('yon') : null;
      const minMiktar = Math.max(0, Math.floor(Number(q('min')) || 0));
      const donem = q('donem') || '7g';
      if (donem !== 'tumu' && !DONEMLER[donem]) hata('`donem` bugun, 7g, 30g ya da tumu olmalı.');
      const aralik = donem === 'tumu' ? { baslangic: null, bitis: null } : donemAraligi(donem);
      const siralama = HAREKET_SIRALAMALARI[q('siralama')] ? q('siralama') : 'yeni';
      const sonuc = hareketAra(b.db, b.guildId, {
        turler,
        uyeId: uyeId || null,
        yon,
        minMiktar,
        baslangic: aralik.baslangic,
        bitis: aralik.bitis,
        haric: q('yoneticiGizle') === '1' ? yetkiliKimlikler() : [],
        siralama,
        sayfa: Number(q('sayfa')) || 1,
      });
      return {
        ...sonuc,
        satirlar: sonuc.satirlar.map((h) => ({
          id: h.id,
          uye: uyeOzeti(b.guild, h.kullanici_id),
          tur: h.tur,
          etiket: `${TUR_ETIKETLERI[h.tur] ?? h.tur}${h.oyun ? ` · ${OYUN_ADLARI[h.oyun] ?? h.oyun}` : ''}`,
          miktar: h.miktar,
          bakiyeSonra: h.bakiye_sonra,
          karsi: karsiAciklama(b, h.karsi_id),
          zaman: h.zaman,
        })),
        secenekler: {
          gruplar: TUR_GRUPLARI.map((g) => ({ ...g, turler: g.turler.map((t) => ({ kimlik: t, ad: TUR_ETIKETLERI[t] })) })),
          donemler: [...Object.entries(DONEMLER).map(([kimlik, d]) => ({ kimlik, ad: d.ad })), { kimlik: 'tumu', ad: 'Tümü' }],
        },
      };
    },
  },
  {
    // Mağaza satışları: ne, kaç adet, kaç muza, kim aldı. Süzgeç: dönem, ürün, üye, yöneticileri gizle.
    yontem: 'GET',
    yol: '/api/yonetim/satislar',
    yonetici: true,
    calistir(b) {
      const q = (ad) => b.sorgu.get(ad) ?? '';
      const donem = q('donem') || '30g';
      if (donem !== 'tumu' && !DONEMLER[donem]) hata('`donem` bugun, 7g, 30g ya da tumu olmalı.');
      const uyeId = q('uye');
      if (uyeId && !kimlikMi(uyeId)) hata('`uye` geçersiz.');
      const urun = q('urun');
      if (urun.length > 64) hata('`urun` geçersiz.');
      const aralik = donem === 'tumu' ? { baslangic: null, bitis: null } : donemAraligi(donem);
      const s = magazaSatislari(b.db, b.guildId, {
        baslangic: aralik.baslangic,
        bitis: aralik.bitis,
        haric: q('yoneticiGizle') === '1' ? yetkiliKimlikler() : [],
        uyeId: uyeId || null,
        urun: urun || null,
        sayfa: Number(q('sayfa')) || 1,
      });
      // Aynı ürün bütün satırlarda bir kez çözülsün.
      const urunler = new Map();
      const urunOzeti = (k) => {
        if (!urunler.has(k)) urunler.set(k, satisUrunu(b, k));
        return urunler.get(k);
      };
      return {
        donem,
        ozet: s.ozet,
        urunler: s.urunler.map(({ urun: k, ...u }) => ({ ...urunOzeti(k), ...u })),
        alicilar: s.alicilar.map(({ kullanici_id: id, ...a }) => ({ ...uyeOzeti(b.guild, id), ...a })),
        satirlar: s.satirlar.map((h) => ({
          id: h.id, uye: uyeOzeti(b.guild, h.kullanici_id), urun: urunOzeti(h.urun), adet: h.adet, tutar: h.tutar, zaman: h.zaman,
        })),
        sayfa: s.sayfa,
        sayfaSayisi: s.sayfaSayisi,
        secili: urun ? urunOzeti(urun) : null,
      };
    },
  },
  {
    yontem: 'GET',
    yol: '/api/yonetim/uye/:id',
    yonetici: true,
    async calistir(b) {
      const id = b.params.id;
      if (!kimlikMi(id)) hata('Üye kimliği geçersiz.');
      const uye = await b.guild?.members.fetch(id).catch(() => null);
      if (!uye) hata('Bu üye sunucuda bulunamadı.', 404);
      return {
        uye: uyeBilgisi(b, id),
        hareketler: sonHareketler(b.db, b.guildId, id).map((h) => ({
          tur: h.tur,
          miktar: h.miktar,
          bakiyeSonra: h.bakiye_sonra,
          karsi: h.karsi_id ? uyeOzeti(b.guild, h.karsi_id) : null,
          zaman: h.zaman,
        })),
      };
    },
  },
  {
    // Muz ver / al / sıfırla (ekonomi-yonet). Yanıt `bakiye`si yöneticinin kendi cüzdanıdır.
    yontem: 'POST',
    yol: '/api/yonetim/muz',
    yonetici: true,
    async calistir(b) {
      const islem = metin(b.govde, 'islem');
      if (!['ver', 'al', 'sifirla'].includes(islem)) hata('`islem` ver, al ya da sifirla olmalı.');
      const uye = await hedefUye(b);
      const ortak = {
        guildId: b.guildId, kullaniciId: uye.id, tur: TURLER.yonetici, karsiId: b.kullaniciId,
      };
      let mesaj;
      if (islem === 'sifirla') {
        const silinen = sifirla(b.db, { guildId: b.guildId, kullaniciId: uye.id, yoneticiId: b.kullaniciId });
        mesaj = silinen > 0 ? `**${uye.displayName}** bakiyesi sıfırlandı (${silinen.toLocaleString('tr-TR')} silindi).` : `**${uye.displayName}** bakiyesi zaten 0.`;
      } else {
        const ham = metin(b.govde, 'miktar', { uzunluk: 20 });
        const m = basarili(miktarAyristir(ham, bakiyeOku(b.db, b.guildId, uye.id)));
        if (m.miktar < 1 || m.miktar > MIKTAR_MAX) hata(`Miktar 1–${MIKTAR_MAX.toLocaleString('tr-TR')} arası olmalı.`);
        if (islem === 'ver') {
          ekle(b.db, { ...ortak, miktar: m.miktar });
          mesaj = `**${uye.displayName}** hesabına **${m.miktar.toLocaleString('tr-TR')}** muz eklendi.`;
        } else {
          // Bakiyesinden fazlası alınmaz.
          const alinacak = Math.min(m.miktar, bakiyeOku(b.db, b.guildId, uye.id));
          if (alinacak === 0) hata(`**${uye.displayName}** hesabında muz yok.`);
          dus(b.db, { ...ortak, miktar: alinacak });
          mesaj = `**${uye.displayName}** hesabından **${alinacak.toLocaleString('tr-TR')}** muz alındı.`;
        }
      }
      return { mesaj, uye: uyeBilgisi(b, uye.id), bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId) };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/etkinlik',
    yonetici: true,
    async calistir(b) {
      const tur = metin(b.govde, 'tur');
      if (!ETKINLIKLER[tur]) hata('Bilinmeyen etkinlik türü.');
      const sureMs = sureAyristir(metin(b.govde, 'sure', { uzunluk: 8 }));
      if (sureMs === null) hata('Süreyi anlayamadım. Örnek: `30dk`, `2sa`, `1g` (en az 10 dakika, en çok 7 gün).');
      const sonuc = basarili(etkinlikBaslat(b.db, {
        guildId: b.guildId, tur, sureMs, baslatanId: b.kullaniciId,
      }));

      // Duyuru: ekonomi kanallarının ilkine; kanal ya da yetki yoksa atlanır, hata atılmaz.
      let duyuruldu = false;
      const kanal = await duyuruKanali(b);
      const botUye = b.guild?.members?.me;
      const gonderilebilir = kanal?.isTextBased?.() && (!botUye || kanalYetkisiKontrol(kanal, botUye, PermissionFlagsBits.SendMessages).ok);
      if (gonderilebilir) {
        duyuruldu = await kanal.send({ embeds: [duyuruEmbed(tur, sonuc.bitis)], allowedMentions: { parse: [] } }).then(() => true, () => false);
      }
      return { bitis: sonuc.bitis, guncellendi: sonuc.guncellendi, duyuruldu };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/etkinlik/bitir',
    yonetici: true,
    async calistir(b) {
      const tur = metin(b.govde, 'tur');
      if (!ETKINLIKLER[tur]) hata('Bilinmeyen etkinlik türü.');
      return { bitti: etkinlikBitir(b.db, b.guildId, tur) };
    },
  },
  {
    // Boss çağır (boss cagir): kanal ayarı şart, mesaj gönderilemezse savaş geri alınır.
    yontem: 'POST',
    yol: '/api/yonetim/boss',
    yonetici: true,
    async calistir(b) {
      const kanalId = ayarGetir(b.db, b.guildId, 'boss.kanal');
      if (!kanalId) hata('Önce boss kanalını ayarla: `/ayar ayarla anahtar:boss.kanal kanal:#…`');
      const kimlik = metin(b.govde, 'boss', { zorunlu: false });
      if (kimlik && !bossGetir(kimlik)) hata('Bilinmeyen boss.');
      const elit = typeof b.govde.elit === 'boolean' ? b.govde.elit : null;
      const savas = bossCikar(b.db, { guildId: b.guildId, kimlik, elit });
      if (!savas) hata('Zaten aktif bir boss var; önce o bitmeli.');
      const mesaj = await bossMesajiGonder(b.client, b.db, b.guildId, savas, kanalId, { error() {}, log() {} });
      if (!mesaj) hata('Boss mesajı gönderilemedi (kanal erişimini kontrol et); boss geri alındı.');
      return { boss: savas.boss, elit: savas.elit === 1, url: mesaj.url ?? null };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/magaza-rol',
    yonetici: true,
    async calistir(b) {
      const rolId = metin(b.govde, 'rolId');
      if (!kimlikMi(rolId)) hata('`rolId` geçersiz.');
      const rol = b.guild?.roles?.cache?.get(rolId) ?? await b.guild?.roles?.fetch(rolId).catch(() => null);
      const uygun = rolSatilabilirMi(rol, b.guild?.members?.me?.roles?.highest?.position ?? 0);
      if (!uygun.ok) hata(uygun.sebep);
      const fiyat = Number(b.govde.fiyat);
      const sonuc = basarili(urunEkle(b.db, { guildId: b.guildId, rolId, fiyat, ekleyenId: b.kullaniciId }));
      return { guncellendi: sonuc.guncellendi, roller: rolListesi(b) };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/magaza-rol/kaldir',
    yonetici: true,
    async calistir(b) {
      const rolId = metin(b.govde, 'rolId');
      if (!kimlikMi(rolId)) hata('`rolId` geçersiz.');
      return { kaldirildi: urunKaldir(b.db, b.guildId, rolId), roller: rolListesi(b) };
    },
  },
  {
    // Arayüzde geçen süre (lib/arayuz-sure.js): dönem `bugun`, `7g`, `30g` ya da `tumu`.
    yontem: 'GET',
    yol: '/api/yonetim/kullanim',
    yonetici: true,
    calistir(b) {
      const donem = b.sorgu.get('donem') || '7g';
      if (donem !== 'tumu' && !DONEMLER[donem]) hata('`donem` bugun, 7g, 30g ya da tumu olmalı.');
      const o = kullanimOzeti(b.db, b.guildId, { baslangic: donem === 'tumu' ? null : donemAraligi(donem).baslangic });
      return {
        ...o,
        donem,
        uyeler: o.uyeler.map(({ kullaniciId, ...u }) => ({ ...uyeOzeti(b.guild, kullaniciId), ...u })),
        simdiAktif: o.simdiAktif.map(({ kullaniciId, ...u }) => ({ ...uyeOzeti(b.guild, kullaniciId), ...u })),
      };
    },
  },
  {
    // Maymun grevi (lib/grev.js): kaç kişi yakalandı, nasıl bitti.
    yontem: 'GET',
    yol: '/api/yonetim/grev',
    yonetici: true,
    calistir(b) {
      const o = grevOzeti(b.db, b.guildId);
      return { ...o, kayitlar: o.kayitlar.map(({ kullaniciId, ...k }) => ({ ...k, uye: uyeOzeti(b.guild, kullaniciId) })) };
    },
  },
  {
    // Ustabaşı yoklaması (lib/calis-yoklama.js): makro şüphesi olan çalışanlar.
    yontem: 'GET',
    yol: '/api/yonetim/yoklama',
    yonetici: true,
    calistir(b) {
      const o = yoklamaOzeti(b.db, b.guildId);
      return { ...o, kisiler: o.kisiler.map(({ kullaniciId, ...k }) => ({ ...k, uye: uyeOzeti(b.guild, kullaniciId) })) };
    },
  },
  // ── Ekonomiden uzaklaştırma (lib/ekonomi-uzak.js) ─────────────────────
  {
    yontem: 'GET',
    yol: '/api/yonetim/uzaklastirma',
    yonetici: true,
    sistemsiz: true,
    calistir: (b) => ({
      sebepUzunluk: SEBEP_UZUNLUK,
      liste: uzaklastirmaListesi(b.db, b.guildId).map((k) => ({
        uye: uyeOzeti(b.guild, k.kullaniciId),
        sebep: k.sebep,
        zaman: k.zaman,
        yetkili: uyeOzeti(b.guild, k.yetkiliId),
        bakiye: bakiyeOku(b.db, b.guildId, k.kullaniciId),
      })),
    }),
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/uzaklastir',
    yonetici: true,
    sistemsiz: true,
    async calistir(b) {
      const uyeId = metin(b.govde, 'uyeId');
      if (!kimlikMi(uyeId)) hata('`uyeId` geçersiz.');
      // Sunucudan çıkmış (yan) hesap da uzaklaştırılabilsin; yalnız bot reddedilir.
      const uye = await b.guild?.members.fetch(uyeId).catch(() => null);
      if (uye?.user?.bot) hata('Botlar ekonomiye katılmaz.');
      const sebep = metin(b.govde, 'sebep', { uzunluk: SEBEP_UZUNLUK });
      const sonuc = basarili(uzaklastir(b.db, {
        guildId: b.guildId, kullaniciId: uyeId, sebep, yetkiliId: b.kullaniciId,
      }));
      return { ok: true, yeni: sonuc.yeni };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/uzaklastirma-kaldir',
    yonetici: true,
    sistemsiz: true,
    calistir(b) {
      const uyeId = metin(b.govde, 'uyeId');
      if (!kimlikMi(uyeId)) hata('`uyeId` geçersiz.');
      basarili(uzaklastirmaKaldir(b.db, { guildId: b.guildId, kullaniciId: uyeId }));
      return { ok: true };
    },
  },
  // ── Bildirim gönder (lib/duyuru.js): Activity'de açılır pencere ────────
  {
    yontem: 'GET',
    yol: '/api/yonetim/duyurular',
    yonetici: true,
    sistemsiz: true,
    calistir: (b) => ({
      ikonlar: IKONLAR,
      baslikUzunluk: BASLIK_UZUNLUK,
      metinUzunluk: METIN_UZUNLUK,
      aliciSiniri: ALICI_SINIRI,
      hazirSureler: HAZIR_SURELER,
      liste: duyuruListesi(b.db, b.guildId).map((d) => ({
        id: d.id,
        baslik: d.baslik,
        metin: d.metin,
        ikon: d.ikon,
        zaman: d.zaman,
        bitis: d.bitis,
        gonderen: uyeOzeti(b.guild, d.gonderenId),
        alicilar: d.alicilar ? d.alicilar.map((id) => uyeOzeti(b.guild, id)) : null,
      })),
    }),
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/duyuru',
    yonetici: true,
    sistemsiz: true,
    calistir(b) {
      const sureMs = sureAyristir(metin(b.govde, 'sure', { uzunluk: 8 }));
      if (sureMs === null) hata('Süreyi anlayamadım. Örnek: `1sa`, `1g`, `3g`.');
      const herkes = b.govde.hedef === 'herkes';
      const alicilar = herkes ? null : b.govde.alicilar;
      if (!herkes) {
        if (!Array.isArray(alicilar) || alicilar.length === 0) hata('En az bir üye seç ya da **Herkese** gönder.');
        if (!alicilar.every(kimlikMi)) hata('`alicilar` geçersiz.');
      }
      const sonuc = basarili(duyuruGonder(b.db, {
        guildId: b.guildId,
        baslik: metin(b.govde, 'baslik', { uzunluk: BASLIK_UZUNLUK }),
        metin: metin(b.govde, 'metin', { uzunluk: METIN_UZUNLUK }),
        ikon: metin(b.govde, 'ikon'),
        alicilar,
        gonderenId: b.kullaniciId,
        sureMs,
      }));
      return { id: sonuc.id };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/duyuru/sil',
    yonetici: true,
    sistemsiz: true,
    calistir(b) {
      const id = Number(b.govde.id);
      if (!Number.isSafeInteger(id)) hata('`id` geçersiz.');
      basarili(duyuruSil(b.db, b.guildId, id));
      return { ok: true };
    },
  },
  // ── Promosyon kodları (lib/promo.js) ──────────────────────────────────
  {
    yontem: 'GET',
    yol: '/api/yonetim/promo',
    yonetici: true,
    sistemsiz: true,
    calistir: (b) => ({
      odulMax: ODUL_MAX,
      sinirMax: SINIR_MAX,
      kodDeseni: KOD_DESENI.source,
      hazirSureler: ['30dk', '1sa', '6sa', '1g', '3g', '7g'],
      liste: promoListesi(b.db, b.guildId).map((p) => ({
        id: p.id,
        kod: p.kod,
        odul: p.odul,
        sinir: p.sinir,
        kullanim: p.kullanim,
        zaman: p.zaman,
        bitis: p.bitis,
        olusturan: uyeOzeti(b.guild, p.olusturanId),
        sonKullananlar: promoKullananlar(b.db, p.id).slice(0, 8).map((k) => uyeOzeti(b.guild, k.kullaniciId)),
      })),
    }),
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/promo',
    yonetici: true,
    sistemsiz: true,
    calistir(b) {
      const sureMs = sureAyristir(metin(b.govde, 'sure', { uzunluk: 8 }));
      if (sureMs === null) hata('Süreyi anlayamadım. Örnek: `1sa`, `30dk`, `1g`.');
      const sinirHam = b.govde.sinir;
      const sinir = sinirHam === null || sinirHam === undefined || sinirHam === '' ? null : Number(sinirHam);
      const sonuc = basarili(promoOlustur(b.db, {
        guildId: b.guildId,
        kod: metin(b.govde, 'kod', { uzunluk: 40 }),
        odul: Number(b.govde.odul),
        sinir,
        sureMs,
        olusturanId: b.kullaniciId,
      }));
      return { id: sonuc.id, kod: sonuc.kod, bitis: sonuc.bitis };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/yonetim/promo/bitir',
    yonetici: true,
    sistemsiz: true,
    calistir(b) {
      const id = Number(b.govde.id);
      if (!Number.isSafeInteger(id)) hata('`id` geçersiz.');
      basarili(promoBitir(b.db, b.guildId, id));
      return { ok: true };
    },
  },
];
