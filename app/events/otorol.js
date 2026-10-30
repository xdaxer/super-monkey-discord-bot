import { Events } from 'discord.js';

import { veritabani } from '../lib/db.js';
import { otorolKarari } from '../lib/otorol.js';

export const olaylar = [
  {
    name: Events.GuildMemberAdd,
    gerekliIntent: ['GuildMembers'],
    async execute(member) {
      const karar = otorolKarari(veritabani(), member.guild.id, { bot: member.user.bot });
      if (!karar.ok || member.roles.cache.has(karar.rolId)) return;

      // Rol silinmiş ya da botun rolünün üstüne taşınmışsa üye girişi düşmesin.
      await member.roles.add(karar.rolId, 'Otorol').catch((error) => {
        console.warn(`Otorol verilemedi (${member.id} → ${karar.rolId}): ${error.message}`);
      });
    },
  },
];
