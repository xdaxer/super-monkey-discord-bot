/**
 * Sosyal alan: düello (zar, yazı-tura, at yarışı), XOX düellosu ve takas.
 * Kurallar lib/duello.js, lib/xox.js ve lib/takas.js'tedir; burada slash
 * komutlarla (commands/ekonomi/duello.js, takas.js) ve düğme bileşenleriyle
 * (lib/*-bilesen.js) aynı çağrılar aynı sırada yapılır.
 *
 * Etkileşim: slash akışında meydan okuma/teklif kanala mesaj olarak gider.
 * Web'de kanal yoktur; bu yüzden kayıt yine lib'e (DB) yazılır ve karşı taraf
 * kendi Activity'sinde "Gelen" listesinde görür. Ayrıca `ekonomi.kanallar`
 * listesinin ilk kanalı varsa slash komutun gönderdiğiyle AYNI mesaj
 * (aynı gömü, aynı düğmeler) oraya da gönderilir ve DB kaydına bağlanır; böylece
 * Discord düğmeleri de çalışır, web işlemleri de o mesajı günceller. Kanal yoksa
 * ya da gönderim başarısızsa iş sessizce yalnız web'de kalır.
 */

import { ayarGetir } from '../../lib/ayarlar.js';
import { PINGSIZ } from '../../lib/bicim.js';
import {
  DUELLO_SURE_MS, duelloAc, duelloBahisKontrol, duelloGetir, duelloIptal, duelloKabul, havuzHesapla, KASA_PAYI_YUZDE,
  mesajIdKaydet, rakipKontrol, secimBelirle, suresiDolaniIadeEt,
} from '../../lib/duello.js';
import {
  duelloButonlari, kapaliGomu, meydanGomusu, sonucGomusu,
} from '../../lib/duello-bilesen.js';
import {
  bakiye as bakiyeOku, miktarAyristir, TRANSFER_MIN, TURLER,
} from '../../lib/ekonomi.js';
import { emojiCozucu } from '../../lib/kasa-bilesen.js';
import { kartGetir } from '../../lib/kasalar.js';
import { BORC_YASAK, borcluMu } from '../../lib/kredi.js';
import { BAHIS_MIN, bahisTavani } from '../../lib/kumar.js';
import { kullaniciGetir } from '../../lib/seviye.js';
import {
  ACIK_SINIRI, ADET_SINIRI, esyaAdi, esyaNesnesi, geriCek, kabulEt, mesajBagla, reddet, SURE_MS,
  suresiDolanlariKapat, takasEsyalari, teklifGetir, teklifOlustur,
} from '../../lib/takas.js';
import { takasButonlari, takasGomusu } from '../../lib/takas-bilesen.js';
import {
  siradakiId, XOX_HAMLE_SURE_MS, xoxGetir, xoxHamle, xoxKabul, xoxPes, xoxSuresiDolaniBitir,
} from '../../lib/xox.js';
import { xoxGomusu, xoxTahtasi } from '../../lib/xox-bilesen.js';
import { uyeOzeti } from '../gorsel.js';
import {
  basarili, hata, kimlikMi, metin, tamSayi,
} from '../yardimci.js';

const OYUNLAR = ['zar', 'yazitura', 'at', 'xox'];
const ISARET = { X: '❌', O: '⭕' };
/** Discord isteklerine tanınan en çok süre; takılırsa web işlemi yine de biter. */
const DISCORD_ZAMAN_ASIMI_MS = 4000;
/** Biten XOX oyunlarının sonucu (rakibin son hamlesini yoklayan taraf görsün) bu kadar tutulur. */
const BITEN_TUTMA_MS = 15 * 60_000;
const SON_SONUC_ADEDI = 8;
const GECMIS_PENCERESI_MS = 7 * 24 * 3600_000;

// ── Discord yardımcıları (hepsi en iyi çaba: hata atmaz) ───────────────────

function zamanAsimli(vaat) {
  let sayac;
  const asim = new Promise((coz) => { sayac = setTimeout(() => coz(null), DISCORD_ZAMAN_ASIMI_MS); });
  return Promise.race([vaat, asim]).finally(() => clearTimeout(sayac));
}

/**
 * `ekonomi.kanallar` listesinin ilk kanalı (yazılabilirse); yoksa null.
 * `yedekAyar`: liste boşsa bakılacak tek kanallık ayar (düello daveti
 * öne çıkanlar kanalına, `ekonomi.akisKanal`, düşer ki rakip etiketlensin).
 */
