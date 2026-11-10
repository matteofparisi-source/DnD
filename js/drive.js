// Optional Google Drive mirror of the save data. Loaded on demand (never at startup).
// Local storage is always the master copy; Drive holds one visible folder "DnD Slop" in the user's own Drive (scope drive.file).
// The access token lives in memory only: it is never written to localStorage, the save file or a backup.
export const CLIENT_ID = '715649445296-qmqfi5rjrcvph1malt5mkb0batohfagp.apps.googleusercontent.com'; // public identifier, not a secret
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_NAME = 'DnD Slop';
export const FILE_NAME = 'dnd-slop-save.json';
export const KEEP_BACKUPS = 7;
export const OFFLINE_MSG = 'Offline — will sync when you tap Sync';

const GSI_URL = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const BACKUP_RE = /^dnd-slop-\d{4}-\d{2}-\d{2}\.json$/;

export class DriveError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}

// ----- token (memory only)
const mem = { token: '', exp: 0, client: null, gsi: null, pending: null };
const hook = (name, def) => (typeof window[name] === 'number' ? window[name] : def); // test hooks, read only if present
const SIGNIN_TIMEOUT_MS = 120000; // a sign-in that never answers is rejected after this long
export const hasToken = () => !!mem.token && Date.now() < mem.exp;
export const tokenMsLeft = () => (hasToken() ? mem.exp - Date.now() : 0);
// Loads the Google script in advance (only for users who connected before); a failure is ignored.
export const preload = () => prepare().catch(() => {});
const clearToken = () => { mem.token = ''; mem.exp = 0; };

// The Google sign-in script is added only after the user taps Connect / Sync (it cannot be self-hosted).
function loadGsi() {
  if (mem.gsi) return mem.gsi;
  if (navigator.onLine === false) return Promise.reject(new DriveError('offline', OFFLINE_MSG));
  mem.gsi = new Promise((resolve, reject) => {
    const done = () => (window.google?.accounts?.oauth2 ? resolve() : reject(new DriveError('gsi', 'Google sign-in did not load')));
    const s = document.createElement('script');
    s.src = GSI_URL;
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new DriveError('offline', navigator.onLine === false ? OFFLINE_MSG : 'Could not load Google sign-in (offline or blocked)'));
    document.head.appendChild(s);
  }).catch((e) => { mem.gsi = null; throw e; });
  return mem.gsi;
}

const ERR_TEXT = {
  popup_failed_to_open: 'Allow pop-ups for this site, or open the app in the browser',
  popup_closed: 'Sign-in cancelled',
};
function takePending() {
  const p = mem.pending; mem.pending = null;
  if (p) clearTimeout(p.timer);
  return p;
}
// Rejects a sign-in that is still waiting (timeout, returning to the page without an answer, Disconnect).
export function abortPending(message = 'Sign-in did not finish — tap to try again') {
  takePending()?.reject(new DriveError('auth', message));
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && mem.pending && Date.now() - mem.pending.at > hook('__drivePendingVisMs', 5000)) abortPending();
});
function makeClient() {
  if (mem.client) return mem.client;
  mem.client = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      const p = takePending();
      if (!p) return;
      if (!resp || resp.error || !resp.access_token) { p.reject(new DriveError('auth', resp?.error === 'access_denied' ? 'Sign-in cancelled' : 'Google sign-in failed')); return; }
      const oa = window.google?.accounts?.oauth2;
      if (typeof oa?.hasGrantedAllScopes === 'function' && !oa.hasGrantedAllScopes(resp, SCOPE)) {
        p.reject(new DriveError('scope', "Drive permission wasn't granted — tap Connect and allow access to DnD Slop files"));
        return;
      }
      const sec = Number(resp.expires_in);
      mem.token = resp.access_token;
      mem.exp = Date.now() + ((Number.isFinite(sec) && sec > 0 ? sec : 3600) - 60) * 1000; // 60 s margin
      p.resolve();
    },
    error_callback: (err) => {
      const p = takePending();
      p?.reject(new DriveError('auth', ERR_TEXT[err?.type] || 'Google sign-in failed'));
    },
  });
  return mem.client;
}

