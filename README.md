# Süper Maymun

Tek bir sunucu için yazılmış, Türkçe, çok amaçlı bir Discord botu. Moderasyon,
destek talepleri ve seviye sistemi gibi sunucu işlerinin yanında, BTD6
(Bloons TD 6) temalı bir **muz ekonomisi** de içerir. Ekonominin tamamı bir
**Discord Activity** (Discord içinde açılan web arayüzü) üzerinden oynanır.

> Bot yalnız `.env` içindeki `guildID` sunucusunda çalışır. Başka bir sunucuya
> eklenirse kendiliğinden ayrılır. Çok sunuculu kullanım için tasarlanmadı.

## Özellikler

- **Sunucu yönetimi:** ban, kick, susturma, uyarı, toplu silme, AutoMod
  şablonları, ayarlanabilir log sistemi, otorol, karşılama ve uğurlama
  görselleri.
- **Topluluk:** destek talebi (transkriptli kapanış ve isteğe bağlı yapay zekâ
  asistanı), başvuru formu, anket, çekiliş, hatırlatıcı, oylama kanalı, yıldız
  panosu, özel ses odaları, davet takibi.
- **Seviye:** mesaj ve ses XP'si, seviye rolleri, sıralama, görsel profil kartı.
- **Bildirim:** YouTube RSS ile yeni video duyurusu; seçmeli bildirim rolleri.
- **Muz ekonomisi:**
  - Kazanma ve birikim: günlük ödül, meslekli çalışma (makro önleyen ustabaşı
    yoklamasıyla), görevler, başarımlar.
  - Eşyalar ve ticaret: kasa açma ve 63 kartlık koleksiyon, takas, topluluk
    pazarı.
  - Finans: banka (vadeli mevduat), kredi, borsa.
  - Oyunlar ve etkinlikler: kumar (slot, rulet, mines, blackjack, at yarışı
    ve diğerleri), düellolar, haftalık boss, piyango.
  - İlerleme: maymun çiftliği ve prestij.
- **Activity yönetim paneli:**
  - Ekonomi defteri ve istatistikler.
  - Üye yönetimi ve uzaklaştırma.
  - Etkinlikler, mağaza ve pazar ayarları.
- **Yedekleme:** periyodik `VACUUM INTO` yedeği ve `/yedek` komutu.

Ekonomi kuralları ve sayıları [`docs/para.md`](docs/para.md), özellik
listesinin koddaki karşılıkları [`docs/kullanim.md`](docs/kullanim.md) içinde.

## Gereksinimler

- **Node.js 24 veya üstü.** Veritabanı Node'un yerleşik `node:sqlite`
  modülüdür, ayrı bir veritabanı sunucusu gerekmez.