async function ekonomiKanali(b, { yedekAyar = null } = {}) {
  try {
    const liste = ayarGetir(b.db, b.guildId, 'ekonomi.kanallar');
    const kimlik = (Array.isArray(liste) ? liste[0] : null) ?? (yedekAyar ? ayarGetir(b.db, b.guildId, yedekAyar) : null);
    if (!kimlik || !b.client?.channels?.fetch) return null;
    const kanal = await zamanAsimli(b.client.channels.fetch(String(kimlik)).catch(() => null));
    return kanal?.send ? kanal : null;
  } catch {
    return null;
  }
}

/** Kanala mesaj gönderir; başarısızsa null. */
async function mesajGonder(kanal, icerik) {
  if (!kanal) return null;
  try {
    return await zamanAsimli(kanal.send(icerik));
  } catch {
    return null;
  }
}

/** Var olan mesajı düzenler (düğmeler ve gömü slash akışındakiyle aynı). */
async function mesajDuzenle(client, kanalId, mesajId, icerik) {
  if (!kanalId || !mesajId || !client?.channels?.fetch) return;
  try {
    await zamanAsimli((async () => {
      const kanal = await client.channels.fetch(String(kanalId));
      const mesaj = await kanal?.messages?.fetch?.(String(mesajId));
      await mesaj?.edit?.(icerik);
    })().catch(() => null));
  } catch {
    // Mesaj silinmiş ya da erişilemiyor olabilir; asıl işlem DB'de yapıldı.
  }
}

// ── Doğrulamalar ───────────────────────────────────────────────────────────

/** Karşı taraf bu sunucunun üyesi olmalı (slash'ta Discord seçici sağlar). */
async function uyeBul(b, id, ad = 'Üye') {
  if (!kimlikMi(id)) hata(`${ad} geçersiz.`);
  const uye = await b.guild?.members.fetch(id).catch(() => null);
  if (!uye) hata(`${ad} bu sunucunun üyesi değil.`);
  return uye;
}

/** Slash `bahisCoz` ile aynı: iki tarafın seviye tavanının küçüğü, "hepsi/yarı" tavana kırpılır. */
function bahisCoz(b, rakipId) {
  const { db, guildId, kullaniciId } = b;
  const mevcut = bakiyeOku(db, guildId, kullaniciId);
  const ayar = ayarGetir(db, guildId, 'ekonomi.maksBahis');
  const maks = Math.min(
    bahisTavani(kullaniciGetir(db, guildId, kullaniciId).seviye, ayar),
    bahisTavani(kullaniciGetir(db, guildId, rakipId).seviye, ayar),
  );
  const ham = metin(b.govde, 'bahis', { uzunluk: 20 });

  const ayrisan = basarili(miktarAyristir(ham, mevcut));
  const goreli = !/\d/.test(ham);
  const miktar = goreli ? Math.min(ayrisan.miktar, maks) : ayrisan.miktar;
  basarili(duelloBahisKontrol(miktar, mevcut, maks));
  return miktar;
}

// ── Veri biçimleri ─────────────────────────────────────────────────────────

function duelloVerisi(b, d) {
  const { kazanc, kasa, havuz } = havuzHesapla(d.bahis);
  return {
    id: d.id,
    meydan: uyeOzeti(b.guild, d.meydanId),
    rakip: uyeOzeti(b.guild, d.rakipId),
    bahis: d.bahis,
    oyun: d.oyun,
    secim: d.secim,
    olusturma: d.olusturma,
    bitis: d.bitis,
    kazanc,
    kasa,
    havuz,
    discordda: Boolean(d.mesajId),
  };
}

/** Takasın bir kalemi: eşya (görselli) ve adedi; yoksa null. */
function kalemVerisi(b, kimlik, kac) {
  if (!kimlik) return null;
  const kart = kartGetir(kimlik);
  return {
    kimlik,
    ad: esyaAdi(kimlik),
    adet: kac,
    nadirlik: kart?.nadirlik ?? null,
    parlak: Boolean(kart?.parlak),
    gorsel: b.gorsel(esyaNesnesi(kimlik)),
  };
}

function teklifVerisi(b, t) {
  return {
    id: t.id,
    eden: uyeOzeti(b.guild, t.tekliEdenId),
    karsi: uyeOzeti(b.guild, t.karsiId),
    // Teklif edenin verdiği ve karşıdan istediği.
    ver: { esya: kalemVerisi(b, t.verEsya, t.verAdet), muz: t.muzVer },
    iste: { esya: kalemVerisi(b, t.isteEsya, t.isteAdet), muz: t.muzIste },
    durum: t.durum,
    olusturma: t.olusturma,
    bitis: t.bitis,
    discordda: Boolean(t.mesajId),
  };
}

