// In-memory fake Google Drive + browser-side Google Identity stub, for the Drive suite. No network, no real account.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeFake() {
  const F = { files: new Map(), n: 0, tick: 0, log: [], failNext: [] };
  const now = () => new Date(Date.UTC(2026, 10, 10, 12, 0, 0) + (++F.tick) * 1000).toISOString();
  F.add = (o) => { const f = { id: `id${++F.n}`, name: '', mimeType: 'application/json', parents: [], trashed: false, content: '', modifiedTime: now(), ...o }; F.files.set(f.id, f); return f; };
  F.byName = (name) => [...F.files.values()].filter((f) => f.name === name && !f.trashed);
  F.folder = () => F.byName('DnD Slop')[0];
  F.save = () => F.byName('dnd-slop-save.json')[0];
  F.backups = () => [...F.files.values()].filter((f) => /^dnd-slop-\d{4}-\d{2}-\d{2}\.json$/.test(f.name));
  F.conflicts = () => [...F.files.values()].filter((f) => /^dnd-slop-conflict-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(f.name));
  F.puts = () => F.log.filter((l) => l.startsWith('PATCH ') || l.startsWith('POST upload')).length;
  // Simulates another device saving a newer file.
  F.external = (mut) => { const f = F.save(); const d = JSON.parse(f.content); mut(d); d.savedAt = new Date().toISOString(); d.device = 'Windows Edge'; f.content = JSON.stringify(d); f.modifiedTime = now(); };
  const meta = (f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, trashed: f.trashed, mimeType: f.mimeType });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
  const j = (route, body, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  F.handler = async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (F.delay) await sleep(F.delay);
    if (F.delayMedia && u.searchParams.get('alt') === 'media') await sleep(F.delayMedia);
    F.log.push(`${m} ${u.pathname}${u.searchParams.get('uploadType') ? '?' + u.searchParams.get('uploadType') : ''}${u.searchParams.get('alt') ? '?alt' : ''}`);
    if (req.headers().authorization !== 'Bearer test') return j(route, { error: 'auth' }, 401);
    if (F.failNext.length) return j(route, { error: 'x' }, F.failNext.shift());
    const path = u.pathname;
    if (m === 'GET' && path === '/drive/v3/files') {
      let list = [...F.files.values()];
      for (const part of (u.searchParams.get('q') || '').split(' and ')) {
        let r;
        if ((r = /^name = '(.*)'$/.exec(part))) list = list.filter((f) => f.name === r[1].replace(/\\'/g, "'"));
        else if ((r = /^mimeType = '(.*)'$/.exec(part))) list = list.filter((f) => f.mimeType === r[1]);
        else if ((r = /^'(.*)' in parents$/.exec(part))) list = list.filter((f) => f.parents.includes(r[1]));
        else if (part === 'trashed = false') list = list.filter((f) => !f.trashed);
        else return j(route, { error: 'bad q ' + part }, 400);
      }
      return j(route, { files: list.map(meta) });
    }
    if (m === 'POST' && path === '/drive/v3/files') { const b = JSON.parse(req.postData()); return j(route, meta(F.add({ name: b.name, mimeType: b.mimeType, parents: b.parents || [] }))); }
    if (m === 'POST' && path === '/upload/drive/v3/files') {
      const bd = /boundary=(.+)$/.exec(req.headers()['content-type'] || '')[1];
      const parts = req.postData().split(`--${bd}`).filter((s) => s.trim() && s.trim() !== '--');
      const body = (s) => s.slice(s.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
      const md = JSON.parse(body(parts[0]));
      const created = F.add({ name: md.name, mimeType: md.mimeType, parents: md.parents, content: body(parts[1]) });
      if (F.create503 && md.name === 'dnd-slop-save.json') { F.create503--; return j(route, { error: 'x' }, 503); } // created, but the answer was lost
      return j(route, meta(created));
    }
    let r;
    if ((r = /^\/upload\/drive\/v3\/files\/(.+)$/.exec(path)) && m === 'PATCH') {
      const f = F.files.get(r[1]); if (!f) return j(route, { error: 'nf' }, 404);
      f.content = req.postData(); f.modifiedTime = now(); return j(route, meta(f));
    }
    if ((r = /^\/drive\/v3\/files\/(.+)$/.exec(path))) {
      const f = F.files.get(r[1]); if (!f) return j(route, { error: 'nf' }, 404);
      if (m === 'GET') return u.searchParams.get('alt') === 'media' ? route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: f.content }) : j(route, meta(f));
      if (m === 'DELETE') { F.files.delete(r[1]); return route.fulfill({ status: 204, headers: cors }); }
    }
    return j(route, { error: 'unhandled' }, 400);
  };
  return F;
}

// Runs in the page before the app: replaces window.google.accounts.oauth2. __ratLog records whether requestAccessToken ran inside a user gesture.
export const STUB = () => {
  window.__tokenTtl = 3599; window.__popupFail = ''; window.__rat = 0; window.__ratLog = [];
  document.addEventListener('click', () => { window.__inClick = true; setTimeout(() => { window.__inClick = false; }, 0); }, true);
  window.google = { accounts: { oauth2: {
    initTokenClient: (cfg) => ({ requestAccessToken: () => {
      window.__rat++; window.__ratLog.push(!!window.__inClick && !!navigator.userActivation?.isActive);
      if (window.__popupHang) return;
      if (window.__popupFail) setTimeout(() => cfg.error_callback({ type: window.__popupFail }), 5);
      else setTimeout(() => cfg.callback({ access_token: 'test', expires_in: window.__tokenTtl }), 5);
    } }),
    hasGrantedAllScopes: () => !window.__noScope,
    revoke: (tok, done) => { window.__revoked = tok; done(); },
  } } };
};
