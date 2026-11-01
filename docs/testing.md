# Testing with core's fakes

Core 0.5.0 ships the fakes its own tests use, so a module's Node tests can check its wiring the same way:
`vendor/wanderers-core/testing/index.mjs`.

**Dev only, not for runtime.** Never import it from a module's `scripts/`. A module's release zip leaves it out
(`-x 'vendor/wanderers-core/testing/*'`, see [module-ci.md](module-ci.md)); the vendored folder in the repo keeps it, because the pin
check hashes every file. The fakes check what a module reads, writes, registers and refuses; they are not Foundry, so anything they
pass still goes on the changelog's *Untested in Foundry* list.

```js
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeWorld, installFakes, actAs, FakeApplicationV2 } from "../vendor/wanderers-core/testing/index.mjs";

let world, restore, gm, player;
beforeEach(() => {
  world = fakeWorld({ users: [{ name: "GM", isGM: true }, { name: "Pat" }], modules: [{ id: "my-module" }] });
  [gm, player] = world.users.contents;
  restore = installFakes(world, gm);              // globalThis.game, Hooks, JournalEntry, Folder, CONST, ui
});
afterEach(() => restore());

test("players can't write the store", async () => {
  const { Store } = await import("../scripts/store.mjs");
  actAs(world, player);                            // same world, the player's client
  await assert.rejects(Store.set("notes", {}));
});
```

| Export | What it is |
|---|---|
| `fakeWorld({ users, modules })` | Shared users, journal, folders, world setting values, Hooks; `client(user)` builds one client's `game` (`user`, `users` with `activeGM`, `journal`, `folders`, `modules`, `settings`, `keybindings`, `socket`) |
| `installFakes(world, user, { deletionOperator })` | Puts that client and the shared globals on `globalThis`; returns `restore()`. `deletionOperator: true` sets `_del` (v14 style deletions) |
| `actAs(world, user)` | Switches `globalThis.game` to another user's client |
| Documents | `JournalEntry.create` / `Folder.create` make documents with `flags`, `ownership`, `folder`, `getFlag`, `setFlag`, `unsetFlag`, `update` (dotted keys, merges in place, `-=` and operator deletions, bumps `_stats.modifiedTime`), `delete`, `testUserPermission` |
| `fakeSettings(values)` | `register`, `get` (throws when not registered, like Foundry), `set` (calls `onChange`), values cloned in and out |
| `fakeHooks()` | `on`, `once`, `off`, `call`, `callAll`, `calls`, `listeners(name)` |
| `fakeCollection(items)` | Map by id with `find`, `filter`, `map`, `some`, `contents`, `getName` |
| Socket | `game.socket.emit` delivers to every *other* client on the channel, as that client, with the sender's user id |
| `FakeApplicationV2` | Constructor → `_initializeApplicationOptions`; `render` → `_onFirstRender` once, `_onRender` each time; `setPosition` → `_onPosition`; `minimize`, `maximize`, `close` → `_onClose`. No DOM |
| `applyUpdate(target, data)`, `fakeId()`, `OWNERSHIP`, `FAKE_DEL` | Helpers |

The testing entry is experimental like the rest of 0.x, and it is not part of the runtime API: it may change in any minor release.
