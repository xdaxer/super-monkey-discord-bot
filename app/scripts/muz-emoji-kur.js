// Para birimi emojisini (app/varliklar/para.png — BTD6'nın oyun içi para
// simgesi, Bloons wiki "File:BTD6 CoinIcon.png") botun uygulama emojisi olarak
// yükler. Uygulama emojisi sunucunun emoji slotunu harcamaz ve botun her
// mesajında kullanılabilir; bot açılışta adıyla bulup para simgesi yapar.
// Yeniden çalıştırılabilir: emoji varsa dokunmaz. `--yenile` var olanı silip
// dosyadaki görselle yeniden yükler (kimlik değişir, bot yeniden başlatılmalı).
// `--dene` hiçbir şey yazmaz.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REST, Routes } from 'discord.js';

import { EMOJI_ADI, emojiMetni } from '../lib/ekonomi.js';
import { requireEnv } from '../lib/env.js';

const DENE = process.argv.includes('--dene');
const YENILE = process.argv.includes('--yenile');
const GORSEL = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'varliklar', 'para.png');

const { token, clientID } = requireEnv('token', 'clientID');
const rest = new REST().setToken(token);

const { items: emojiler = [] } = await rest.get(Routes.applicationEmojis(clientID));
const mevcut = emojiler.find((e) => e.name === EMOJI_ADI);

if (mevcut && !YENILE) {
  console.log(`var  ${emojiMetni(mevcut)} — değişiklik yok (görseli değiştirdiysen --yenile).`);
  process.exit(0);
}

if (DENE) {
  console.log(mevcut ? `SİLİNİP YENİDEN YÜKLENECEK ${emojiMetni(mevcut)}` : `YÜKLENECEK :${EMOJI_ADI}:`);
  process.exit(0);
}

const png = await readFile(GORSEL);

if (mevcut) {
  await rest.delete(Routes.applicationEmoji(clientID, mevcut.id));
  console.log(`silindi ${emojiMetni(mevcut)}`);
}

const yeni = await rest.post(Routes.applicationEmojis(clientID), {
  body: { name: EMOJI_ADI, image: `data:image/png;base64,${png.toString('base64')}` },
});
console.log(`YENİ ${emojiMetni(yeni)} (${png.length} bayt)`);
console.log('Botun yeni emojiyi kullanması için servisi yeniden başlatın.');
