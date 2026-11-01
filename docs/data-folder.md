# Module data folder

Your modules keep GM-only store journals (ownership None). This helper files them together in one JournalEntry folder named
**"Module data"** and hides that folder from the Journal sidebar, so the GM's Journal tab only shows journals meant for play.

**This is UI tidiness, not secrecy.** Nothing becomes more secret: ownership None already keeps the entries out of players' sidebars,
but their data is still sent to players' clients (checked live on 14.369), and a folder or a hidden element adds no protection. The
stores stay ordinary journals, so they load as fast as before. A GM can show the folder with the module's "Show module data" switch.

Pure rules: `src/data-folder-model.mjs`; Foundry half: `src/foundry/data-folder.mjs`.

## Use

```js
import { ensureDataFolder, fileInDataFolder, removeDataFolderIfEmpty, hideDataFolder } from "../vendor/wanderers-core/foundry/index.mjs";

// init: a client or world Boolean setting "showModuleData" (default false, config true, name "Show module data");
//   onChange: () => ui.journal?.render()
hideDataFolder(ID, { shown: () => game.settings.get(ID, "showModuleData") });   // once, every client

// the module's single writer (leader / active GM), right after it creates or finds its store journal
await fileInDataFolder(ID, storeEntry, { log });

// cleanup: when removing the store journal
const id = storeEntry.id;
await storeEntry.delete();
await removeDataFolderIfEmpty(ID, [id], { log });   // keeps the folder while another module's entry is still in it
```

- `ensureDataFolder(moduleId)` finds or creates the folder (GM only; `null` for players or on failure).
- `fileInDataFolder(moduleId, entry)` moves the entry in only when it sits at root level; an entry the GM put in another folder stays.
- `removeDataFolderIfEmpty(moduleId, removedIds)` deletes the folder only when nothing but `removedIds` is in it. Pass the ids you are
  removing (or call it after they are gone). Subfolders count as contents.
- None of these throw; a failure is a console warning (or `{ log: { warn } }`) and the entry stays where it was.
- Call the writing helpers only from the module's single writer, like any other automatic write.

## Hiding

`hideDataFolder(moduleId, { shown })` registers `renderJournalDirectory` once per module. On each render it removes the folder's
element (`[data-folder-id]`), its subfolders' and all their entries (`[data-entry-id]`) from the directory DOM, so the directory
search (which filters those elements) cannot list them. The folder shows when **any** of these is true, with no shared state between
modules: this module's `shown()`, or the setting `<moduleId>.showModuleData` of any other active module that registered one (read
only). So one module's switch shows the folder for all of them. Re-render the directory when the setting changes (`ui.journal?.render()`).

## Matching and renaming

No shared flag marks the folder (namespacing: modules never write a shared flag). The folder is matched by exact name "Module data",
type JournalEntry and root level. Renaming it, or dragging it into another folder, makes each module create a new "Module data"
folder the next time it files its entry. With several matches the lowest `sort`, then lowest id, wins. New folders use manual sorting
with a very high `sort`, so they sit at the bottom; Foundry shows folders collapsed until opened.
