import { Events } from 'discord.js';

import { izinliGuild, izinliMi, sunucudanAyril } from '../lib/guild-kilidi.js';

// Yeni bir sunucuya eklendiği anda: izinli değilse hemen ayrıl.
// GuildCreate, Guilds intent'i ile gelir; ek ayrıcalık gerekmez.
export const name = Events.GuildCreate;

export async function execute(guild) {
  if (izinliMi(guild.id, izinliGuild())) return;

  await sunucudanAyril(guild, console);
}
