import { REST, Routes } from 'discord.js';

import { loadCommands } from './lib/commands.js';
import { requireEnv } from './lib/env.js';

const { token, clientID, guildID } = requireEnv('token', 'clientID', 'guildID');

const commands = await loadCommands();
const body = [...commands.values()].map((command) => command.data.toJSON());

if (body.length === 0) {
  console.error('app/commands altında komut bulunamadı; kayıt yapılmadı.');
  process.exit(1);
}

const rest = new REST().setToken(token);

try {
  // Tek sunucu kapsamı (karar D-GUILD-KAYIT): guild kaydı anında yayılır.
  // Global kayıt (Routes.applicationCommands) bilerek kullanılmıyor.
  const kaydedilen = await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body });

  console.log(`${kaydedilen.length} komut ${guildID} sunucusuna kaydedildi:`);
  for (const command of kaydedilen) {
    console.log(`  /${command.name} — ${command.description}`);
  }
} catch (error) {
  console.error('Komut kaydı başarısız:', error.message);
  process.exit(1);
}