function xoxVerisi(b, o) {
  const { kazanc } = havuzHesapla(o.bahis);
  return {
    id: o.id,
    x: uyeOzeti(b.guild, o.xId),
    o: uyeOzeti(b.guild, o.oId),
    bahis: o.bahis,
    kazanc,
    tahta: o.tahta,
    sira: o.sira,
    siradakiId: siradakiId(o),
    sonHamle: o.sonHamle,
    bitisMs: o.sonHamle + XOX_HAMLE_SURE_MS,
    sureMs: XOX_HAMLE_SURE_MS,
    ben: o.xId === b.kullaniciId ? 'X' : 'O',
  };
}

function xoxBitisVerisi(b, bitti) {
  return {
    sebep: bitti.sebep,
    kazananId: bitti.kazananId,
    kaybedenId: bitti.kaybedenId,
    kazanc: bitti.kazanc,
    kasa: bitti.kasa,
    havuz: bitti.havuz,
    cizgi: bitti.cizgi ?? null,
    benKazandi: bitti.kazananId === b.kullaniciId,
    berabere: bitti.kazananId === null,
  };
}

// ── XOX: biten oyunlar ve Discord mesajları (bellek) ───────────────────────

/** id → {oyun, bitti, zaman}. xox_oyunlari kaydı bitince silindiği için sonucu burada tutarız. */
const bitenOyunlar = new Map();
/** id → {kanalId, mesajId}: web'den kabul edilen XOX'un meydan okuma mesajı (tahta oraya çizilir). */
const xoxMesajlari = new Map();

function bitenKaydet(oyun, bitti) {
  const simdi = Date.now();
  for (const [id, k] of bitenOyunlar) if (simdi - k.zaman > BITEN_TUTMA_MS) bitenOyunlar.delete(id);
  bitenOyunlar.set(oyun.id, { oyun, bitti, zaman: simdi });
  xoxMesajlari.delete(oyun.id);
}

function xoxBitisMesaji(db, oyun, bitti) {
  const bakiyeler = { x: bakiyeOku(db, oyun.guildId, oyun.xId), o: bakiyeOku(db, oyun.guildId, oyun.oId) };
  return {
    content: '', embeds: [xoxGomusu(oyun, { bitti, bakiyeler })], components: xoxTahtasi(oyun, bitti), ...PINGSIZ,
  };
}

function xoxSuruyorMesaji(oyun) {
  return {
    content: `<@${siradakiId(oyun)}>, sıra sende (${ISARET[oyun.sira]}).`,
    embeds: [xoxGomusu(oyun)],
    components: xoxTahtasi(oyun),
    allowedMentions: { users: [siradakiId(oyun)] },
  };
}

/** Oyunun Discord mesajını (biliniyorsa) güncel haline getirir. */
function xoxMesajiniGuncelle(b, oyun, bitti) {
  const mesaj = xoxMesajlari.get(oyun.id);
  if (!mesaj) return Promise.resolve();
  return mesajDuzenle(
    b.client, mesaj.kanalId, mesaj.mesajId,
    bitti ? xoxBitisMesaji(b.db, oyun, bitti) : xoxSuruyorMesaji(oyun),
  );
}

/**
 * Hamle süresi zamanlayıcısı (lib/xox-bilesen.js'teki gibi): her değişimde yenisi
 * kurulur, eskisi çalıştığında süre dolmamış olur ve bir şey yapmaz. Web'de iki
 * taraf da çevrimdışı kalsa bile hükmen bitiş ve iade gerçekleşsin.
 */
function xoxZamanlayici(b, id) {
  const { db, client } = b;
  setTimeout(async () => {
    try {
      const sonuc = xoxSuresiDolaniBitir(db, id);
      if (!sonuc) return;
      const mesaj = xoxMesajlari.get(id);
      bitenKaydet(sonuc.oyun, sonuc.bitti);
      if (mesaj) await mesajDuzenle(client, mesaj.kanalId, mesaj.mesajId, xoxBitisMesaji(db, sonuc.oyun, sonuc.bitti));
    } catch (e) {
      console.error('XOX süre aşımı işlenemedi:', e.message);
    }
  }, XOX_HAMLE_SURE_MS + 500).unref();
}

// ── Süre dolumu temizliği ──────────────────────────────────────────────────

/**
 * Kullanıcının süresi dolan düello/XOX/takas kayıtlarını lib'in fonksiyonlarıyla
 * kapatır (emanet iade edilir) ve Discord mesajlarını kapatır. GET'lerde çağrılır;
 * mesaj düzenlemeleri beklenmez.
 */
