/**
 * The settings file format shared by every module (pure; tested in Node). One module's file:
 *   { module: "<id>", format: 1, version, exported, world: { key: value }, client: { key: value } }
 * World settings are the GM's world-wide ones; client (and user) settings belong to this browser or user. Record settings (histories,
 * caches, "last version seen") are on the module's skip list and never exported or imported. A hub bundles several of these files.
 */

export const FORMAT = 1;

/** @typedef {{ key: string, scope?: string, value?: unknown }} SettingValue */
/** @typedef {{ scope?: string, type?: unknown, choices?: Record<string, unknown>, range?: { min?: number, max?: number }, name?: string }} SettingDef */
/** @typedef {{ module: string, format: number, version: string, exported: string, world: Record<string, unknown>, client: Record<string, unknown> }} SettingsFile */
/** @typedef {{ key: string, scope: "world" | "client", label: string, from: unknown, to: unknown, changed: boolean, note: string }} ImportRow */
/** @typedef {{ ok: boolean, error: string | null, version: string, rows: ImportRow[], unknown: string[], skipped: string[], invalid: { key: string, reason: string }[] }} ImportResult */

const clone = (/** @type {unknown} */ v) => v === undefined ? null : JSON.parse(JSON.stringify(v));

/**
 * Settings → the export object, keys sorted, skip-listed keys left out.
 * @param {string} moduleId
 * @param {SettingValue[]} values
 * @param {{ version?: string, exported?: string, skip?: Iterable<string> }} [opts]
 * @returns {SettingsFile}
 */
export function buildExport(moduleId, values, { version = "", exported = "", skip = [] } = {}) {
  const no = new Set(skip);
  /** @type {SettingsFile} */
  const out = { module: moduleId, format: FORMAT, version: String(version), exported: String(exported), world: {}, client: {} };
  for (const d of [...(values ?? [])].sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
    if (!d?.key || no.has(d.key)) continue;
    out[d.scope === "world" ? "world" : "client"][d.key] = clone(d.value);
  }
  return out;
}

const typeName = (/** @type {unknown} */ t) => typeof t === "function" ? t.name : typeof t === "string" ? t : "";

/**
 * Whether a value fits a setting's definition: { ok, value, reason }. Numbers are clamped to a range; a choice must be one of the
 * choices. A data field (colour, file path) or anything else: JSON-like values are taken as they are.
 * @param {SettingDef | undefined} def
 * @param {unknown} value
 * @returns {{ ok: true, value: unknown, reason?: string } | { ok: false, reason: string }}
 */
export function checkValue(def, value) {
  const t = typeName(def?.type);
  if (t === "Boolean") return typeof value === "boolean" ? { ok: true, value } : { ok: false, reason: "should be on or off (true or false)" };
  if (t === "Number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, reason: "should be a number" };
    const r = def?.range; const v = r ? Math.min(r.max ?? Infinity, Math.max(r.min ?? -Infinity, value)) : value;
    return v !== value ? { ok: true, value: v, reason: `kept within ${r?.min} to ${r?.max}` } : { ok: true, value: v };
  }
  if (t === "String") {
    if (typeof value !== "string") return { ok: false, reason: "should be text" };
    if (def?.choices && !Object.hasOwn(def.choices, value)) return { ok: false, reason: `"${value}" isn't one of the choices (${Object.keys(def.choices).join(", ")})` };
    return { ok: true, value };
  }
  if (t === "Array") return Array.isArray(value) ? { ok: true, value } : { ok: false, reason: "should be a list" };
  if (t === "Object") return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value } : { ok: false, reason: "should be an object" };
  return value === undefined ? { ok: false, reason: "has no value" } : { ok: true, value };
}

/**
 * Reads one module's settings (file text or object) against the registered settings and current values. Unknown keys and invalid
 * values are reported and ignored; a key filed under the wrong scope is read from its real scope.
 * @param {string} moduleId
 * @param {unknown} input
 * @param {Map<string, SettingDef>} defs
 * @param {Record<string, unknown>} [current]
 * @param {{ skip?: Iterable<string>, requireModule?: boolean, label?: string }} [opts]
 *   requireModule (default true): the file's "module" must be `moduleId`. A hub bundle entry may omit it.
 * @returns {ImportResult}
 */
export function readImport(moduleId, input, defs, current = {}, { skip = [], requireModule = true, label = moduleId } = {}) {
  /** @returns {ImportResult} */
  const fail = (/** @type {string} */ error) => ({ ok: false, error, version: "", rows: [], unknown: [], skipped: [], invalid: [] });
  /** @type {any} */
  let data = input;
  if (typeof input === "string") { try { data = JSON.parse(input); } catch (e) { return fail(`the file isn't valid JSON (${String(/** @type {any} */ (e)?.message ?? e)})`); } }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("the file isn't a settings export");
  if (requireModule || data.module !== undefined) {
    if (data.module !== moduleId) return fail(data.module ? `the file is for "${data.module}", not ${label}` : `the file isn't a ${label} settings export`);
  }
  const formatOk = requireModule ? data.format === FORMAT : data.format === undefined || data.format === FORMAT;
  if (!formatOk) return fail(`unknown file format ${JSON.stringify(data.format ?? null)} (this version reads format ${FORMAT})`);
  const no = new Set(skip);
  /** @type {ImportRow[]} */ const rows = [];
  /** @type {string[]} */ const unknown = [], skipped = [];
  /** @type {{ key: string, reason: string }[]} */ const invalid = [];
  for (const bucket of /** @type {const} */ (["world", "client"])) {
    const src = data[bucket]; if (src === null || src === undefined) continue;
    if (typeof src !== "object" || Array.isArray(src)) return fail(`"${bucket}" should be a list of settings`);
    for (const [key, value] of Object.entries(src)) {
      if (no.has(key)) { skipped.push(key); continue; }
      const def = defs.get(key);
      if (!def) { unknown.push(key); continue; }
      const c = checkValue(def, value);
      if (!c.ok) { invalid.push({ key, reason: c.reason }); continue; }
      const scope = def.scope === "world" ? "world" : "client";
      const from = current[key];
      rows.push({ key, scope, label: def.name || key, from, to: c.value, changed: JSON.stringify(from ?? null) !== JSON.stringify(c.value ?? null), note: [c.reason, scope !== bucket ? `filed under ${bucket}, applied as a ${scope} setting` : ""].filter(Boolean).join("; ") });
    }
  }
  return { ok: true, error: null, version: String(data.version ?? ""), rows, unknown, skipped, invalid };
}

/**
 * A value for a preview table, short.
 * @param {unknown} v
 * @param {number} [max]
 * @returns {string}
 */
export function preview(v, max = 60) {
  const s = v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v) ?? "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * The export's file name: <module>-settings-<world>-<yyyy-mm-dd>.json.
 * @param {string} moduleId
 * @param {string} [world]
 * @param {Date | number | string} [date]
 * @returns {string}
 */
export function fileName(moduleId, world = "", date = new Date()) {
  const d = new Date(date);
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const day = Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const w = String(world).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [`${moduleId}-settings`, w, day].filter(Boolean).join("-") + ".json";
}
