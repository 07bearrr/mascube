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

  /* 当前登录用户（普通用户只看自己的数据，管理员看全部） */
  function ownerFor() {
    if (typeof Auth === 'undefined' || typeof Auth.currentUser !== 'function') return null;
    const u = Auth.currentUser();
    if (!u || Auth.isAdmin()) return null;
    return u;
  }

  /* 全局集合：不做按账号隔离，所有账号读写同一份（如系统配置、账号表） */
  function isGlobalCollection(collection) {
    return collection === 'users' || collection === 'app_config';
  }

  async function getAll(collection) {
    const owner = isGlobalCollection(collection) ? null : ownerFor();
    if (useCloud) {
      const filter = owner ? `&owner=eq.${encodeURIComponent(owner)}` : '';
      const order = (collection === 'settings' || collection === 'app_config') ? '' : '&order=created_at.desc';
      return await rest(`${tableFor(collection)}?select=*${filter}${order}`);
    }
    let list = localGet(collection);
    if (owner) list = list.filter(r => r.owner === owner);
    return list;
  }

  async function add(collection, record) {
    if (!isGlobalCollection(collection) && typeof Auth !== 'undefined' && typeof Auth.currentUser === 'function') {
      const u = Auth.currentUser();
      if (u) record = { ...record, owner: u };
    }
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
    const owner = isGlobalCollection(collection) ? null : ownerFor();
    if (useCloud) {
      const filter = owner ? `&owner=eq.${encodeURIComponent(owner)}` : '';
      const rows = await rest(`${tableFor(collection)}?id=eq.${encodeURIComponent(id)}${filter}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
        headers: { Prefer: 'return=representation' },
      });
      return rows && rows[0];
    }
    const list = localGet(collection);
    const i = list.findIndex(r => r.id === id && (!owner || r.owner === owner));
    if (i >= 0) {
      list[i] = { ...list[i], ...changes, updated_at: new Date().toISOString() };
      localSet(collection, list);
      return list[i];
    }
    return null;
  }

  async function remove(collection, id) {
    const owner = isGlobalCollection(collection) ? null : ownerFor();
    if (useCloud) {
      const filter = owner ? `&owner=eq.${encodeURIComponent(owner)}` : '';
      await rest(`${tableFor(collection)}?id=eq.${encodeURIComponent(id)}${filter}`, { method: 'DELETE' });
      return;
    }
    localSet(collection, localGet(collection).filter(r => !(r.id === id && (!owner || r.owner === owner))));
  }

  return { init, isCloud, getAll, add, update, remove };
})();