function sureleriIsle(b, simdi = Date.now()) {
  const { db, guildId, kullaniciId } = b;

  const duellolar = db
    .prepare('SELECT id FROM duello_meydanlari WHERE guild_id = ? AND bitis <= ? AND (meydan_id = ? OR rakip_id = ?)')
    .all(guildId, simdi, kullaniciId, kullaniciId);
  for (const { id } of duellolar) {
    const iade = suresiDolaniIadeEt(db, id, simdi);
    if (iade) {
      void mesajDuzenle(b.client, iade.kanalId, iade.mesajId, {
        content: '', embeds: [kapaliGomu(iade, 'süre doldu')], components: [], ...PINGSIZ,
      });
    }
  }

  const emoji = emojiCozucu(b.guild);
  for (const t of suresiDolanlariKapat(db, simdi)) {
    if (t.guildId !== String(guildId)) continue;
    void mesajDuzenle(b.client, t.kanalId, t.mesajId, { embeds: [takasGomusu(t, emoji)], components: [] });
  }

  const oyunlar = db
    .prepare('SELECT id FROM xox_oyunlari WHERE guild_id = ? AND (x_id = ? OR o_id = ?)')
    .all(guildId, kullaniciId, kullaniciId);
  for (const { id } of oyunlar) xoxSuresiniIsle(b, id, simdi);
}

function xoxSuresiniIsle(b, id, simdi = Date.now()) {
  const sonuc = xoxSuresiDolaniBitir(b.db, id, simdi);
  if (!sonuc) return null;
  void xoxMesajiniGuncelle(b, sonuc.oyun, sonuc.bitti);
  bitenKaydet(sonuc.oyun, sonuc.bitti);
  return sonuc;
}

// ── Listeler ───────────────────────────────────────────────────────────────

function benimDuellolarim(b) {
  const { db, guildId, kullaniciId } = b;
  const satirlar = db
    .prepare('SELECT id FROM duello_meydanlari WHERE guild_id = ? AND (meydan_id = ? OR rakip_id = ?) ORDER BY id DESC')
    .all(guildId, kullaniciId, kullaniciId);
  const liste = satirlar.map(({ id }) => duelloGetir(db, id)).filter(Boolean);
  return {
    gelen: liste.filter((d) => d.rakipId === kullaniciId).map((d) => duelloVerisi(b, d)),
    giden: liste.filter((d) => d.meydanId === kullaniciId).map((d) => duelloVerisi(b, d)),
  };
}

function benimTekliflerim(b, simdi = Date.now()) {
  const { db, guildId, kullaniciId } = b;
  const satirlar = db
    .prepare(
      `SELECT id FROM takas_teklifleri
       WHERE guild_id = ? AND durum = 'acik' AND bitis > ? AND (teklif_eden = ? OR karsi_id = ?) ORDER BY id DESC`,
    )
    .all(guildId, simdi, kullaniciId, kullaniciId);
  const liste = satirlar.map(({ id }) => teklifGetir(db, id)).filter(Boolean);
  return {
    gelen: liste.filter((t) => t.karsiId === kullaniciId).map((t) => teklifVerisi(b, t)),
    giden: liste.filter((t) => t.tekliEdenId === kullaniciId).map((t) => teklifVerisi(b, t)),
  };
}

function benimOyunlarim(b) {
  const { db, guildId, kullaniciId } = b;
  return db
    .prepare('SELECT id FROM xox_oyunlari WHERE guild_id = ? AND (x_id = ? OR o_id = ?) ORDER BY id DESC')
    .all(guildId, kullaniciId, kullaniciId)
    .map(({ id }) => xoxGetir(db, id))
    .filter(Boolean)
    .map((o) => xoxVerisi(b, o));
}

function esyaListesi(b, sahipId) {
  return takasEsyalari(b.db, b.guildId, sahipId)
    .map((e) => kalemVerisi(b, e.kimlik, e.adet))
    .sort((x, y) => x.ad.localeCompare(y.ad, 'tr'));
}

/**
 * Son düello sonuçları. Defterde düello galibiyeti `kazanc` türünde ve karşı
 * tarafı sayısal `karsi_id` olan satırdır (başarımlar da böyle sayar); beraberlik
 * ve iadeler sonuç sayılmaz. Kaybı görmek için rakibin kazancına bakılır; sorgu
 * indeks aralığıyla sınırlı kalsın diye son 7 gün taranır.
 */
function sonSonuclar(b, simdi = Date.now()) {
  const satirlar = b.db
    .prepare(
      `SELECT kullanici_id, karsi_id, miktar, zaman FROM ekonomi_hareketleri
       WHERE guild_id = ? AND tur = ? AND zaman > ? AND karsi_id GLOB '[0-9]*'
         AND (kullanici_id = ? OR karsi_id = ?)
       ORDER BY zaman DESC, id DESC LIMIT ?`,
    )
    .all(b.guildId, TURLER.kazanc, simdi - GECMIS_PENCERESI_MS, b.kullaniciId, b.kullaniciId, SON_SONUC_ADEDI);
  return satirlar.map((s) => ({
    kazanan: uyeOzeti(b.guild, s.kullanici_id),
    kaybeden: uyeOzeti(b.guild, s.karsi_id),
    kazanc: s.miktar,
    zaman: s.zaman,
    benKazandi: s.kullanici_id === b.kullaniciId,
  }));
}

