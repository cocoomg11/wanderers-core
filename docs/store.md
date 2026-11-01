# GM-only store journal

`createStore(moduleId, options)` (core 0.5.0) is the one journal entry per module that holds records only GMs should read: one
JournalEntry with default ownership None, the data in one flag `flags.<moduleId>.<flagKey>`. It replaces world settings for that data,
because every client receives every world setting. The Wanderer's Toolkit (vault), Red Book and the Wanderer's Satchel each wrote
their own copy of this; core now has one.

Pure rules: `src/store-model.mjs` (tested in Node); Foundry half: `src/foundry/store.mjs` (checked against core's fakes only).

## Not secrecy (read this first)

Ownership None keeps the entry out of players' Journal sidebars and every window that checks permissions. It does **not** keep the
data off their computers: checked live on Foundry 14.369, a None-ownership journal entry is still sent to every player's client, and
so is a GM-only (ownership None) world compendium. A player who opens the browser console can read it. Treat the store as an
**honour system**: it keeps GM-only data out of world settings, chat cards and player-facing windows, nothing more. Never put real
secrets (passwords, webhook keys, tokens) in it. Say so in the module's README and health check, as the modules do today.

## Use

```js
import { createStore } from "../vendor/wanderers-core/foundry/index.mjs";

export const Store = createStore(ID, {
  name: "My Module (GM only)",           // the name when created; found by flag, never by name
  flagKey: "store",                       // flags.<ID>.store holds the data (default "store")
  entryFlag: "storeEntry",                // flags.<ID>.storeEntry === true marks the entry (default); null = the data flag marks it
  version: 1, empty: () => ({ notes: {} }), upgrades: {}, clean: v => v,   // or normalize: myNormalizer
  keysAt: null,                           // where get/set/setKey act: null = top level, or a field such as "buckets"
  keys: ["notes"],                        // allowed keys for set/setKey (null = any)
  maxBytes: 8 * 1024 * 1024,              // a write over this is refused (default 8 MiB of JSON)
  about: "My Module keeps GM-only records here. Don't share this entry with players.",
  log,                                    // { warn } for failures (default console.warn)
  isWriter: () => leader.isLeader()       // who does automatic work such as filing (default: Foundry's active GM)
});

Store.get("notes", {});                  // GM: a cached copy (never change it in place); players: the fallback
await Store.setKey("notes", id, { text });   // GM only; null removes the key
await Store.update(d => ({ ...d, notes: {} }));   // GM only; fn may be async; one write at a time
await Store.file();                      // the writer, at ready: files a root-level entry in "Module data" once
Store.status();                          // { exists, count, name, id, bytes, playersCanSee, keys } for a health line
await Store.remove();                    // cleanup: deletes the entry (every copy) and the folder if empty
```

- **Finding**: `entryFlag: "vaultEntry"` finds the first journal with `flags.<ID>.vaultEntry === true`; `entryFlag: null` finds the
  first with the data flag set. Choose the rule your module already uses, so the existing entry is found as it is: nothing is renamed
  or moved except the one-time filing below.
- **Creating**: on the first write (`update`, `set`, `setKey`, `ensure`), GM clients only, inside the "Module data" folder
  ([data-folder.md](data-folder.md)) unless `dataFolder: false`. One creation at a time per client.
- **Filing an existing entry**: `file()` (writer only, never throws) moves a root-level entry into "Module data" once and marks it
  `flags.<ID>.dataFolderFiled`, so a GM who moves it afterwards (even back to the root) keeps their choice. An entry already in a
  folder of the GM's choosing stays there and is marked too. A failed move is tried again next time.
- **Writes**: chained, so two updates in a row never overwrite each other; each reads the stored data, runs `fn`, normalizes, checks
  the size, and writes the data plus a deletion for every key that disappeared (to `deleteDepth`, default 3 levels: Foundry merges
  object updates, so removed keys would otherwise stay). Deletions use v14's operator (`_del`) when present, else `-=` keys. A failed
  write rejects that call only; the chain carries on.
- **Reads**: GM clients read the entry synchronously; the normalized value is cached until the stored object or the entry's
  `_stats.modifiedTime` changes. Players never look: `entry()` is null, `read()` is the empty value, `get(key, fb)` returns `fb`.
- **Keys**: `get(key)`, `set(key, value)` and `setKey(key, sub, value)` act on `keysAt` (the toolkit's `buckets`) or the top level.
  An unknown key (with `keys` given) throws: a programming mistake.
- **Cleanup**: list the entry in the module's cleanup plan (the flag finds it: `flaggedDocuments(ID)`), and remove it with
  `Store.remove()` (which also calls `removeDataFolderIfEmpty`). Add `dataFolderFiled` to anything that lists the module's flags.

## Moving a module's own store to core

Keep the module's own file (`vault.mjs`, `store.mjs`) as the one place that knows where the store lives, and make it a thin wrapper:

| Module | Today | `createStore` options |
|---|---|---|
| Wanderer's Toolkit | `vault.mjs`: marker `vaultEntry`, data `vault`, `{ v, buckets }`, keyed buckets, deletions two levels deep | `{ name: VAULT_NAME, flagKey: "vault", entryFlag: "vaultEntry", normalize: normalizeVault, keysAt: "buckets", keys: BUCKETS, deleteDepth: 3, about, log, isWriter: isActiveGM }`; `get`/`set`/`setKey`/`update` keep their names; `migrated`/`markMigrated` stay as wrappers over `update`; `status()` gives `playersCanSee` |
| Red Book | `store.mjs`: no marker, data `store` found by its flag, `write(data)` replaces the whole store | `{ name: STORE_NAME, flagKey: "store", entryFlag: null, normalize: normalizeStore, about, log, isWriter: L.isLeader }`; `write(data)` becomes `update(() => data)`; `read()` stays |
| Wanderer's Satchel | `store.mjs`: marker `storeEntry`, data `store`, chained `update(fn)` | `{ name: NAME, flagKey: "store", entryFlag: "storeEntry", normalize: normalizeStore, maxBytes, about, log, isWriter }` (its own `isWriter()` = active GM, which is also core's default) |

Then: call `Store.file()` from the writer's ready work (after `settled()` for leader modules), register `showModuleData` and call
`hideDataFolder(ID)` (data-folder.md), add `dataFolderFiled` and the folder to cleanup, and add a live check to the changelog.
