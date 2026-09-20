/* ============================================================
   数据存储层：本地 localStorage 或 云端 Supabase 二选一
   支持多个数据集合，方法都带 collection 参数。
   ============================================================ */
const Storage = (() => {
  const LOCAL_PREFIX = 'mascube_';
  let cfg = null;
  let useCloud = false;

  function init() {
    cfg = window.APP_CONFIG || {};
    useCloud = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  function isCloud() { return useCloud; }

  function tableFor(collection) {
    if (cfg.tables && cfg.tables[collection]) return cfg.tables[collection];
    if (collection === 'orders' && cfg.tableName) return cfg.tableName;
    return collection;
  }
  function localKey(collection) { return LOCAL_PREFIX + collection; }

  /* ---------- 本地模式 ---------- */
  function localGet(collection) {
    try { return JSON.parse(localStorage.getItem(localKey(collection)) || '[]'); }
    catch (e) { return []; }
  }
  function localSet(collection, list) {
    localStorage.setItem(localKey(collection), JSON.stringify(list));
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

  async function getAll(collection) {
    if (useCloud) return await rest(`${tableFor(collection)}?select=*&order=created_at.desc`);
    return localGet(collection);
  }

  async function add(collection, record) {
    if (useCloud) {
      const rows = await rest(tableFor(collection), {
        method: 'POST',
        body: JSON.stringify(record),
        headers: { Prefer: 'return=representation' },
      });
      return rows && rows[0];
    }
    const list = localGet(collection);
    list.unshift(record);
    localSet(collection, list);
    return record;
  }

  async function update(collection, id, changes) {
    if (useCloud) {
      const rows = await rest(`${tableFor(collection)}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
        headers: { Prefer: 'return=representation' },
      });
      return rows && rows[0];
    }
    const list = localGet(collection);
    const i = list.findIndex(r => r.id === id);
    if (i >= 0) {
      list[i] = { ...list[i], ...changes, updated_at: new Date().toISOString() };
      localSet(collection, list);
      return list[i];
    }
    return null;
  }

  async function remove(collection, id) {
    if (useCloud) {
      await rest(`${tableFor(collection)}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return;
    }
    localSet(collection, localGet(collection).filter(r => r.id !== id));
  }

  return { init, isCloud, getAll, add, update, remove };
})();