function sonTeklifler(b) {
  return b.db
    .prepare(
      `SELECT id FROM takas_teklifleri
       WHERE guild_id = ? AND durum <> 'acik' AND (teklif_eden = ? OR karsi_id = ?) ORDER BY id DESC LIMIT 5`,
    )
    .all(b.guildId, b.kullaniciId, b.kullaniciId)
    .map(({ id }) => teklifGetir(b.db, id))
    .map((t) => teklifVerisi(b, t));
}

// ── Düello eylemleri ───────────────────────────────────────────────────────

/** Kabul sonucunu (zar/yazı-tura/at) ön yüz verisine çevirir. */
function duelloSonucVerisi(b, s) {
  const { duello, sonuc } = s;
  return {
    oyun: duello.oyun,
    secim: duello.secim,
    bahis: duello.bahis,
    meydan: uyeOzeti(b.guild, duello.meydanId),
    rakip: uyeOzeti(b.guild, duello.rakipId),
    zarlar: duello.oyun === 'zar' ? { meydan: sonuc.meydan, rakip: sonuc.rakip } : null,
    para: duello.oyun === 'yazitura' ? sonuc.sonuc : null,
    kazanan: sonuc.kazanan ?? null,
    kazananId: s.kazananId,
    kaybedenId: s.kaybedenId,
    kazanc: s.kazanc,
    kasa: s.kasa,
    havuz: s.havuz,
    benKazandi: s.kazananId === b.kullaniciId,
    berabere: s.kazananId === null,
  };
}

/** Bekleyen kaydı bulur; başka sunucunun kaydına dokunulmasın. */
function duelloBul(b) {
  const id = Number(b.params.id);
  if (!Number.isSafeInteger(id)) hata('Bu meydan okuma artık geçerli değil.', 404);
  return { id, duello: duelloGetir(b.db, id) };
}

