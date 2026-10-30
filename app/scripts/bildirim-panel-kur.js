// Dashboard kategorisinde ・🔔・bildirimler kanalını açar, bildirim rolü
// düğmeli paneli koyar (lib/bildirim-rol.js) ve kanalı onboarding'in
// varsayılan kanallarına ekler. Eksik bildirim rollerini de açar.
// `--dene` ile hiçbir şey yazmadan yapılacakları listeler.
// Yeniden çalıştırılabilir: kanal ve rol varsa yeniden açılmaz; botun
// kanaldaki eski panel mesajı yeni düğmelerle düzenlenir.
import {
  ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits as P,
} from 'discord.js';

import { BILDIRIM_ROLLERI, bildirimPaneli } from '../lib/bildirim-rol.js';
import { requireEnv } from '../lib/env.js';

const DENE = process.argv.includes('--dene');
const SEBEP = 'Bildirim rolleri kanalı kurulumu';
const KANAL_ADI = '・🔔・bildirimler';
const KATEGORI_ADI = '#000・Dashboard';

const { token, guildID } = requireEnv('token', 'guildID');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(token);
await new Promise((r) => client.once(Events.ClientReady, r));

const guild = await client.guilds.fetch(guildID);
const botUye = await guild.members.fetchMe();
if (!botUye.permissions.has(P.ManageRoles) || !botUye.permissions.has(P.ManageChannels)) {
  console.error('HATA: botta Rolleri Yönet ve Kanalları Yönet yetkisi gerekli, hiçbir şey yapılmadı.');
  await client.destroy();
  process.exit(1);
}

const rapor = [];

// Roller: yetkisiz, renksiz, etiketlenebilir. Rol simgesi 2. boost seviyesi ister;
// altındaysa rol simgesiz açılır (adındaki emoji yine görünür).
const simgeli = guild.premiumTier >= 2;
const roller = await guild.roles.fetch();
for (const r of BILDIRIM_ROLLERI) {
  if (roller.find((x) => x.name === r.ad)) {
    rapor.push(`  var  rol ${r.ad}`);
  } else if (DENE) {
    rapor.push(`  AÇILACAK rol ${r.ad}`);
  } else {
    await guild.roles.create({
      name: r.ad, permissions: [], mentionable: true, hoist: false, unicodeEmoji: simgeli ? r.emoji : undefined, reason: SEBEP,
    });
    rapor.push(`  YENİ rol ${r.ad}`);
  }
}

// Kanal: herkes görür ve geçmişi okur; yazamaz, tepki ve thread açamaz.
const kanallar = await guild.channels.fetch();
const kategori = kanallar.find((k) => k.type === ChannelType.GuildCategory && k.name === KATEGORI_ADI);
let kanal = kanallar.find((k) => k.type === ChannelType.GuildText && k.name === KANAL_ADI) ?? null;
if (kanal) {
  rapor.push(`  var  kanal ${kanal.name} (${kanal.id})`);
} else if (DENE) {
  rapor.push(`  AÇILACAK kanal ${KANAL_ADI} (${kategori ? kategori.name : 'kategorisiz'})`);
} else {
  kanal = await guild.channels.create({
    name: KANAL_ADI,
    type: ChannelType.GuildText,
    parent: kategori?.id ?? null,
    topic: 'Hangi duyurularda etiketlenmek istediğini buradaki düğmelerle seç.',
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [P.ViewChannel, P.ReadMessageHistory],
        deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads],
      },
      { id: botUye.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory] },
    ],
    reason: SEBEP,
  });
  rapor.push(`  YENİ kanal ${kanal.name} (${kanal.id})`);
}

// Panel: botun kanaldaki önceki mesajı varsa düzenlenir, yoksa gönderilir.
if (kanal && !DENE) {
  const eski = (await kanal.messages.fetch({ limit: 20 })).find((m) => m.author.id === botUye.id);
  if (eski) {
    await eski.edit(bildirimPaneli());
    rapor.push('  panel düzenlendi');
  } else {
    await kanal.send(bildirimPaneli());
    rapor.push('  panel gönderildi');
  }
} else {
  rapor.push('  panel gönderilecek');
}

// Onboarding: kanal varsayılan kanallara eklenir (sorular olduğu gibi kalır).
const onboarding = await client.rest.get(`/guilds/${guildID}/onboarding`);
if (kanal && onboarding.default_channel_ids.includes(kanal.id)) {
  rapor.push('  kanal zaten onboarding varsayılanında');
} else if (DENE || !kanal) {
  rapor.push('  kanal onboarding varsayılanına eklenecek');
} else {
  await client.rest.put(`/guilds/${guildID}/onboarding`, {
    body: {
      enabled: onboarding.enabled,
      mode: onboarding.mode,
      default_channel_ids: [...onboarding.default_channel_ids, kanal.id],
      prompts: onboarding.prompts.map((p) => ({
        ...p,
        options: p.options.map((o) => ({
          id: o.id, title: o.title, description: o.description, emoji: o.emoji?.name ? { name: o.emoji.name } : undefined,
          role_ids: o.role_ids, channel_ids: o.channel_ids,
        })),
      })),
    },
    reason: SEBEP,
  });
  rapor.push('  kanal onboarding varsayılanına eklendi');
}

console.log(`${DENE ? '[DENEME] ' : ''}Bildirim kanalı:\n${rapor.join('\n')}`);
await client.destroy();
