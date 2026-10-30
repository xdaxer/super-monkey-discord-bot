import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ARAYUZ_KOMUTLARI, arayuzKomutu, KAPALI_KOMUTLAR } from './arayuz-komut.js';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const commandsDir = path.join(appDir, 'commands');

/**
 * app/commands/<modul>/<ad>.js ağacını okur.
 *
 * Hem app.js hem deploy-commands.js bu tek kaynağı kullanır; kaydedilen komut
 * listesi ile çalışan komut listesinin ayrışması böylece mümkün değildir.
 *
 * @returns {Promise<Map<string, {data: object, execute: Function, autocomplete: Function|null, sistem: string|null, kanalMuaf: boolean, modul: string, yol: string}>>}
 */
export async function loadCommands() {
  const commands = new Map();

  let moduleDirs;
  try {
    moduleDirs = await readdir(commandsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return commands;
    throw error;
  }

  for (const moduleDir of moduleDirs) {
    if (!moduleDir.isDirectory()) continue;

    const dir = path.join(commandsDir, moduleDir.name);
    for (const file of await readdir(dir)) {
      if (!file.endsWith('.js')) continue;

      const fullPath = path.join(dir, file);
      const displayPath = `commands/${moduleDir.name}/${file}`;
      const imported = await import(pathToFileURL(fullPath).href);

      if (!imported.data || typeof imported.execute !== 'function') {
        throw new Error(`${displayPath}: "data" ve "execute" dışa aktarılmalı.`);
      }

      const name = imported.data.name;
      // Ekonomi arayüze taşındı (lib/arayuz-komut.js): eski işleyici dosyada
      // durur ama yüklenmez; ya hiç kaydedilmez ya da arayüzü başlatır.
      if (KAPALI_KOMUTLAR.has(name)) continue;
      const etkin = ARAYUZ_KOMUTLARI[name] ? arayuzKomutu(imported) : imported;
      const clashing = commands.get(name);
      if (clashing) {
        throw new Error(
          `Komut adı çakışması: /${name} hem ${clashing.yol} hem ${displayPath} içinde tanımlı.`,
        );
      }

      commands.set(name, {
        data: etkin.data,
        execute: etkin.execute,
        // Varsa otomatik tamamlama işleyicisi; yoksa komutun seçenekleri sabittir.
        autocomplete: etkin.autocomplete ?? null,
        // Komut hangi açılıp kapatılabilir sisteme ait; yoksa her zaman açık.
        sistem: imported.sistem ?? null,
        // true ise sistemin kanal sınırından (örn. ekonomi.kanallar) muaf.
        kanalMuaf: imported.kanalMuaf === true,
        modul: moduleDir.name,
        yol: displayPath,
      });
    }
  }

  return commands;
}