- **Bir Discord uygulaması:**
  - [Developer Portal](https://discord.com/developers/applications)'da bot
    kullanıcısı olan bir uygulama oluştur.
  - Bot → Privileged Gateway Intents altında **Server Members** ve **Message
    Content** anahtarlarını aç.
  - Bunlar kapalıysa bot yine açılır, ama karşılama mesajları ve silinen
    mesajın içeriğinin loglanması çalışmaz.
- *(Activity için)* Discord'un erişebileceği bir alan adı ve bir web sunucusu
  (örnek nginx ayarı aşağıda).
- *(İsteğe bağlı)* Destek talebi asistanı için
  [Claude Code](https://claude.com/claude-code) CLI. Kurulu değilse asistan
  hiçbir şey yapmaz.

## Kurulum

```sh
git clone <depo-adresi> && cd <depo>/app
npm ci
cp .env.example .env     # token, clientID, guildID ve authorUserID'yi doldur
npm run verify           # .env değerlerini Discord API'sine karşı sınar
npm run deploy           # slash komutları sunucuya kaydeder
npm start
```

Veritabanı ilk açılışta `app/veri/bot.sqlite` olarak oluşur. Bütün `.env`
anahtarları [`app/.env.example`](app/.env.example) içinde açıklamalıdır.

### Sunucu düzeni

Moderasyon, AutoMod, anket, hatırlatıcı ve yedek dışındaki sistemler (ekonomi
dahil) varsayılan olarak kapalıdır. `/ayar liste` ile görülür, `/ayar sistem`
ile açılır, `/ayar ayarla` ile kanal ve rol bağlanır.

Kanal ve rolleri kuran betikler `app/` içinde `npm run <ad>` ile çalışır. Hepsi
yeniden çalıştırılabilir, çoğu `-- --dene` ile önce ne yapacağını gösterir.

| Betik | Ne kurar |
| --- | --- |
| `kanallar` | Destek, transkript ve seviye kanalları |
| `seviyerol` | Seviye rolleri |
| `rozetrol` | Rozet rolleri |
| `prestijrol` | Prestij rolleri |
| `ozelses` | "Oda oluştur" ses kanalı |
| `uyelik` | YouTube üyelik kanalları |
| `bildirimpanel` | Bildirim rolü paneli |
| `muzemoji` | Para birimi emojisi |
| `rolikon` | Rol ikonları |

Önerilen kurulum sırası: [`docs/kullanim.md`](docs/kullanim.md#kurulum-sırası-önerilen).

## Discord Activity

Arayüz `activity/` altında: React, Vite ve Tailwind. Activity'nin API'si ayrı
bir süreç değil, bot sürecinin içinde çalışır (`app/web/`). Botla aynı
veritabanını ve aynı oyun kurallarını kullanır.

1. `app/.env` içinde şunları doldur:
   - `clientSecret`: Developer Portal → OAuth2.
   - `webPort`: API'nin dinleyeceği yerel port, örneğin `3090`.
   - `yayinDizini`: web kökü, örneğin `/var/www/activity`.
2. Botu yeniden başlat. API yalnız `127.0.0.1:webPort` adresini dinler.
3. Arayüzü derleyip yayınla:
   ```sh
   cd activity
   npm ci
   npm run yayinla   # vite build ve yayinDizini'ne kopyalama
   ```
4. Web sunucusunda statik dosyaları sun ve `/api/` isteklerini bota aktar:
   ```nginx
   server {
       server_name activity.ornek.com;
       root /var/www/activity;
       index index.html;

       location /api/ {
           proxy_pass http://127.0.0.1:3090;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           client_max_body_size 32k;
       }

       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```
5. Developer Portal'da şunları yap:
   - **Activities** özelliğini aç.
   - **URL Mappings** altında kök yolu (`/`) bu alan adına yönlendir.
   - OAuth2 → Redirects altına en az bir adres ekle (yer tutucu olarak
     `https://127.0.0.1` yeterli).

## Görseller ve ses

Bu depo görsel ve seslerin bir kısmını **içermez**; bazıları içerilse de lisans
kapsamında değildir.

- **Kart, meslek, maymun ve rozet görselleri** sunucunun özel emojilerinden
  gelir (`btd_dart`, `btd_engineer`, …). Bot bunları adlarıyla bulur. Emoji
  yoksa arayüz yedek simgeyi ya da ikonu gösterir.
- **`app/varliklar/para.png`** ile **`activity/public/ciftlik/`** altındaki
  görseller Ninja Kiwi'nin BTD6 oyunundan alınmıştır. Bu görsellerin hakları
  Ninja Kiwi'ye aittir ve bu depodaki AGPL lisansının **kapsamında değildir**.
  Kendi kurulumunda bunları kendi görsellerinle değiştirmen önerilir.
- **Grev müziği** (`activity/public/ses/m7.mp3`) depoda yok. Dosyayı koyarsan
  grev sırasında çalar. Koymazsan grev sessiz oynanır.

Bu proje Ninja Kiwi ile bağlantılı değildir ve onun tarafından onaylanmamıştır.

## Geliştirme

```sh
cd app && npm test           # birim testleri (node --test)
cd activity && npm run dev   # yerel önizleme
```

Yerel önizleme `vite.config.js` içinde `/api` isteklerini `127.0.0.1:3091`
adresine yönlendirir. Bu adreste bir önizleme API'si çalıştırman gerekir.

### Proje yapısı

```
app/
  app.js            bot girişi
  commands/         slash komutlar (dizin başına bir modül)
  events/           Discord olay dinleyicileri
  lib/              iş kuralları (komut ve web rotaları aynı fonksiyonları çağırır)
  servisler/        zamanlı işler (banka, boss, borsa, YouTube, yedek …)
  web/              Activity API'si (node:http)
  scripts/          bir kerelik kurulum ve bakım betikleri
  test/             node --test birim testleri
activity/           Discord Activity arayüzü (React + Vite)
docs/               kullanım ve ekonomi belgeleri
```

### Katkı kuralları

- Kod, yorumlar ve arayüz metinleri **Türkçe**dir. Yeni kod da çevresindeki
  adlandırmaya uymalı.
- Activity arayüzünde **emoji kullanılmaz**. Bunun yerine `lucide-react`
  ikonları ya da oyun öğeleri için BTD görselleri (`Gorsel`, `EmojiIkon`)
  kullanılır.
- Ekonomi kuralı `app/lib/` içinde bir kez yazılır. Slash komut ve web rotası
  aynı fonksiyonu çağırır, kural kopyalanmaz.
- Yeni davranış için `app/test/` altına test eklenir.

## Lisans

Copyright © 2026 xdaxer

Bu program özgür yazılımdır: [GNU Affero Genel Kamu Lisansı sürüm 3](LICENSE)
(AGPL-3.0) koşulları altında dağıtabilir ve değiştirebilirsin. Değiştirilmiş
bir sürümü başkalarının kullanımına açık bir sunucuda çalıştırıyorsan, o
sürümün kaynak kodunu da kullanıcılarına sunmalısın.

Yukarıdaki "Görseller ve ses" bölümünde sayılan üçüncü taraf varlıklar bu
lisansın kapsamında değildir.
