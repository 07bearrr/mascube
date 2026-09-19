/* ============================================================
   数据存储层：本地 localStorage 或 云端 Supabase 二选一
   对外只暴露 getAll / add / update / remove 四个方法，
   上层（app.js）不关心数据到底存在哪里。
   ============================================================ */
const Storage = (() => {
  const LOCAL_KEY = 'mascube_orders';
  let cfg = null;
  let useCloud = false;

  function init() {
    cfg = window.APP_CONFIG || {};
    useCloud = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && cfg.tableName);
  }

  function isCloud() { return useCloud; }

  /* ---------- 本地模式 ---------- */
  function localGet() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function localSet(list) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  }

  /* ---------- 云端模式（Supabase REST 接口，无需额外库） ---------- */
  async function rest(path, options = {}) {
    const base = cfg.supabaseUrl.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method: options.method || 'GET',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText}：${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function getAll() {
    if (useCloud) {
      return await rest(`${cfg.tableName}?select=*&order=created_at.desc`);
    }
    return localGet();
  }

  async function add(record) {
    if (useCloud) {
      const rows = await rest(cfg.tableName, {
        method: 'POST',
        body: JSON.stringify(record),
        headers: { Prefer: 'return=representation' },
      });
      return rows && rows[0];
    }
    const list = localGet();
    list.unshift(record);
    localSet(list);
    return record;
  }

  async function update(id, changes) {
    if (useCloud) {
      const rows = await rest(`${cfg.tableName}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
        headers: { Prefer: 'return=representation' },
      });
      return rows && rows[0];
    }
    const list = localGet();
    const i = list.findIndex(r => r.id === id);
    if (i >= 0) {
      list[i] = { ...list[i], ...changes, updated_at: new Date().toISOString() };
      localSet(list);
      return list[i];
    }
    return null;
  }

  async function remove(id) {
    if (useCloud) {
      await rest(`${cfg.tableName}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return;
    }
    localSet(localGet().filter(r => r.id !== id));
  }

  return { init, isCloud, getAll, add, update, remove };
})();
