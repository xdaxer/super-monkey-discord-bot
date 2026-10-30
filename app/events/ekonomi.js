import { Events } from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { mesajOdulu } from '../lib/ekonomi.js';
import { uzakMi } from '../lib/ekonomi-uzak.js';
import { borcaKes } from '../lib/kredi.js';
import { etkiAktifMi } from '../lib/envanter.js';
import { etkinlikCarpani } from '../lib/etkinlik.js';
import { gorevIlerlet } from '../lib/gorevler.js';
import { prestijCarpani } from '../lib/prestij-carpan.js';
import { uyelikCarpani } from '../lib/uyelik-carpan.js';
import { yoneticiCarpani } from '../lib/yonetici-carpan.js';
import { xpKazandirirMi } from '../lib/seviye.js';

export const name = Events.MessageCreate;

// XP ile aynı kural: yalnız mesajın varlığı sayılır, içerik okunmaz.
export const gerekliIntent = ['GuildMessages'];

export async function execute(message) {
  if (!message.guild) return;

  const db = veritabani();
  const guildId = message.guild.id;

  if (!sistemAcikMi(db, guildId, 'ekonomi')) return;
  if (!ayarGetir(db, guildId, 'ekonomi.mesajOdulu')) return;
  if (!xpKazandirirMi(message).ok) return;
  if (uzakMi(db, guildId, message.author.id)) return;

  // Mağazadan alınan Muz Çiftliği süresince sohbet muzu 3 kat.
  // Etkinlik (muz-2x), prestij ve Katıl kademesi çarpanıyla da çarpılarak birleşir (ikisi birden 6x × prestij × Katıl).
  const carpan = (etkiAktifMi(db, guildId, message.author.id, 'muz-ciftligi') ? 3 : 1)
    * etkinlikCarpani(db, guildId, 'muz-2x')
    * prestijCarpani(db, guildId, message.author.id)
    * uyelikCarpani(db, guildId, message.author.id)
    * yoneticiCarpani(message.author.id);
  const verilen = mesajOdulu(db, { guildId, kullaniciId: message.author.id, carpan });
  if (verilen > 0) borcaKes(db, guildId, message.author.id, verilen); // borçluysa gelirin payı borca gider
  if (verilen > 0) gorevIlerlet(db, { guildId, kullaniciId: message.author.id, tur: 'mesaj' }); // sessiz: yalnız /gorev'de görünür
}
