import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import {
  AYARLAR, BilinmeyenAyar, SISTEMLER,
  ayarGetir, ayarSecenekleri, ayarSifirla, ayarYaz, kanalListesiDegistir, sistemAcikMi, sistemAyarla, sunucuOzeti,
} from '../../lib/ayarlar.js';
import { alanlaraBol, gomu, PINGSIZ } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';

export const modul = 'yapilandirma';

const sistemSecenekleri = Object.entries(SISTEMLER)
  .map(([ad, tanim]) => ({ name: tanim.etiket, value: ad }));

/**
 * Ayar anahtarı hazır seçenek değil, otomatik tamamlamadır: Discord bir
 * seçenekte en çok 25 hazır seçenek taşır ve anahtar sayısı o sınıra dayandı.
 * Tamamlama da 25 satır gösterir, ama yazdıkça süzüldüğü için sınır tavan
 * olmaktan çıkar.
 */
const anahtarSecenegi = (o) => o
  .setName('anahtar').setDescription('Hangi ayar (yazarak arayın)')
  .setRequired(true).setAutocomplete(true);

/**
 * Kanal listesi ayarları (ör. ekonomi.kanallar) tek kanalla değil, ekle/çıkar
 * ile yönetilir: böylece yönetici listeyi baştan yazmak zorunda kalmaz.
 * `ayarla kanal:` ise listeyi yalnız o kanala indirir.
 */
const LISTE_ALT_KOMUTLARI = ['kanal-ekle', 'kanal-cikar'];

export const data = new SlashCommandBuilder()
  .setName('ayar')
  .setDescription('Sunucuya özel sistem ve ayar yönetimi.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s
    .setName('liste').setDescription('Bütün sistemlerin ve ayarların durumunu gösterir.'))
  .addSubcommand((s) => s
    .setName('sistem').setDescription('Bir sistemi açar veya kapatır.')
    .addStringOption((o) => o
      .setName('sistem').setDescription('Hangi sistem').setRequired(true)
      .addChoices(...sistemSecenekleri))
    .addBooleanOption((o) => o
      .setName('acik').setDescription('Açık mı olsun').setRequired(true)))
  .addSubcommand((s) => s
    .setName('ayarla').setDescription('Bir ayar değerini belirler.')
    .addStringOption(anahtarSecenegi)
    .addChannelOption((o) => o.setName('kanal').setDescription('Kanal türü ayarlar için'))
    .addRoleOption((o) => o.setName('rol').setDescription('Rol türü ayarlar için'))
    .addStringOption((o) => o.setName('metin').setDescription('Metin türü ayarlar için').setMaxLength(500))
    .addBooleanOption((o) => o.setName('acik').setDescription('Aç/kapa türü ayarlar için'))
    .addIntegerOption((o) => o.setName('sayi').setDescription('Sayı türü ayarlar için')))
  .addSubcommand((s) => s
    .setName('kanal-ekle').setDescription('Kanal listesi ayarına bir kanal ekler.')
    .addStringOption(anahtarSecenegi)
    .addChannelOption((o) => o.setName('kanal').setDescription('Eklenecek kanal').setRequired(true)))
  .addSubcommand((s) => s
    .setName('kanal-cikar').setDescription('Kanal listesi ayarından bir kanalı çıkarır.')
    .addStringOption(anahtarSecenegi)
    .addChannelOption((o) => o.setName('kanal').setDescription('Çıkarılacak kanal').setRequired(true)))
  .addSubcommand((s) => s
    .setName('sifirla').setDescription('Bir ayarı varsayılana döndürür.')
    .addStringOption(anahtarSecenegi));

/** `anahtar` seçeneğinde kullanıcı yazdıkça uyan anahtarları döndürür. */
export async function autocomplete(interaction) {
  const liste = LISTE_ALT_KOMUTLARI.includes(interaction.options.getSubcommand(false));
  await interaction.respond(ayarSecenekleri(
    interaction.options.getFocused(), undefined, liste ? 'kanalListesi' : null,
  ));
}

/**
 * Saf mantık: verilen seçeneklerden ayarın türüne uygun değeri seçer.
 * @returns {{ok: true, deger: any} | {ok: false, sebep: string}}
 */
export function degerSec(anahtar, girdiler) {
  const tanim = AYARLAR[anahtar];
  if (!tanim) return { ok: false, sebep: `Bilinmeyen ayar: ${anahtar}` };

  const beklenen = {
    kanal: 'kanal', kanalListesi: 'kanal', rol: 'rol', metin: 'metin', acik: 'acik', sayi: 'sayi',
  }[tanim.tur];

  const deger = girdiler[beklenen];
  if (deger === null || deger === undefined) {
    const ipucu = {
      kanal: '`kanal:` seçeneğiyle bir kanal', kanalListesi: '`kanal:` seçeneğiyle bir kanal (listeye eklemek için `/ayar kanal-ekle`)', rol: '`rol:` seçeneğiyle bir rol',
      metin: '`metin:` seçeneğiyle bir yazı', acik: '`acik:` seçeneğiyle Evet/Hayır',
      sayi: '`sayi:` seçeneğiyle bir sayı',
    }[beklenen];
    return { ok: false, sebep: `**${tanim.etiket}** için ${ipucu} vermelisin.` };
  }

  // Sayı ayarlarının sınırı tanımda duruyor: 0 saatlik yedek aralığı veya
  // negatif saklama sayısı kabul edilirse sistem sessizce bozulur.
  if (tanim.tur === 'sayi') {
    const { min = 1, max = Number.MAX_SAFE_INTEGER } = tanim;
    if (!Number.isInteger(deger) || deger < min || deger > max) {
      return { ok: false, sebep: `**${tanim.etiket}** ${min} ile ${max} arasında bir tam sayı olmalı.` };
    }
  }

  // Liste ayarında `ayarla` listeyi tek kanala indirir; ekleme için kanal-ekle var.
  if (tanim.tur === 'kanalListesi') return { ok: true, deger: [deger] };

  return { ok: true, deger };
}