// Loads the Google script and creates the token client. No pop-up: call it before the tap that signs in.
export async function prepare() {
  await Promise.race([loadGsi(), new Promise((_, rej) => setTimeout(() => rej(new DriveError('gsi', 'Google sign-in is taking too long to load')), hook('__driveGsiTimeoutMs', 20000)))]);
  makeClient();
}
export const isReady = () => !!mem.client;
// Opens the Google sign-in. Must be called SYNCHRONOUSLY from a tap handler (no await before it) after prepare(),
// or the browser may block the pop-up for lack of user activation.
export function requestToken() {
  if (hasToken()) return Promise.resolve();
  if (!mem.client) return Promise.reject(new DriveError('auth', 'Sign-in is not ready yet'));
  return new Promise((resolve, reject) => {
    mem.pending = { resolve, reject, at: Date.now(), timer: setTimeout(() => abortPending('Sign-in timed out — tap to try again'), hook('__driveSignInTimeoutMs', SIGNIN_TIMEOUT_MS)) };
    try { mem.client.requestAccessToken({ prompt: '' }); } catch { takePending(); reject(new DriveError('auth', 'Google sign-in failed')); }
  });
}

export function revokeAccess() {
  const t = mem.token;
  clearToken();
  mem.client = null;
  abortPending('Disconnected');
  if (!t || !window.google?.accounts?.oauth2?.revoke) return Promise.resolve();
  return new Promise((resolve) => { try { window.google.accounts.oauth2.revoke(t, () => resolve()); } catch { resolve(); } });
}

