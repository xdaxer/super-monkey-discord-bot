import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { etiketsiz, gomu, PINGSIZ, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import {
  bekleyenler, DURUMLAR, etiketMetni, hatirlaticiEkle, hatirlaticiGetir, iptalEt,
  KISI_BASI_SINIR, MESAJ_SINIRI, mesajBagla, zamanAyristir,
} from '../../lib/hatirlatici.js';
import { kanalYetkisiKontrol } from '../../lib/izin.js';

export const sistem = 'hatirlatici';
export const modul = 'hatirlatici';

export const data = new SlashCommandBuilder()
  .setName('hatirlat')
  .setDescription('Zamanı gelince bu kanalda seni (ve istersen başkasını) etiketleyen hatırlatma.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('kur').setDescription('Komutu yazdığın kanala hatırlatma kurar.')
    .addStringOption((o) => o
      .setName('zaman')
      .setDescription('30dk, 1sa30dk, 2g, 21:30, yarın 09:00, 05.10 21:30 (Türkiye saati)')
      .setRequired(true).setMaxLength(40))
    .addStringOption((o) => o
      .setName('mesaj').setDescription('Ne hatırlatılsın').setRequired(true)
      .setMaxLength(MESAJ_SINIRI))
    .addMentionableOption((o) => o
      .setName('etiket').setDescription('Sana ek olarak etiketlenecek kişi veya rol')))
  .addSubcommand((s) => s
    .setName('liste').setDescription('Bu sunucudaki bekleyen hatırlatmalarını gösterir.'))
  .addSubcommand((s) => s
    .setName('sil').setDescription('Bekleyen bir hatırlatmayı iptal eder.')
    .addIntegerOption((o) => o
      .setName('no').setDescription('Hatırlatma numarası (/hatirlat liste)').setRequired(true)
      .setMinValue(1)));

const gizli = (content) => ({ content, flags: MessageFlags.Ephemeral });

/**
 * Seçilen ek etiketi çözer ve kullanıcının onu çağırmaya hakkı olduğunu
 * denetler: zamanlanmış mesaj, normalde @everyone ya da kapalı rolü
 * etiketleyemeyen birine bu yetkiyi arka kapıdan vermemeli.
 */
function etiketCoz(interaction) {
  const secim = interaction.options.get('etiket');
  if (!secim) return { ok: true, etiketId: null, etiketTur: null, ozelYetki: false };

  if (secim.role) {
    const herkes = secim.role.id === interaction.guildId;
    const ozelYetki = herkes || !secim.role.mentionable;
    if (ozelYetki && !interaction.memberPermissions?.has(PermissionFlagsBits.MentionEveryone)) {
      return {
        ok: false,
        sebep: herkes
          ? '⛔ @everyone etiketlemek için **@everyone, @here ve Tüm Rollerden Bahset** yetkin olmalı.'
          : `⛔ ${secim.role} rolü herkese etiketlenebilir değil; bu yetkin yok.`,
      };
    }
    return { ok: true, etiketId: secim.role.id, etiketTur: 'rol', ozelYetki };
  }

  if (secim.user) return { ok: true, etiketId: secim.user.id, etiketTur: 'kullanici', ozelYetki: false };

  return { ok: false, sebep: 'Etiket çözülemedi; bir kişi ya da rol seç.' };
}

async function kur(interaction, db) {
  const zamanSonuc = zamanAyristir(interaction.options.getString('zaman'));
  if (!zamanSonuc.ok) {
    await interaction.reply(gizli(zamanSonuc.sebep));
    return;
  }

  const mesaj = interaction.options.getString('mesaj').trim();
  if (!mesaj) {
    await interaction.reply(gizli('Mesaj boş olamaz.'));
    return;
  }

  const etiket = etiketCoz(interaction);
  if (!etiket.ok) {
    await interaction.reply(gizli(etiket.sebep));
    return;
  }

  if (bekleyenler(db, interaction.guildId, interaction.user.id).length >= KISI_BASI_SINIR) {
    await interaction.reply(gizli(
      `En çok ${KISI_BASI_SINIR} bekleyen hatırlatman olabilir; \`/hatirlat sil\` ile yer aç.`,
    ));
    return;
  }

  // Hatırlatma zamanı gelince bot bu kanala yazacak; şimdi yazamıyorsa
  // kullanıcı o an değil, ancak hatırlatma gelmeyince fark ederdi.
  const kanal = interaction.channel;
  const bayraklar = [
    PermissionFlagsBits.ViewChannel,
    kanal?.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
  ];
  if (etiket.ozelYetki) bayraklar.push(PermissionFlagsBits.MentionEveryone);
  const yetki = kanalYetkisiKontrol(kanal, interaction.guild.members.me, ...bayraklar);
  if (!yetki.ok) {
    await interaction.reply(gizli(yetki.sebep));
    return;
  }

  const id = hatirlaticiEkle(db, {
    guildId: interaction.guildId,
    kanalId: interaction.channelId,
    kullaniciId: interaction.user.id,
    mesaj,
    etiketId: etiket.etiketId,
    etiketTur: etiket.etiketTur,
    zaman: zamanSonuc.zaman,
  });

  const kayit = hatirlaticiGetir(db, id);
  const kimler = [`${interaction.user}`, etiketMetni(kayit)].filter(Boolean).join(' ');

  // Onay herkese görünür ama kimseyi çağırmaz; hatırlatma zamanı gelince bu
  // mesaja yanıt olarak düşer, böylece neyin kurulduğu kanalda görünür kalır.
  await interaction.reply({
    content: `⏰ Hatırlatma **#${id}** kuruldu: ${zaman(zamanSonuc.zaman, 'f')} `
      + `(${zaman(zamanSonuc.zaman, 'R')}) — ${kimler} etiketlenecek.\n> ${etiketsiz(mesaj).split('\n').join('\n> ')}`,
    ...PINGSIZ,
  });

  const onay = await interaction.fetchReply().catch(() => null);
  if (onay) mesajBagla(db, id, onay.id);
}

async function liste(interaction, db) {
  const kayitlar = bekleyenler(db, interaction.guildId, interaction.user.id);
  if (kayitlar.length === 0) {
    await interaction.reply(gizli('Bekleyen hatırlatman yok. `/hatirlat kur` ile kurabilirsin.'));
    return;
  }

  const satirlar = kayitlar.map((k) => {
    const ozet = k.mesaj.length > 80 ? `${k.mesaj.slice(0, 77)}...` : k.mesaj;
    const ek = etiketMetni(k);
    return `**#${k.id}** ${zaman(k.zaman, 'f')} (${zaman(k.zaman, 'R')}) <#${k.kanal_id}>`
      + `${ek ? ` + ${ek}` : ''}\n${etiketsiz(ozet.replaceAll('\n', ' '))}`;
  });

  // Embed açıklaması 4096 karakter; 25 uzun satır sınırı aşabilir, yarım
  // satırla kesilmesin diye taşanlar sayıyla özetlenir.
  let aciklama = '';
  let gosterilen = 0;
  for (const satir of satirlar) {
    const aday = aciklama ? `${aciklama}\n\n${satir}` : satir;
    if (aday.length > 4000) break;
    aciklama = aday;
    gosterilen += 1;
  }
  if (gosterilen < satirlar.length) aciklama += `\n\n…ve ${satirlar.length - gosterilen} tane daha.`;

  await interaction.reply({
    embeds: [gomu('bilgi', `⏰ Bekleyen hatırlatmaların (${kayitlar.length})`, aciklama)],
    flags: MessageFlags.Ephemeral,
    ...PINGSIZ,
  });
}

async function sil(interaction, db) {
  const no = interaction.options.getInteger('no');
  const kayit = hatirlaticiGetir(db, no);

  if (!kayit || kayit.guild_id !== String(interaction.guildId)) {
    await interaction.reply(gizli(`**#${no}** numaralı hatırlatma bu sunucuda bulunamadı.`));
    return;
  }

  // Başkasının hatırlatmasını yalnız Mesajları Yönet yetkilisi silebilir.
  const sahibi = kayit.kullanici_id === interaction.user.id;
  if (!sahibi && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply(gizli('⛔ Yalnız kendi hatırlatmanı silebilirsin.'));
    return;
  }

  if (kayit.durum !== DURUMLAR.bekliyor || !iptalEt(db, no)) {
    await interaction.reply(gizli(`**#${no}** artık beklemiyor (${kayit.durum}).`));
    return;
  }

  await interaction.reply(gizli(`🗑️ Hatırlatma **#${no}** iptal edildi.`));
}

export async function execute(interaction) {
  const db = veritabani();
  const alt = interaction.options.getSubcommand();

  if (alt === 'kur') await kur(interaction, db);
  else if (alt === 'liste') await liste(interaction, db);
  else if (alt === 'sil') await sil(interaction, db);
}
