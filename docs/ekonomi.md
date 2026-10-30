# Seviye / XP tasarımı

Bu belge `T-EKONOMI-TASARIM` görevinin çıktısıdır. `app/lib/seviye.js` içindeki
sayılar buradaki tabloyla birebir aynı olmak zorundadır; biri değişirse diğeri de
değişmeli ve `T-SEVIYE` yeniden incelenmelidir. Para (muz) ekonomisi ayrı
belgede: [para.md](para.md).

## Kapsam

Bu turda **yalnız XP ve seviye** vardır. Para, günlük ödül, mağaza ve bakiye
transferi kapsam dışıdır.

Gerekçe: kullanıcı 2026-09-22 oturumunda dört iş seçti (talep, çekiliş, seviye/XP,
yedekleme) ve ekonomi tarafını istemedi. Ayrıca sunucuda zaten UnbelievaBoat
kurulu; para sistemini ikinci kez yazmak iki ayrı bakiye kaynağı doğurur. Para
gerekirse ayrı bir tur olarak ele alınır.

**2026-10-09 güncellemesi:** kullanıcı para ekonomisini ayrı bir tur olarak
istedi (OwO esinli ama birebir değil, hayvan sistemi yok, kumar var). Para
tasarımı [para.md](para.md) belgesinde. UnbelievaBoat
gerekçesi hâlâ geçerli olduğu için `ekonomi` sistemi **varsayılan kapalı**;
yönetici iki bakiyeyi bilerek açar.

## XP kazanma

| Kural | Değer |
| --- | --- |
| Mesaj başına XP | 15–25 arası rastgele tam sayı |
| Bekleme süresi (cooldown) | 60 saniye |
| Sayılan mesaj | Sunucu metin kanallarındaki insan mesajları |
| Sayılmayan | Bot mesajları, DM, slash komut etkileşimleri |
| Ses | Seste geçen her dakika için 5–10 XP, günde en çok 1.000 (aşağıda "Ses XP'si") |

Rastgele aralık, sabit XP'ye tercih edildi: sabit değerde bir kullanıcının kaç
mesaj attığı XP'den birebir geri hesaplanabiliyor ve sıralama saat gibi
öngörülebilir oluyor.

**Bekleme süresi neden 60 saniye:** XP'yi mesaj *sayısına* değil, sunucuda
geçirilen *zamana* bağlamak için. 60 saniye, sohbet eden birinin her dakika en az
bir mesaj yazmasıyla uyumlu; arka arkaya on mesaj atan biri ise tek mesaj kadar
XP alır. Daha kısa bir süre (ör. 15 sn) spam'i ödüllendirir, daha uzun bir süre
(ör. 5 dk) hareketli sohbette yazan kullanıcıyı cezalandırır.

Mesaj **içeriği okunmaz**: XP yalnız mesajın varlığına bakar, bu yüzden
`GuildMessages` intent'i yeter. İleride içeriğe bağlı bir kural eklenirse
(ör. "en az 5 kelime yaz") ayrıcalıklı `MessageContent` intent'i gerekir ve
bu belgeyle birlikte `SISTEMLER.seviye.gerekliIntent` de güncellenmelidir.

## Ses XP'si