// ----- REST helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoffBase = () => (typeof window.__driveBackoffMs === 'number' ? window.__driveBackoffMs : 800); // test hook
const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// fetch with the bearer token; retries 403/429/5xx with exponential backoff (3 tries).
async function call(url, init = {}) {
  if (!/^https:\/\/www\.googleapis\.com\//.test(url)) throw new DriveError('url', 'Blocked request');
  if (!hasToken()) throw new DriveError('auth', 'Sign in to Google again (tap Sync to Drive)');
  const { once, ...opts } = init; // once: do not retry 5xx here (a create may have happened; the caller re-checks by name)
  let last;
  for (let i = 0; i < 3; i++) {
    let res;
    try {
      res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${mem.token}` } });
    } catch {
      throw new DriveError('offline', navigator.onLine === false ? OFFLINE_MSG : 'Could not reach Google Drive');
    }
    if (res.ok) return res;
    if (res.status === 401) { clearToken(); throw new DriveError('auth', 'Sign in to Google again (tap Sync to Drive)', 401); }
    last = new DriveError(res.status === 404 ? 'notfound' : 'http', `Google Drive said ${res.status}`, res.status);
    if (!(res.status === 403 || res.status === 429 || (res.status >= 500 && !once)) || i === 2) break;
    await sleep(backoffBase() * 2 ** i);
  }
  throw last;
}
const json = async (res) => res.json();

async function listFiles(query, fields = 'files(id,name,modifiedTime)', orderBy = '') {
  const u = `${API}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&spaces=drive&pageSize=200${orderBy ? `&orderBy=${encodeURIComponent(orderBy)}` : ''}`;
  return (await json(await call(u))).files || [];
}
async function getMeta(id, fields = 'id,name,modifiedTime,trashed') {
  return json(await call(`${API}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`));
}
async function getText(id) {
  return (await call(`${API}/${encodeURIComponent(id)}?alt=media`)).text();
}
async function createFolder() {
  const res = await call(`${API}?fields=id`, { once: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }) });
  return (await json(res)).id;
}
function boundary() {
  return `dndslop${[...crypto.getRandomValues(new Uint32Array(3))].map((n) => n.toString(36)).join('')}`;
}
// Runs a create call; after a 5xx or network failure the item may exist already, so look it up by name before trying again.
async function createOnce(create, find) {
  for (let i = 0; ; i++) {
    try { return await create(); } catch (e) {
      if (!(e.code === 'offline' || e.status >= 500) || i >= 2) throw e;
      await sleep(backoffBase() * 2 ** i);
      const found = await find();
      if (found) return found;
    }
  }
}
const findIn = (name, folderId) => listFiles(`name = '${q(name)}' and '${q(folderId)}' in parents and trashed = false`).then((l) => l[0]);
async function createFile(name, folderId, text) {
  return createOnce(() => createFileRaw(name, folderId, text), () => findIn(name, folderId));
}
async function createFileRaw(name, folderId, text) {
  const b = boundary();
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' })}\r\n--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${b}--`;
  const res = await call(`${UPLOAD}?uploadType=multipart&fields=id,modifiedTime`, { once: true, method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
  return json(res);
}
async function updateFile(id, text) {
  const res = await call(`${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text });
  return json(res);
}
async function deleteFile(id) { await call(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' }); }

const findFolder = () => listFiles(`name = '${q(FOLDER_NAME)}' and mimeType = '${FOLDER_MIME}' and trashed = false`, 'files(id,name,modifiedTime)', 'createdTime'); // oldest first
// The folder: the stored id if it still exists, else a search by name, else a new one.
async function ensureFolder(d) {
  if (d.folderId) {
    try { const m = await getMeta(d.folderId); if (!m.trashed) return d.folderId; } catch (e) { if (e.code !== 'notfound') throw e; }
    d.folderId = ''; d.fileId = '';
  }
  const found = await findFolder();
  d.folderId = found[0]?.id || (await createOnce(async () => ({ id: await createFolder() }), () => findFolder().then((l) => l[0]))).id;
  d.fileId = '';
  return d.folderId;
}
// The save file: the stored id if it still exists inside the folder, else a search by name; null when there is none.
async function findSave(d) {
  if (d.fileId) {
    try { const m = await getMeta(d.fileId); if (!m.trashed) return m; } catch (e) { if (e.code !== 'notfound') throw e; }
    d.fileId = '';
  }
  const found = await listFiles(`name = '${q(FILE_NAME)}' and '${q(d.folderId)}' in parents and trashed = false`);
  if (found[0]) { d.fileId = found[0].id; return found[0]; }
  return null;
}

// One backup per local day, the newest KEEP_BACKUPS kept. Only files the app named dnd-slop-YYYY-MM-DD.json are touched.
async function dailyBackup(d, text, day) {
  if (d.backupDay === day) return;
  const files = await listFiles(`'${q(d.folderId)}' in parents and trashed = false`);
  const name = `dnd-slop-${day}.json`;
  if (!files.some((f) => f.name === name)) files.push(await createFile(name, d.folderId, text).then((f) => ({ ...f, name })));
  const old = files.filter((f) => BACKUP_RE.test(f.name)).sort((a, b) => (a.name < b.name ? 1 : -1)).slice(KEEP_BACKUPS);
  for (const f of old) { try { await deleteFile(f.id); } catch (e) { if (e.code !== 'notfound') throw e; } }
  d.backupDay = day;
}

const stamp = (t = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}`;
};
const time = (v) => { const n = Date.parse(v); return Number.isFinite(n) ? n : 0; };

export function deviceLabel() {
  const ua = navigator.userAgent || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os} ${br}`;
}

// A downloaded save: parsed JSON of the same shape as a backup (checked by host.validate), plus who saved it and when.
async function fetchRemote(host, id) {
  let data;
  try { data = JSON.parse(await getText(id)); } catch (e) { if (e instanceof DriveError) throw e; throw new DriveError('invalid', 'The file in Drive could not be read'); }
  if (!host.validate(data)) throw new DriveError('invalid', 'The file in Drive is not a backup from this app');
  if (host.tooNew(data)) throw new DriveError('newer', 'This save comes from a newer version of the app — reload the app first');
  return data;
}

// Metadata-only check of the save file's modifiedTime ('' when unknown). Used to skip repeated downloads while a conflict waits for review.
export async function peekRemote(d) {
  if (!hasToken() || !d.fileId) return '';
  try { return (await getMeta(d.fileId, 'modifiedTime')).modifiedTime || ''; } catch { return ''; }
}

// Sync. `host` is supplied by app.js:
//   isDirty(), upload() -> { text, hash }, validate(data), applyRemote(data, meta) (snapshots, replaces data), markSynced(hash), ask(info) -> 'drive'|'keep'|'cancel', toast(msg)
// `d` is state.ui.drive (mutated: ids and timestamps). Returns { status: 'uploaded'|'downloaded'|'uptodate'|'conflict'|'cancelled' }.
export async function sync(host, d, { interactive = false, beforeImport = false } = {}) {
  if (!hasToken()) throw new DriveError('auth', 'Sign in to Google again (tap Sync to Drive)');
  await ensureFolder(d);
  const file = await findSave(d);
  if (file) {
    const remoteNewer = time(file.modifiedTime) > time(d.lastRemoteModified);
    if (remoteNewer) {
      const remote = await fetchRemote(host, file.id);
      const meta = { device: String(remote.device || 'another device').slice(0, 40), savedAt: remote.savedAt, modifiedTime: file.modifiedTime };
      let choice = 'drive';
      if (host.isDirty()) {
        if (!interactive) return { status: 'conflict', modifiedTime: file.modifiedTime };
        choice = await host.ask(meta);
      }
      if (choice === 'cancel') return { status: 'cancelled' };
      if (choice === 'drive') {
        // isDirty() was checked after the download, with nothing awaited since, so an edit made during the fetch is caught above
        host.applyRemote(remote, meta);
        d.lastRemoteModified = file.modifiedTime;
        d.lastSyncAt = new Date().toISOString();
        return { status: 'downloaded', meta };
      }
      // keep this device's version: the remote copy is kept in the folder first
      await createFile(`dnd-slop-conflict-${stamp()}.json`, d.folderId, JSON.stringify(remote, null, 2));
      beforeImport = false; // the remote copy is already kept
    } else if (!host.isDirty()) {
      d.lastSyncAt = new Date().toISOString();
      return { status: 'uptodate' };
    }
  }
  if (file && beforeImport) await createFile(`dnd-slop-before-import-${stamp()}.json`, d.folderId, await getText(file.id)); // imported data is about to replace this
  const up = host.upload();
  let saved;
  if (file) {
    try { saved = await updateFile(file.id, up.text); } catch (e) {
      if (e.code !== 'notfound') throw e;
      d.fileId = ''; saved = await createFile(FILE_NAME, d.folderId, up.text);
    }
  } else saved = await createFile(FILE_NAME, d.folderId, up.text);
  d.fileId = saved.id;
  d.lastRemoteModified = saved.modifiedTime || new Date().toISOString();
  d.lastSyncAt = new Date().toISOString();
  host.markSynced(up.hash);
  host.save(); // keep the sync state even if the backup step below fails
  try { await dailyBackup(d, up.text, host.today()); } catch (e) { if (e.code === 'auth' || e.code === 'offline') throw e; /* backups are best effort */ }
  return { status: 'uploaded' };
}

// Downloads the save file for "Restore from Drive" (null when there is none). Throws DriveError.
export async function download(host, d) {
  if (!hasToken()) throw new DriveError('auth', 'Sign in to Google again (tap Sync to Drive)');
  await ensureFolder(d);
  const file = await findSave(d);
  if (!file) return null;
  const data = await fetchRemote(host, file.id);
  return { data, modifiedTime: file.modifiedTime, meta: { device: String(data.device || 'another device').slice(0, 40), savedAt: data.savedAt, modifiedTime: file.modifiedTime } };
}