const duelloRotalari = [
  {
    yontem: 'POST',
    yol: '/api/duello/ac',
    async calistir(b) {
      const { db, guildId, kullaniciId } = b;
      const rakipId = metin(b.govde, 'rakipId', { uzunluk: 25 });
      const uye = await uyeBul(b, rakipId, 'Rakip');

      if (borcluMu(db, guildId, kullaniciId)) hata(BORC_YASAK);
      basarili(rakipKontrol(kullaniciId, uye.user ?? { id: uye.id, bot: false }));
      const bahis = bahisCoz(b, rakipId);

      const oyun = metin(b.govde, 'oyun', { uzunluk: 10 });
      if (!OYUNLAR.includes(oyun)) hata('Bilinmeyen oyun.');
      const secim = oyun === 'yazitura' ? secimBelirle(b.govde.secim) : null;

      // Kanal yoksa kayıt yine açılır; kanal_id boş kalır ve yalnız web'de görünür.
      const kanal = await ekonomiKanali(b, { yedekAyar: 'ekonomi.akisKanal' });
      const acilan = basarili(duelloAc(db, {
        guildId, kanalId: kanal?.id ?? '', meydanId: kullaniciId, rakipId, bahis, oyun, secim,
      }));
      const { duello } = acilan;

      const mesaj = await mesajGonder(kanal, {
        content: `<@${rakipId}>`,
        embeds: [meydanGomusu(duello)],
        components: [duelloButonlari(duello.id)],
        allowedMentions: { users: [rakipId] },
      });
      if (mesaj?.id) mesajIdKaydet(db, duello.id, mesaj.id);

      // Süre dolunca emanet iade edilir ve (varsa) mesaj kapatılır; web'de kimse bakmasa da.
      setTimeout(async () => {
        try {
          const iade = suresiDolaniIadeEt(db, duello.id);
          if (!iade) return;
          await mesajDuzenle(b.client, iade.kanalId, mesaj?.id, {
            content: '', embeds: [kapaliGomu(iade, 'süre doldu')], components: [], ...PINGSIZ,
          });
        } catch (e) {
          console.error('Düello süre aşımı işlenemedi:', e.message);
        }
      }, DUELLO_SURE_MS + 500).unref();

      return { duello: duelloVerisi(b, { ...duello, mesajId: mesaj?.id ?? null }), bakiye: acilan.bakiye };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/duello/:id/kabul',
    async calistir(b) {
      const { db, guildId, kullaniciId } = b;
      const { id, duello } = duelloBul(b);
      if (!duello || duello.guildId !== guildId) hata('Bu meydan okuma artık geçerli değil.', 404);
      if (borcluMu(db, guildId, kullaniciId)) hata(BORC_YASAK);

      const s = duello.oyun === 'xox' ? xoxKabul(db, { id, kullaniciId }) : duelloKabul(db, { id, kullaniciId });
      if (!s.ok) {
        // Süre dolmuş/geçersiz: bileşendeki gibi mesajı kapat.
        if (s.gecersiz) {
          await mesajDuzenle(b.client, duello.kanalId, duello.mesajId, {
            content: '', embeds: [kapaliGomu(duello, 'süresi doldu')], components: [], ...PINGSIZ,
          });
        }
        basarili(s);
      }

      if (s.oyun) {
        if (duello.mesajId && duello.kanalId) xoxMesajlari.set(s.oyun.id, { kanalId: duello.kanalId, mesajId: duello.mesajId });
        await xoxMesajiniGuncelle(b, s.oyun, null);
        xoxZamanlayici(b, s.oyun.id);
        return { xox: { oyun: xoxVerisi(b, s.oyun), bitti: null }, bakiye: bakiyeOku(db, guildId, kullaniciId) };
      }

      const bakiyeler = {
        meydan: bakiyeOku(db, guildId, duello.meydanId),
        rakip: bakiyeOku(db, guildId, duello.rakipId),
      };
      await mesajDuzenle(b.client, duello.kanalId, duello.mesajId, {
        content: '', embeds: [sonucGomusu(s, bakiyeler)], components: [], ...PINGSIZ,
      });
      return { sonuc: duelloSonucVerisi(b, s), bakiye: bakiyeOku(db, guildId, kullaniciId) };
    },
  },
  ...[
    { yol: 'reddet', tur: 'red', durum: 'rakip reddetti' },
    { yol: 'geri-cek', tur: 'geri', durum: 'meydan okuyan geri çekti' },
  ].map(({ yol, tur, durum }) => ({
    yontem: 'POST',
    yol: `/api/duello/:id/${yol}`,
    async calistir(b) {
      const { id, duello } = duelloBul(b);
      if (!duello || duello.guildId !== b.guildId) hata('Bu meydan okuma artık geçerli değil.', 404);
      basarili(duelloIptal(b.db, { id, kullaniciId: b.kullaniciId, tur }));
      await mesajDuzenle(b.client, duello.kanalId, duello.mesajId, {
        content: '', embeds: [kapaliGomu(duello, durum)], components: [], ...PINGSIZ,
      });
      return { bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId) };
    },
  })),
];

// ── XOX eylemleri ──────────────────────────────────────────────────────────

/** Oyuncu olmayan göremez; gizli bir şey yok ama oyuna karışmasın. */
function oyuncuMu(oyun, kullaniciId) {
  return oyun.xId === kullaniciId || oyun.oId === kullaniciId;
}

/** XOX yanıtı: süren ya da bitmiş oyun. */
function xoxYaniti(b, oyun, bitti) {
  return {
    oyun: xoxVerisi(b, oyun),
    bitti: bitti ? xoxBitisVerisi(b, bitti) : null,
    bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId),
  };
}

function xoxBul(b) {
  const id = Number(b.params.id);
  if (!Number.isSafeInteger(id)) hata('Bu oyun bitmiş.', 404);
  return id;
}

/** Hamle/pes sonucunu (lib'den) yanıta çevirir, mesajı günceller, zamanlayıcıyı kurar. */
async function xoxSonucu(b, s) {
  basarili(s);
  if (s.bitti) {
    await xoxMesajiniGuncelle(b, s.oyun, s.bitti);
    bitenKaydet(s.oyun, s.bitti);
    return xoxYaniti(b, s.oyun, s.bitti);
  }
  await xoxMesajiniGuncelle(b, s.oyun, null);
  xoxZamanlayici(b, s.oyun.id);
  return xoxYaniti(b, s.oyun, null);
}