Ses kanalında duran üye, `app/servisler/ses-xp.js` taramasıyla **dakikada bir**
**5–10 XP** alır (mesajla aynı üyelik/iksir/etkinlik çarpanlarıyla), bir Türkiye
gününde en çok **`seviye.sesXpGunluk`** kadar (varsayılan **1.000**, ≈ 2,5 saat;
`0` ses XP'sini kapatır). Tavana yaklaşınca son dakikanın XP'si kırpılır,
dolunca seste kalmak XP getirmez; mesaj XP'si tavandan etkilenmez. Sayaç
`ses_xp_gunluk` tablosunda kişi başı tek satırdır, gece yarısı (TR) sıfırlanır.
`/seviye bilgi` "Bugün sesten" satırında gösterir.

**Neden (2026-10-11):** başlangıçta ses mesajla aynı 15–25 XP'yi sınırsız
veriyordu (saatte ~1.200). Sıfırlamadan sonraki ilk günde bazı üyelerin XP'sinin
%90'ı sestendi (25 mesajla Sv 13); seviye ödülü muz + kasa ve seviyeye bağlı
sınırlar (bahis, kredi, banka, meslek) yüzünden pasif ses dolaylı muz basıyordu.
Yeni sayılarla yalnız sesle Sv 13 (~8.450 XP) ~7 saat yerine ~8–9 gün.

- Bekleme mesajla **ortaktır** (`son_kazanma`): aynı dakikada hem yazan hem seste
  duran yine tek XP alır; saatlik üst sınır değişmez. Ses turu zamanlayıcı
  kayması turu boşa düşürmesin diye 55 sn beklemeyle bakar.
- Kazanmayanlar: botlar, kulaklığı kapalı (kendi ya da sunucu) üyeler, AFK
  kanalındakiler. Kanalda kulaklığı açık **en az iki insan** yoksa kimse kazanmaz;
  tek başına bekleyerek XP kasılmasın. Kanalda **mikrofonu açık en az bir
  insan** olmalı: herkes susturulmuşsa (kendi ya da sunucu) kimse kazanmaz.
  Kişinin kendi mikrofonunun kapalı olması engel değildir.
- `seviye.kanallar` listesi yalnız metin kanallarını sınırlar, sesi etkilemez.
- Ses XP'si "Sayılan mesaj" sayacını artırmaz. Seviye atlama ödülü, kademe rolü
  ve duyuru mesajla aynıdır.
- `GuildVoiceStates` intent'i (ayrıcalıklı değil) zaten açıktır.

## Seviye eşikleri

`n` seviyesinden `n+1` seviyesine geçmek için gereken XP:

```
gereken(n) = ⌊(5 * n² + 50 * n + 100) / 2⌋
```

İlk on seviyenin toplam (kümülatif) XP karşılığı:

| Seviye | Bu seviye için gereken | Toplam XP |
| ---: | ---: | ---: |
| 1 | 50 | 50 |
| 2 | 77 | 127 |
| 3 | 110 | 237 |
| 4 | 147 | 384 |
| 5 | 190 | 574 |
| 6 | 237 | 811 |
| 7 | 290 | 1.101 |
| 8 | 347 | 1.448 |
| 9 | 410 | 1.858 |
| 10 | 477 | 2.335 |

Formül karesel: her seviye bir öncekinden pahalı, böylece sıralamanın tepesi
birkaç haftada donmaz. Ortalama 20 XP ve 60 saniye bekleme ile 10. seviye,
aktif sohbet eden bir üye için yaklaşık 117 "XP'li dakika" demektir.

**Eşik yarıya indirildi (2026-10-22).** Eski formül `5n² + 50n + 100` idi.
10–22 Ekim yedeklerine göre XP kazanan 88 üyenin günlük hızı: medyan 18,
%75'lik dilim 89, %90'lık dilim 368, en hızlı üye 2.349 XP. Eski eşikle
Simyacı (Sv 40, 145.700 XP) en hızlı üyeye bile ~2 ay, %90'lık dilime ~1 yıl
sürüyordu; "ilk Simyacı'ya ödül" duyurusu yapılmıştı. Yeni eşikte en hızlı üye
~13 günde, %90'lık dilim Medyum'a (Sv 25) ~2 ayda varır. Kayıtlı seviye XP'den
bağımsız tutulduğu için üye eşik değişiminden sonraki ilk XP'sinde yeni
seviyesine atlar: atlanan her seviye için kasa, son seviye için muz ödülü ve
duyuru o anda gelir (89 üye, toplam ~59.500 muz + 187 kasa). `/seviye
siralama` seviyeyi XP'den hesaplar, eski kayıt yanıltmaz.

## XP kanalları

`seviye.kanallar` boşsa XP her kanalda kazanılır. Doluysa XP yalnız bu
kanallarda ve thread'lerinde kazanılır (bu sunucuda `・💬・genel-sohbet`).
Ekleme/çıkarma: `/ayar kanal-ekle|kanal-cikar anahtar:seviye.kanallar kanal:#…`.
Sohbet muzu bu ayardan etkilenmez.

## Seviye atlama duyurusu

- Duyuru `seviye.kanal` ayarındaki kanala gider.
- Kanal ayarlanmamışsa **hiçbir şey gönderilmez** ve hata oluşmaz. Sessiz kalmak,
  seviye atlamalarını sohbetin ortasına düşürmekten iyidir; kanalı yönetici seçer.
- Metin `seviye.mesaj` ayarından okunur. Yer tutucular: `{kullanici}` (etiket),
  `{seviye}` (yeni seviye), `{sunucu}` (sunucu adı).
- Varsayılan: `🎉 {kullanici} seviye **{seviye}** oldu!`

## Seviye rolleri

`app/lib/seviye-rol.js` içindeki `KADEMELER` bu tabloyla birebir aynıdır.

| Seviye | Toplam XP | Rol | Renk | genel-sohbet'te açılan (kümülatif) |
| ---: | ---: | --- | --- | --- |
| 3 | 237 | Bumerang Maymunu | `#a9cce3` | dış çıkartma |
| 5 | 574 | Bomba Maymunu | `#5dade2` | + görsel/dosya |
| 10 | 2.335 | Ninja Maymun | `#48c9b0` | + thread açma, thread'e yazma, sesli mesaj |
| 15 | 5.909 | Büyücü Maymun | `#6c5ce7` | (ayrı görünür) |
| 25 | 20.994 | Medyum Maymun | `#c0e218` | (ayrı görünür) |
| 40 | 72.840 | Simyacı Maymun | `#ffd166` | (ayrı görünür) |

- Adlar BTD6 kulelerinden; mevcut rollerle (Süper Maymun, Muz Çiftliği,
  YouTube kademeleri) çakışmaz. Hepsinde sunucu geneli takma ad değiştirme açık.
- Üyede **yalnız en yüksek kademe** kalır; profiller temiz kalsın diye. Bu yüzden
  her rolün genel-sohbet izni kendi ve alt kademelerin toplamıdır.
- Açılan haklar `Okçu Maymun`'da genel-sohbet'te zaten kapalı olanlardır; kimse
  hak kaybetmez. Sv 5'te görselin açılması yeni hesapların resim/link spam'ini de keser.
- Eşikler 2026-10-09 verisiyle seçildi: sistem 17 gündür açık, 104 XP kaydı;
  kurulumda 9 Bumerang, 9 Bomba, 4 Ninja dağıtıldı. Karesel eşik nedeniyle
  Sv 40 en aktif üyede bile ~8 ay sürer. (2026-10-22'de eşik yarıya indi; yukarıya bak.)
- Bir kademenin rolü kurulmamışsa (ayar boş, rol silinmiş) üye kurulu olan en
  yüksek alt kademede kalır.

## YouTube üye bonusu

`sistem.uyelik` açıkken YouTube üyelik rolü olan üye, rastgele XP'nin üstüne
`uyelik.xpBonusYuzde` kadar (varsayılan %50, yuvarlanır) fazla alır. Bekleme
süresi aynı kalır; bonus yalnız mesaj başına miktarı büyütür.

Muz tarafında her Katıl kademesinin ayrı bonusu vardır; ayrıntı `docs/para.md`
→ "Katıl (YouTube üyelik) muz bonusu".

## Sistem kapalıyken

`sistem.seviye` kapalıyken hiç XP verilmez ve duyuru gönderilmez. Mevcut XP
kayıtları silinmez; sistem yeniden açıldığında kaldığı yerden devam eder.

