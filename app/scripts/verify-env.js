// app/.env değerlerini canlı Discord API'sine karşı doğrular.
// Token yenilendiğinde veya sunucu değiştiğinde yeniden çalıştırın:
//   npm run verify
// Hiçbir gizli değeri ekrana yazmaz.
import { requireEnv } from '../lib/env.js';

const { token, clientID, guildID } = requireEnv('token', 'clientID', 'guildID');

const api = (yol) =>
  fetch(`https://discord.com/api/v10${yol}`, { headers: { Authorization: `Bot ${token}` } });

let hepsiGecti = true;

function rapor(gecti, mesaj) {
  if (!gecti) hepsiGecti = false;
  console.log(`${gecti ? '  OK  ' : ' HATA '} ${mesaj}`);
}

const me = await api('/users/@me');
rapor(me.ok, `token geçerli (HTTP ${me.status})`);
if (!me.ok) {
  console.error('Token reddedildi; diğer kontroller atlandı.');
  process.exit(1);
}

const bot = await me.json();
rapor(bot.id === clientID, `clientID token sahibi bot ile aynı (${bot.username})`);
if (bot.id !== clientID) {
  console.error('  clientID başka bir uygulamaya ait görünüyor.');
}

const guild = await api(`/guilds/${guildID}`);
rapor(guild.ok, `bot hedef sunucuda ve sunucu erişilebilir (HTTP ${guild.status})`);
if (guild.ok) {
  console.log(`       sunucu: ${(await guild.json()).name}`);
} else {
  console.error('  guildID yanlış olabilir ya da bot o sunucuya davet edilmemiş.');
}

console.log(hepsiGecti ? '\nTüm kontroller geçti.' : '\nEn az bir kontrol başarısız.');
process.exit(hepsiGecti ? 0 : 1);
