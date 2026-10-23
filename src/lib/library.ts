import type { LibraryManifest, SchemaEntry, VersionEntry } from './types';

/**
 * The schema library is cached by the app, not by the precached app shell:
 *  - manifest.json: network-first (cache-busting query, 3 s timeout), cache fallback
 *  - <name>/<v>.json: cache-first; versions are immutable and checksummed
 */
const CACHE_NAME = 'schema-library-v1';
const BASE = `${import.meta.env.BASE_URL}schemas/`;
const MANIFEST_URL = `${BASE}manifest.json`;
const MANIFEST_TIMEOUT_MS = 3000;

export type LibrarySource = 'online' | 'cache';

export interface LoadedManifest {
  manifest: LibraryManifest;
  source: LibrarySource;
}

const hasCacheStorage = () => typeof caches !== 'undefined';

async function openCache(): Promise<Cache | null> {
  if (!hasCacheStorage()) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function assertManifest(value: unknown): asserts value is LibraryManifest {
  const m = value as LibraryManifest;
  if (!m || typeof m.generatedAt !== 'string' || !Array.isArray(m.schemas)) {
    throw new Error('manifest.json has an unexpected shape');
  }
}

export async function loadManifest(): Promise<LoadedManifest> {
  const cache = await openCache();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
    // GitHub Pages does not let us set cache headers, so bust caches with a query.
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const manifest: unknown = JSON.parse(text);
    assertManifest(manifest);
    await cache?.put(MANIFEST_URL, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
    return { manifest, source: 'online' };
  } catch (networkError) {
    const cached = await cache?.match(MANIFEST_URL);
    if (!cached) {
      throw new Error(
        'The schema library could not be downloaded and no offline copy is stored yet. ' +
          'Connect to the network once to download it.',
        { cause: networkError },
      );
    }
    const manifest: unknown = await cached.json();
    assertManifest(manifest);
    return { manifest, source: 'cache' };
  }
}

const versionUrl = (v: VersionEntry) => `${BASE}${v.path}`;

/** Loads a schema version (cache-first) and checks it against the manifest checksum. */
export async function loadSchemaVersion(v: VersionEntry): Promise<object> {
  const url = versionUrl(v);
  const cache = await openCache();

  const cached = await cache?.match(url);
  if (cached) {
    const bytes = await cached.arrayBuffer();
    if ((await sha256Hex(bytes)) === v.sha256) return JSON.parse(new TextDecoder().decode(bytes)) as object;
    await cache?.delete(url); // corrupted or tampered: drop it and refetch
  }

  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not download ${v.path} (HTTP ${res.status}). Are you offline?`);
  const bytes = await res.arrayBuffer();
  if ((await sha256Hex(bytes)) !== v.sha256) {
    throw new Error(`${v.path} does not match its checksum in the manifest; refusing to use it.`);
  }
  await cache?.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/json' } }));
  return JSON.parse(new TextDecoder().decode(bytes)) as object;
}

/** Downloads every version of every active schema that is not cached yet. */
export async function prefetchLibrary(manifest: LibraryManifest): Promise<{ fetched: number; failed: number }> {
  const cache = await openCache();
  if (!cache) return { fetched: 0, failed: 0 };
  let fetched = 0;
  let failed = 0;
  const missing: VersionEntry[] = [];
  for (const s of manifest.schemas) {
    if (s.status !== 'ACTIVE') continue;
    for (const v of s.versions) if (!(await cache.match(versionUrl(v)))) missing.push(v);
  }
  // A few at a time keeps the first load light.
  for (let i = 0; i < missing.length; i += 4) {
    const results = await Promise.allSettled(missing.slice(i, i + 4).map(loadSchemaVersion));
    for (const r of results) r.status === 'fulfilled' ? fetched++ : failed++;
  }
  return { fetched, failed };
}

/** Asks the browser not to evict the offline library under storage pressure. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* best effort */
  }
}

export const activeSchemas = (m: LibraryManifest): SchemaEntry[] => m.schemas.filter((s) => s.status === 'ACTIVE');

export function libraryAgeDays(generatedAt: string, now = Date.now()): number {
  return (now - Date.parse(generatedAt)) / 86_400_000;
}
