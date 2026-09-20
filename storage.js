/* ============================================================
   数据存储层：本地 localStorage 或 云端 Supabase 二选一
   支持多个数据集合（orders / contracts），并支持文件上传。

   对外方法都带 collection 参数（如 'orders' / 'contracts'）：
   getAll / add / update / remove / uploadFile
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

  /* ---------- 文件存储（合同原文件） ---------- */
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // 返回 { name, type, size, url?, path?, dataUrl? }
  async function uploadFile(file) {
    if (useCloud) {
      const base = cfg.supabaseUrl.replace(/\/+$/, '');
      const bucket = cfg.storageBucket || 'contract-files';
      const safe = (file.name || 'file').replace(/[^\w.\-一-龥]+/g, '_');
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
      const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: 'Bearer ' + cfg.supabaseAnonKey,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error('上传文件失败：' + text);
      }
      return {
        name: file.name,
        type: file.type,
        size: file.size,
        path,
        url: `${base}/storage/v1/object/public/${bucket}/${path}`,
      };
    }
    const dataUrl = await fileToDataUrl(file);
    return { name: file.name, type: file.type, size: file.size, dataUrl };
  }

  return { init, isCloud, getAll, add, update, remove, uploadFile };
})();