const xoxRotalari = [
  {
    yontem: 'GET',
    yol: '/api/xox/:id',
    calistir(b) {
      const id = xoxBul(b);
      const oyun = xoxGetir(b.db, id);
      if (oyun) {
        if (oyun.guildId !== b.guildId || !oyuncuMu(oyun, b.kullaniciId)) hata('Bu oyunda değilsin.', 403);
        const bitis = xoxSuresiniIsle(b, id);
        return bitis ? xoxYaniti(b, bitis.oyun, bitis.bitti) : xoxYaniti(b, oyun, null);
      }
      // Oyun DB'den silinmiş: sonucu bellekte varsa ver, yoksa (Discord'da bitmiş olabilir) sadece bittiğini söyle.
      const biten = bitenOyunlar.get(id);
      if (biten) {
        if (!oyuncuMu(biten.oyun, b.kullaniciId)) hata('Bu oyunda değilsin.', 403);
        return xoxYaniti(b, biten.oyun, biten.bitti);
      }
      return { oyun: null, bitti: null, yok: true, bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId) };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/xox/:id/hamle',
    async calistir(b) {
      const id = xoxBul(b);
      const hucre = tamSayi(b.govde, 'hucre', { min: 0, max: 8 });
      return xoxSonucu(b, xoxHamle(b.db, { id, kullaniciId: b.kullaniciId, hucre }));
    },
  },
  {
    yontem: 'POST',
    yol: '/api/xox/:id/pes',
    async calistir(b) {
      const id = xoxBul(b);
      return xoxSonucu(b, xoxPes(b.db, { id, kullaniciId: b.kullaniciId }));
    },
  },
];

// ── Takas eylemleri ────────────────────────────────────────────────────────

/** Teklif sonucunu Discord mesajına yansıtır (komuttaki düğme bileşeniyle aynı gömü). */
function takasMesajiniGuncelle(b, teklif, sonuc, ek = null) {
  return mesajDuzenle(b.client, teklif.kanalId, teklif.mesajId, {
    content: `<@${teklif.tekliEdenId}> <@${teklif.karsiId}>`,
    embeds: [takasGomusu(sonuc, emojiCozucu(b.guild), ek)],
    components: [],
    allowedMentions: { parse: [] },
  });
}

function teklifBul(b) {
  const teklif = teklifGetir(b.db, b.params.id);
  if (!teklif || teklif.guildId !== String(b.guildId)) hata('Bu teklif bulunamadı.', 404);
  return teklif;
}

