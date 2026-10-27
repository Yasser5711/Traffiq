// Offline IP geolocation with the DB-IP "IP to City Lite" database (CC BY 4.0).
// The database (~130 MB) is downloaded to the data volume on first start and refreshed
// monthly. Nothing about visitors is sent anywhere: lookups happen in memory.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Reader, type CityResponse } from 'mmdb-lib';
import { config } from './config';
import { isPrivateIp } from './parse';

export interface Geo {
  country: string; // ISO 3166-1 alpha-2, '' when unknown
  countryName: string;
  city: string;
  lat: number | null;
  lon: number | null;
}

const UNKNOWN: Geo = { country: '', countryName: '', city: '', lat: null, lon: null };
const REFRESH_MS = 30 * 24 * 3600e3;
const CHECK_MS = 24 * 3600e3;
const CACHE_MAX = 20_000;

let reader: Reader<CityResponse> | null = null;
const cache = new Map<string, Geo>();

export const geoState = {
  enabled: config.geoip.enabled,
  loaded: false,
  builtAt: null as number | null,
  error: null as string | null,
  downloading: false,
};

function monthTag(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function download(path: string) {
  geoState.downloading = true;
  try {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    // The current month's file appears a few days into the month; fall back to last month.
    for (const tag of [monthTag(now), monthTag(prev)]) {
      const url = `https://download.db-ip.com/free/dbip-city-lite-${tag}.mmdb.gz`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const gz = new Uint8Array(await res.arrayBuffer());
      const data = Bun.gunzipSync(gz);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path + '.tmp', data);
      renameSync(path + '.tmp', path);
      console.log(`[geo] downloaded DB-IP City Lite ${tag} (${(data.length / 1e6).toFixed(0)} MB)`);
      return true;
    }
    throw new Error('DB-IP download failed');
  } finally {
    geoState.downloading = false;
  }
}

function load(path: string) {
  reader = new Reader<CityResponse>(readFileSync(path));
  cache.clear();
  geoState.loaded = true;
  geoState.builtAt = reader.metadata.buildEpoch ? new Date(reader.metadata.buildEpoch).getTime() : null;
  geoState.error = null;
  console.log(`[geo] loaded ${path}`);
}

/** Loads (downloading if needed) the database. Resolves once lookups are available. */
export async function initGeo(onReady: () => void) {
  if (!config.geoip.enabled) return;
  const path = config.geoip.path;
  try {
    const stale = !existsSync(path) || Date.now() - statSync(path).mtimeMs > REFRESH_MS;
    if (stale && config.geoip.autoDownload) await download(path).catch(e => {
      if (!existsSync(path)) throw e;
      console.warn('[geo] refresh failed, keeping the current database:', String(e));
    });
    if (!existsSync(path)) throw new Error(`GeoIP database not found at ${path}`);
    load(path);
    onReady();
  } catch (e) {
    geoState.error = String(e instanceof Error ? e.message : e);
    console.warn('[geo]', geoState.error);
  }
  // Check once a day whether the database is due for its monthly refresh. (A single
  // 30-day timer would overflow setInterval's 32-bit limit and fire immediately.)
  setInterval(refreshIfStale, CHECK_MS);
}

async function refreshIfStale() {
  const path = config.geoip.path;
  if (!config.geoip.autoDownload || geoState.downloading) return;
  if (existsSync(path) && Date.now() - statSync(path).mtimeMs < REFRESH_MS) return;
  try {
    await download(path);
    load(path);
  } catch (e) {
    console.warn('[geo] refresh failed:', String(e));
  }
}

export const geoReady = () => reader !== null;

export function lookup(ip: string): Geo {
  if (!reader || isPrivateIp(ip)) return UNKNOWN;
  const hit = cache.get(ip);
  if (hit) return hit;
  let g = UNKNOWN;
  try {
    const r = reader.get(ip);
    if (r?.country?.iso_code) {
      g = {
        country: r.country.iso_code,
        countryName: r.country.names?.en ?? r.country.iso_code,
        city: r.city?.names?.en ?? '',
        lat: r.location?.latitude ?? null,
        lon: r.location?.longitude ?? null,
      };
    }
  } catch {
    /* malformed address */
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(ip, g);
  return g;
}