/** Saklanan değeri insan okunur biçime çevirir. */
export function degerGoster(tanim, deger) {
  if (deger === null || deger === undefined) return '_ayarlanmamış_';
  if (tanim.tur === 'kanal') return `<#${deger}>`;
  if (tanim.tur === 'kanalListesi') {
    return Array.isArray(deger) && deger.length > 0 ? deger.map((k) => `<#${k}>`).join(' ') : '_boş (her yerde)_';
  }
  if (tanim.tur === 'rol') return `<@&${deger}>`;
  if (tanim.tur === 'acik') return deger ? 'açık' : 'kapalı';
  if (tanim.tur === 'sayi') return `**${deger}**`;
  return `\`${String(deger).slice(0, 120)}\``;
}

export async function execute(interaction) {
  const db = veritabani();
  const alt = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (alt === 'liste') {
    const ozet = sunucuOzeti(db, guildId);

    const sistemSatirlari = ozet.sistemler.map((s) => {
      const isaret = s.acik ? '🟢' : '⚪';
      const not = s.gerekliIntent.length > 0 ? ` _(gerekli intent: ${s.gerekliIntent.join(', ')})_` : '';
      return `${isaret} **${s.etiket}** — \`${s.ad}\`${not}`;
    });

    const ayarSatirlari = ozet.ayarlar.map((a) => {
      const tanim = AYARLAR[a.anahtar];
      return `• \`${a.anahtar}\` — ${degerGoster(tanim, a.deger)}`;
    });

    // Ayar sayısı tek alanın karakter sınırını zorluyor; bölmezsek liste
    // sessizce yarıda kesilir ve eksik ayar yokmuş gibi görünür.
    const embed = gomu('bilgi', `${interaction.guild.name} — yapılandırma`)
      .addFields(
        ...alanlaraBol('Sistemler', sistemSatirlari),
        ...alanlaraBol('Ayarlar', ayarSatirlari),
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (alt === 'sistem') {
    const sistem = interaction.options.getString('sistem');
    const acik = interaction.options.getBoolean('acik');

    try {
      sistemAyarla(db, guildId, sistem, acik);
    } catch (error) {
      if (!(error instanceof BilinmeyenAyar)) throw error;
      await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
      return;
    }

    const tanim = SISTEMLER[sistem];
    const uyari = acik && tanim.gerekliIntent?.length
      ? `\n⚠️ Bu sistem **${tanim.gerekliIntent.join(', ')}** intent'ine bağlı. `
        + 'Developer Portal\'da kapalıysa çalışmaz.'
      : '';

    await interaction.reply({
      content: `**${tanim.etiket}** sistemi ${acik ? 'açıldı' : 'kapatıldı'}.${uyari}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (alt === 'ayarla') {
    const anahtar = interaction.options.getString('anahtar');
    const secim = degerSec(anahtar, {
      kanal: interaction.options.getChannel('kanal')?.id ?? null,
      rol: interaction.options.getRole('rol')?.id ?? null,
      metin: interaction.options.getString('metin'),
      acik: interaction.options.getBoolean('acik'),
      sayi: interaction.options.getInteger('sayi'),
    });

    if (!secim.ok) {
      await interaction.reply({ content: secim.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    ayarYaz(db, guildId, anahtar, secim.deger);
    await interaction.reply({
      content: `\`${anahtar}\` → ${degerGoster(AYARLAR[anahtar], secim.deger)}`,
      flags: MessageFlags.Ephemeral,
      ...PINGSIZ,
    });
    return;
  }

  if (alt === 'kanal-ekle' || alt === 'kanal-cikar') {
    const anahtar = interaction.options.getString('anahtar');
    const kanal = interaction.options.getChannel('kanal', true);
    let sonuc;
    try {
      sonuc = kanalListesiDegistir(db, guildId, anahtar, kanal.id, alt === 'kanal-ekle' ? 'ekle' : 'cikar');
    } catch (error) {
      if (!(error instanceof BilinmeyenAyar)) throw error;
      await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!sonuc.ok) {
      await interaction.reply({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
      return;
    }
    const not = sonuc.degisti ? '' : (alt === 'kanal-ekle' ? ' _(zaten listedeydi)_' : ' _(listede yoktu)_');
    await interaction.reply({
      content: `\`${anahtar}\` → ${degerGoster(AYARLAR[anahtar], sonuc.liste)}${not}`,
      flags: MessageFlags.Ephemeral,
      ...PINGSIZ,
    });
    return;
  }

  if (alt === 'sifirla') {
    const anahtar = interaction.options.getString('anahtar');

    let varsayilan;
    try {
      // Tamamlama listesinden seçmek zorunlu değil; elle yazılan anahtar hatalı olabilir.
      varsayilan = ayarSifirla(db, guildId, anahtar);
    } catch (error) {
      if (!(error instanceof BilinmeyenAyar)) throw error;
      await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: `\`${anahtar}\` varsayılana döndürüldü: ${degerGoster(AYARLAR[anahtar], varsayilan)}`,
      flags: MessageFlags.Ephemeral,
      ...PINGSIZ,
    });
  }
}

export { sistemAcikMi, ayarGetir };