const takasRotalari = [
  {
    yontem: 'GET',
    yol: '/api/takas/esyalar/:uyeId',
    async calistir(b) {
      await uyeBul(b, b.params.uyeId, 'Üye');
      return { esyalar: esyaListesi(b, b.params.uyeId) };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/takas/teklif',
    async calistir(b) {
      const { db, guildId, kullaniciId } = b;
      const uyeId = metin(b.govde, 'uyeId', { uzunluk: 25 });
      const uye = await uyeBul(b, uyeId, 'Üye');
      if (uye.user?.bot) hata('Botlarla takas yapamazsın.');

      const muzVer = tamSayi(b.govde, 'muzVer', { zorunlu: false, min: 0, max: 1_000_000_000, varsayilan: 0 });
      const muzIste = tamSayi(b.govde, 'muzIste', { zorunlu: false, min: 0, max: 1_000_000_000, varsayilan: 0 });
      if (muzVer > 0 && borcluMu(db, guildId, kullaniciId)) hata(BORC_YASAK);

      // Bakım: süresi dolanları kapat ki açık teklif sınırı doğru sayılsın.
      suresiDolanlariKapat(db);

      const sonuc = basarili(teklifOlustur(db, {
        guildId,
        tekliEdenId: kullaniciId,
        karsiId: uyeId,
        verEsya: metin(b.govde, 'ver', { zorunlu: false, uzunluk: 60 }),
        verAdet: tamSayi(b.govde, 'verAdet', { zorunlu: false, min: 1, max: ADET_SINIRI, varsayilan: 1 }),
        isteEsya: metin(b.govde, 'iste', { zorunlu: false, uzunluk: 60 }),
        isteAdet: tamSayi(b.govde, 'isteAdet', { zorunlu: false, min: 1, max: ADET_SINIRI, varsayilan: 1 }),
        muzVer,
        muzIste,
      }));
      let { teklif } = sonuc;

      const mesaj = await mesajGonder(await ekonomiKanali(b), {
        content: `<@${uyeId}>, <@${kullaniciId}> sana bir takas teklif etti.`,
        embeds: [takasGomusu(teklif, emojiCozucu(b.guild))],
        components: [takasButonlari(teklif.id)],
        allowedMentions: { users: [uyeId] },
      });
      if (mesaj?.id) {
        mesajBagla(db, teklif.id, mesaj.channelId ?? mesaj.channel?.id, mesaj.id);
        teklif = teklifGetir(db, teklif.id);
      }

      // Süre dolunca (varsa) mesajı kapat; yeniden başlatmada kaybolur, liste yine de temizler.
      setTimeout(async () => {
        const guncel = teklifGetir(db, teklif.id);
        if (guncel?.durum !== 'acik') return;
        suresiDolanlariKapat(db);
        await mesajDuzenle(b.client, guncel.kanalId, guncel.mesajId, {
          embeds: [takasGomusu({ ...guncel, durum: 'suresi' }, emojiCozucu(b.guild))], components: [],
        });
      }, SURE_MS + 1000).unref();

      return { teklif: teklifVerisi(b, teklif), bakiye: bakiyeOku(db, guildId, kullaniciId) };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/takas/:id/kabul',
    async calistir(b) {
      const { db, guildId, kullaniciId } = b;
      const teklif = teklifBul(b);
      const seviyeOku = (k) => kullaniciGetir(db, guildId, k).seviye;
      const sonuc = kabulEt(db, {
        id: teklif.id,
        kullaniciId,
        seviyeler: { [teklif.tekliEdenId]: seviyeOku(teklif.tekliEdenId), [teklif.karsiId]: seviyeOku(teklif.karsiId) },
        vergiYuzde: ayarGetir(db, guildId, 'ekonomi.vergiYuzde'),
      });
      if (!sonuc.ok) {
        // Süre dolduysa mesajı da kapat (bileşendeki gibi).
        if (sonuc.durum === 'suresi') await takasMesajiniGuncelle(b, teklif, { ...teklif, durum: 'suresi' });
        basarili(sonuc);
      }
      const vergi = sonuc.vergiVer + sonuc.vergiIste;
      await takasMesajiniGuncelle(b, teklif, sonuc.teklif, vergi > 0 ? `-# Toplam ${vergi} vergi kesildi.` : null);
      return { teklif: teklifVerisi(b, sonuc.teklif), vergi, bakiye: bakiyeOku(db, guildId, kullaniciId) };
    },
  },
  ...[
    { yol: 'reddet', calis: reddet },
    { yol: 'geri-cek', calis: geriCek },
  ].map(({ yol, calis }) => ({
    yontem: 'POST',
    yol: `/api/takas/:id/${yol}`,
    async calistir(b) {
      const teklif = teklifBul(b);
      const sonuc = calis(b.db, { id: teklif.id, kullaniciId: b.kullaniciId });
      if (!sonuc.ok) {
        if (sonuc.durum === 'suresi') await takasMesajiniGuncelle(b, teklif, { ...teklif, durum: 'suresi' });
        basarili(sonuc);
      }
      await takasMesajiniGuncelle(b, teklif, sonuc.teklif);
      return { teklif: teklifVerisi(b, sonuc.teklif), bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId) };
    },
  })),
];

// ── Ortak liste ────────────────────────────────────────────────────────────

export const rotalar = [
  {
    // Gelen düello davetleri (Activity birkaç saniyede bir yoklar; yeni davette pencere ve ses).
    yontem: 'GET',
    yol: '/api/davetler',
    calistir(b) {
      const simdi = Date.now();
      return { duellolar: benimDuellolarim(b).gelen.filter((d) => d.bitis > simdi) };
    },
  },
  {
    yontem: 'GET',
    yol: '/api/sosyal',
    calistir(b) {
      const { db, guildId, kullaniciId } = b;
      sureleriIsle(b);
      const seviye = kullaniciGetir(db, guildId, kullaniciId).seviye;
      const maksAyar = ayarGetir(db, guildId, 'ekonomi.maksBahis');
      const duellolar = benimDuellolarim(b);
      return {
        bakiye: bakiyeOku(db, guildId, kullaniciId),
        borclu: borcluMu(db, guildId, kullaniciId),
        duello: {
          ...duellolar,
          oyunlar: OYUNLAR,
          bahisMin: BAHIS_MIN,
          // Karşı tarafın tavanı da işler (ikisinin küçüğü); burada yalnız kendi tavanın.
          bahisTavani: bahisTavani(seviye, maksAyar),
          sureMs: DUELLO_SURE_MS,
          xoxHamleSureMs: XOX_HAMLE_SURE_MS,
          kasaPayiYuzde: KASA_PAYI_YUZDE,
        },
        xoxlar: benimOyunlarim(b),
        takas: {
          ...benimTekliflerim(b),
          esyalarim: esyaListesi(b, kullaniciId),
          sureMs: SURE_MS,
          acikSiniri: ACIK_SINIRI,
          adetSiniri: ADET_SINIRI,
          muzMin: TRANSFER_MIN,
          vergiYuzde: ayarGetir(db, guildId, 'ekonomi.vergiYuzde'),
        },
      };
    },
  },
  {
    yontem: 'GET',
    yol: '/api/sosyal/gecmis',
    calistir: (b) => ({ duellolar: sonSonuclar(b), takaslar: sonTeklifler(b) }),
  },
  ...duelloRotalari,
  ...xoxRotalari,
  ...takasRotalari,
];
