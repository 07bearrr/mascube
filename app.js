/* ============================================================
   业务员辅助系统
   模块一：合同管理（合同 + 产品信息，不含进度）
   模块二：进度追踪（关联合同，更新每个货号的订单进度）
   ============================================================ */

const ORDER_TYPES = ['翻单', '新单'];

const CHECK_STEPS = [
  { key: 'quote_confirmed', label: '已收到返单工厂单价交期' },
  { key: 'pi_sent', label: 'PI已发送' },
  { key: 'po_received', label: 'PO已收到' },
  { key: 'recheck_price', label: '已复核单价交期' },
  { key: 'contract_drafted', label: '已撰写采购合同' },
  { key: 'contract_stamped', label: '合同已敲章' },
  { key: 'countersigned', label: '供应商已提供回签' },
];

const SELECT_STEPS = [
  { key: 'bulk_prod', label: '大货制作', doneValue: '大货制作完毕', options: ['大货制作中', '大货制作完毕'] },
  { key: 'bulk_sample', label: '大货样', doneValue: '大货样已寄出', options: ['大货样未寄出', '大货样已寄出'] },
  { key: 'bulk_photos', label: '大货照', doneValue: '大货照已齐', options: ['大货照未齐', '大货照已齐'] },
  { key: 'warehouse_receipt', label: '进仓单', doneValue: '进仓单已发', options: ['进仓单未发', '进仓单已发'] },
  { key: 'warehouse', label: '进仓', doneValue: '已进仓', options: ['未进仓', '已进仓'] },
  { key: 'inspection', label: '验货', doneValue: '本人已验货', options: ['本人未验货', '本人已验货'] },
];

const PACKAGING_TYPES = [
  { key: 'color_box', label: '彩盒' },
  { key: 'mid_box', label: '中盒', allowNone: true },
  { key: 'outer_carton', label: '外箱' },
];

const PACKAGING_STAGES = ['沿用老设计', '等客户做设计', '我们设计改条码中', '设计文件已发包装厂/工厂', '包装厂/工厂已制作出制版', '制版已确认'];

const TOTAL_STEPS = CHECK_STEPS.length + 1 + SELECT_STEPS.length;

const ITEM_FIELDS = [
  { key: 'item_no', label: '货号', group: '基本信息' },
  { key: 'unit', label: '计量单位', group: '基本信息' },
  { key: 'order_type', label: '订单类型', type: 'select', options: ORDER_TYPES, group: '基本信息' },
  { key: 'description', label: '产品描述', span: 4, group: '基本信息' },

  { key: 'pack_size', label: '装量', num: true, group: '数量与金额' },
  { key: 'boxes', label: '箱数', num: true, group: '数量与金额' },
  { key: 'total_qty', label: '总数(装量×箱数)', readonly: true, group: '数量与金额' },
  { key: 'unit_price', label: '单价(含税)', num: true, group: '数量与金额' },
  { key: 'amount', label: '金额(总数×单价)', readonly: true, group: '数量与金额' },

  { key: 'delivery_date', label: '交货日期', type: 'date', group: '日期' },
  { key: 'ship_date', label: '船期', type: 'date', group: '日期' },

  { key: 'ean_each', label: 'EAN/EACH条码', group: '条码信息' },
  { key: 'mid_box_barcode', label: '中盒条码', group: '条码信息' },
  { key: 'outer_itf14', label: '外箱ITF-14条码', group: '条码信息' },
  { key: 'lot_no', label: 'LOT号', group: '条码信息' },

  { key: 'packaging_req', label: '包装要求', span: 4, group: '其他' },
];

let contracts = [];
let editingId = null;
let currentModule = 'contracts';
let trackContractId = null;
let trackItemId = null;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---------- 工具函数 ---------- */
function genId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
function nowISO() { return new Date().toISOString(); }
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(s) { return s || '—'; }

/* ---------- 数据加载 ---------- */
async function refresh() {
  try {
    contracts = await Storage.getAll('contracts');
    renderList();
    renderTracking();
  } catch (err) {
    console.error(err);
    toast('加载失败：' + err.message, true);
  }
}

function renderModeBadge() {
  const b = $('#modeBadge');
  if (Storage.isCloud()) {
    b.textContent = '云端模式 · 多端同步';
    b.className = 'badge mode cloud';
  } else {
    b.textContent = '本地模式 · 数据仅存本机';
    b.className = 'badge mode';
  }
}

function packagingDone(packaging) {
  const p = packaging && typeof packaging === 'object' ? packaging : {};
  return p.color_box === '制版已确认' &&
         p.outer_carton === '制版已确认' &&
         (p.mid_box === '制版已确认' || p.mid_box === '无中盒');
}
function progressDone(item) {
  const p = item.progress || {};
  let done = 0;
  CHECK_STEPS.forEach(s => { if (p[s.key] === true) done++; });
  if (packagingDone(p.packaging)) done++;
  SELECT_STEPS.forEach(s => { if (p[s.key] === s.doneValue) done++; });
  return done;
}

/* ---------- 模块一：合同管理 ---------- */
function renderList() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const type = $('#typeFilter').value;
  const list = contracts.filter(c => {
    const items = Array.isArray(c.items) ? c.items : [];
    const hay = (c.sales_order_no + ' ' + c.supplier + ' ' + items.map(i => i.item_no).join(' ')).toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (type && !items.some(i => i.order_type === type)) return false;
    return true;
  });

  const rows = list.length ? list.map(c => {
    const items = Array.isArray(c.items) ? c.items : [];
    const itemNos = items.map(i => i.item_no || '—').join('、');
    return `<tr>
      <td>${escapeHtml(c.sales_order_no || '—')}</td>
      <td class="strong">${escapeHtml(c.supplier || '—')}</td>
      <td>${fmtDate(c.sign_date)}</td>
      <td class="cell-wrap">${escapeHtml(itemNos)}</td>
      <td class="ops">
        <button class="btn-mini" data-edit="${c.id}">查看/编辑</button>
        <button class="btn-mini danger" data-del="${c.id}">删除</button>
      </td>
    </tr>`;
  }).join('')
    : `<tr><td colspan="5" class="empty">暂无合同，点右上角「+ 新增合同」开始</td></tr>`;

  $('#contractList').innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>销售单号</th><th>供应商</th><th>签订日期</th><th>货号</th><th style="width:150px">操作</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- 模块二：进度追踪 ---------- */
function renderTracking() {
  const q = $('#trackSearch').value.trim().toLowerCase();
  const type = $('#trackTypeFilter').value;
  const rows = [];
  contracts.forEach(c => {
    (Array.isArray(c.items) ? c.items : []).forEach((it, idx) => {
      if (type && it.order_type !== type) return;
      const hay = ((c.sales_order_no || '') + ' ' + (it.item_no || '')).toLowerCase();
      if (q && !hay.includes(q)) return;
      rows.push({ c, it, idx });
    });
  });

  const body = rows.length ? rows.map(r => {
    const done = progressDone(r.it);
    const pct = Math.round(done / TOTAL_STEPS * 100);
    return `<tr>
      <td>${escapeHtml(r.c.sales_order_no || '—')}</td>
      <td class="strong">${escapeHtml(r.it.item_no || '—')}</td>
      <td>${escapeHtml(r.it.order_type || '未定')}</td>
      <td>${fmtDate(r.it.delivery_date)}</td>
      <td class="cell-progress">
        <div class="track-progress">
          <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
          <span>${done}/${TOTAL_STEPS}</span>
        </div>
      </td>
      <td class="ops">
        <button class="btn-mini" data-track="${r.c.id}" data-item-id="${r.it.id}">更新进度</button>
      </td>
    </tr>`;
  }).join('')
    : `<tr><td colspan="6" class="empty">暂无货号可追踪，请先在「合同管理」新增合同</td></tr>`;

  $('#trackList').innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>销售单号</th><th>货号</th><th>订单类型</th><th>交货日期</th><th>进度</th><th style="width:120px">操作</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

/* ---------- 合同管理：货号明细渲染 ---------- */
function itemCardHtml(item = {}) {
  const groups = [];
  let cur = null;
  ITEM_FIELDS.forEach(f => {
    const g = f.group || '';
    if (!cur || cur.name !== g) { cur = { name: g, fields: [] }; groups.push(cur); }
    cur.fields.push(f);
  });

  const control = f => {
    const val = item[f.key] == null ? '' : item[f.key];
    if (f.type === 'date') return `<input type="date" data-item-field="${f.key}" value="${escapeHtml(val)}">`;
    if (f.type === 'select') return `<select data-item-field="${f.key}">${f.options.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    return `<input type="text" ${f.num ? 'inputmode="decimal"' : ''} ${f.readonly ? 'readonly' : ''} data-item-field="${f.key}" value="${escapeHtml(val)}">`;
  };

  const body = groups.map(g => `
    <div class="field-group">
      <div class="field-group-title">${g.name}</div>
      <div class="item-grid">${g.fields.map(f => `<label class="item-field${f.span ? ' span' + f.span : ''}">${f.label}${control(f)}</label>`).join('')}</div>
    </div>`).join('');

  return `
    <div class="item-card" data-item-id="${item.id || ''}">
      <div class="item-card-head">
        <span class="item-idx"></span>
        <button class="btn-mini danger" type="button" data-item-remove>删除此货号</button>
      </div>
      ${body}
    </div>`;
}

function addItem(item = {}) {
  if (!item.id) item.id = genId();
  const holder = document.createElement('div');
  holder.innerHTML = itemCardHtml(item);
  $('#itemsContainer').appendChild(holder.firstElementChild);
  renumberItems();
}

function renumberItems() {
  $$('#itemsContainer .item-card').forEach((card, i) => {
    card.querySelector('.item-idx').textContent = '货号 ' + (i + 1);
  });
}

function recompute(card) {
  const get = k => {
    const el = card.querySelector(`[data-item-field="${k}"]`);
    const n = parseFloat((el && el.value || '').replace(/[^\d.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const set = (k, v) => {
    const el = card.querySelector(`[data-item-field="${k}"]`);
    if (el) el.value = v;
  };
  const total = get('pack_size') * get('boxes');
  set('total_qty', total ? String(total) : '');
  const amount = total * get('unit_price');
  set('amount', amount ? String(amount) : '');
}

function collectItems() {
  return $$('#itemsContainer .item-card').map(card => {
    const item = { id: card.dataset.itemId || genId() };
    ITEM_FIELDS.forEach(f => {
      const el = card.querySelector(`[data-item-field="${f.key}"]`);
      item[f.key] = el ? el.value.trim() : '';
    });
    return item;
  }).filter(anyItemValue);
}

function anyItemValue(item) {
  return ITEM_FIELDS.some(f => String(item[f.key] || '').trim() !== '');
}

/* ---------- 合同管理：弹窗 ---------- */
function openAdd() {
  editingId = null;
  $('#modalTitle').textContent = '新增合同';
  $('#contractForm').reset();
  $('#f_sales_order_no').value = '';
  $('#f_supplier').value = '';
  $('#f_sign_date').value = '';
  $('#itemsContainer').innerHTML = '';
  addItem();
  $('#modalMask').hidden = false;
  $('#f_sales_order_no').focus();
}

function openEdit(id) {
  const c = contracts.find(x => x.id === id);
  if (!c) return;
  editingId = id;
  $('#modalTitle').textContent = '查看 / 编辑合同';
  $('#f_sales_order_no').value = c.sales_order_no || '';
  $('#f_supplier').value = c.supplier || '';
  $('#f_sign_date').value = c.sign_date || '';
  $('#itemsContainer').innerHTML = '';
  const items = (Array.isArray(c.items) && c.items.length) ? c.items : [{}];
  items.forEach(it => addItem(it));
  $('#modalMask').hidden = false;
}

function closeModal() {
  $('#modalMask').hidden = true;
  editingId = null;
}

async function save(e) {
  e.preventDefault();
  const items = collectItems();
  if (editingId) {
    // 编辑时保留原有进度（进度在「进度追踪」模块维护）
    const orig = contracts.find(x => x.id === editingId);
    const progById = {};
    (orig && Array.isArray(orig.items) ? orig.items : []).forEach(it => {
      if (it.id) progById[it.id] = it.progress || {};
    });
    items.forEach(it => { it.progress = progById[it.id] || {}; });
  }
  const data = {
    sales_order_no: $('#f_sales_order_no').value.trim(),
    supplier: $('#f_supplier').value.trim(),
    sign_date: $('#f_sign_date').value,
    items,
  };
  if (!data.sales_order_no && !data.supplier && !data.items.length) {
    toast('请至少填写一项内容', true);
    return;
  }
  try {
    if (editingId) {
      data.updated_at = nowISO();
      await Storage.update('contracts', editingId, data);
      toast('已保存');
    } else {
      data.id = genId();
      data.created_at = nowISO();
      data.updated_at = nowISO();
      await Storage.add('contracts', data);
      toast('已新增');
    }
    closeModal();
    await refresh();
  } catch (err) {
    console.error(err);
    toast('保存失败：' + err.message, true);
  }
}

async function removeContract(id) {
  const c = contracts.find(x => x.id === id);
  const name = c ? (c.sales_order_no || c.supplier || '未命名') : '';
  if (!confirm(`确定删除合同「${name}」吗？删除后不可恢复。`)) return;
  try {
    await Storage.remove('contracts', id);
    toast('已删除');
    await refresh();
  } catch (err) {
    toast('删除失败：' + err.message, true);
  }
}

/* ---------- 进度追踪：进度弹窗 ---------- */
function progressStepsHtml(progress = {}) {
  const p = progress || {};
  const checks = CHECK_STEPS.map((s, i) => `
    <label class="progress-step">
      <input type="checkbox" data-progress-check="${s.key}" ${p[s.key] === true ? 'checked' : ''}>
      <span class="step-num">${i + 1}</span>
      <span>${s.label}</span>
    </label>`).join('');

  const packaging = (p.packaging && typeof p.packaging === 'object') ? p.packaging : {};
  const packagingHtml = PACKAGING_TYPES.map(t => {
    const cur = packaging[t.key] || '';
    const opts = [''].concat(PACKAGING_STAGES);
    if (t.allowNone) opts.push('无中盒');
    const options = opts.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o === '' ? '未开始' : o}</option>`).join('');
    return `<label class="packaging-item">
      <span class="packaging-name">${t.label}</span>
      <select data-packaging="${t.key}">${options}</select>
    </label>`;
  }).join('');

  const selects = SELECT_STEPS.map(s => {
    const cur = p[s.key] || '';
    return `<label class="progress-step select">
      <span>${s.label}</span>
      <select data-progress-select="${s.key}">
        <option value="">未开始</option>
        ${s.options.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </label>`;
  }).join('');

  return `
    <div class="progress-section">
      <div class="progress-section-title">流程勾选（按顺序，打勾自动勾选前面步骤）</div>
      <div class="progress-list">${checks}</div>
    </div>
    <div class="progress-section">
      <div class="progress-section-title">包材进度（彩盒 / 中盒 / 外箱）</div>
      <div class="packaging-list">${packagingHtml}</div>
    </div>
    <div class="progress-section">
      <div class="progress-section-title">后续流程</div>
      <div class="progress-list">${selects}</div>
    </div>`;
}

function readProgressFrom(root) {
  const progress = {};
  root.querySelectorAll('[data-progress-check]').forEach(cb => { progress[cb.dataset.progressCheck] = cb.checked; });
  root.querySelectorAll('[data-progress-select]').forEach(sel => { if (sel.value) progress[sel.dataset.progressSelect] = sel.value; });
  const packaging = {};
  root.querySelectorAll('[data-packaging]').forEach(sel => { packaging[sel.dataset.packaging] = sel.value; });
  progress.packaging = packaging;
  return progress;
}

function setupSequentialChecks(root) {
  const boxes = Array.from(root.querySelectorAll('[data-progress-check]'));
  boxes.forEach((cb, idx) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        // 勾选到哪一步，前面的步骤自动打勾
        for (let i = 0; i < idx; i++) boxes[i].checked = true;
      } else {
        for (let i = idx + 1; i < boxes.length; i++) {
          boxes[i].checked = false;
        }
      }
    });
  });
}

function openProgress(contractId, itemId) {
  const c = contracts.find(x => x.id === contractId);
  if (!c) return;
  const it = (c.items || []).find(i => i.id === itemId);
  if (!it) return;
  trackContractId = contractId;
  trackItemId = itemId;
  $('#progressModalTitle').textContent = '更新进度';
  $('#progressContext').innerHTML = `
    <div class="progress-context">
      <span>销售单号：<b>${escapeHtml(c.sales_order_no || '—')}</b></span>
      <span>货号：<b>${escapeHtml(it.item_no || '—')}</b></span>
      <span>类型：<b>${escapeHtml(it.order_type || '未定')}</b></span>
    </div>`;
  $('#progressItems').innerHTML = progressStepsHtml(it.progress || {});
  setupSequentialChecks($('#progressItems'));
  $('#progressModalMask').hidden = false;
}

function closeProgress() {
  $('#progressModalMask').hidden = true;
  trackContractId = null;
  trackItemId = null;
}

async function saveProgress(e) {
  e.preventDefault();
  const progress = readProgressFrom($('#progressItems'));
  const c = contracts.find(x => x.id === trackContractId);
  if (!c) { closeProgress(); return; }
  const items = (c.items || []).map(it => it.id === trackItemId ? { ...it, progress } : it);
  try {
    await Storage.update('contracts', c.id, { items, updated_at: nowISO() });
    toast('进度已更新');
    closeProgress();
    await refresh();
  } catch (err) {
    console.error(err);
    toast('保存失败：' + err.message, true);
  }
}

/* ---------- 全局设置：汇率 + 运费价格（本地/云端同步，按账号隔离） ---------- */
const SETTINGS_COLLECTION = 'settings';
const SETTINGS_DEFAULTS = { exchange_rate: '6.7', truck_price: '3000', sea_price: '2800' };
const LEGACY_RATE_KEY = 'mascube_exchange_rate';
const LEGACY_FREIGHT_KEY = 'mascube_freight_settings';

let settings = { ...SETTINGS_DEFAULTS };
let settingsId = null;

function legacySettings() {
  const s = {};
  const rate = localStorage.getItem(LEGACY_RATE_KEY);
  if (rate !== null && rate !== '') s.exchange_rate = rate;
  try {
    const f = JSON.parse(localStorage.getItem(LEGACY_FREIGHT_KEY) || '{}');
    if (f.truck_price) s.truck_price = f.truck_price;
    if (f.sea_price) s.sea_price = f.sea_price;
  } catch (e) {}
  return s;
}

function normalizeSettings(s) {
  return {
    exchange_rate: (s.exchange_rate === '' || s.exchange_rate == null) ? SETTINGS_DEFAULTS.exchange_rate : s.exchange_rate,
    truck_price: (s.truck_price === '' || s.truck_price == null) ? SETTINGS_DEFAULTS.truck_price : s.truck_price,
    sea_price: (s.sea_price === '' || s.sea_price == null) ? SETTINGS_DEFAULTS.sea_price : s.sea_price,
  };
}

async function loadSettings() {
  let mine = null;
  try {
    const all = (await Storage.getAll(SETTINGS_COLLECTION)) || [];
    const u = Auth.currentUser();
    mine = all.find(r => r.owner === u) || null;
  } catch (e) {
    console.error(e);
  }
  settingsId = mine ? mine.id : null;
  settings = normalizeSettings(mine ? {
    exchange_rate: mine.exchange_rate, truck_price: mine.truck_price, sea_price: mine.sea_price,
  } : { ...SETTINGS_DEFAULTS, ...legacySettings() });
  initRate();
  initFreight();
}

let persistTimer = null;
function persistSettings() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    const patch = { exchange_rate: settings.exchange_rate, truck_price: settings.truck_price, sea_price: settings.sea_price, updated_at: nowISO() };
    try {
      if (!settingsId) {
        settingsId = genId();
        await Storage.add(SETTINGS_COLLECTION, { id: settingsId, ...patch });
      } else {
        await Storage.update(SETTINGS_COLLECTION, settingsId, patch);
      }
    } catch (e) {
      console.error(e);
      toast('设置保存失败：' + e.message, true);
    }
  }, 300);
}

function getRateNum() {
  return parseFloat(settings.exchange_rate) || 0;
}
function initRate() {
  $('#globalRate').value = settings.exchange_rate;
}
function setExchangeRate(v) {
  settings.exchange_rate = v;
  persistSettings();
}
function setFreightSetting(key, value) {
  settings[key] = value;
  persistSettings();
}

/* ---------- 全局配置：DeepSeek API Key（所有账号共享，本地/云端同步） ---------- */
const GLOBAL_CONFIG_COLLECTION = 'app_config';
const GLOBAL_CONFIG_ID = 'app';
const LEGACY_DS_KEY = 'mascube_ds_key';

let globalDsKey = '';

async function loadGlobalConfig() {
  globalDsKey = localStorage.getItem(LEGACY_DS_KEY) || '';
  try {
    const all = (await Storage.getAll(GLOBAL_CONFIG_COLLECTION)) || [];
    const cfg = all.find(r => r.id === GLOBAL_CONFIG_ID);
    if (cfg && cfg.ds_api_key) {
      globalDsKey = cfg.ds_api_key;
      localStorage.setItem(LEGACY_DS_KEY, globalDsKey);
    }
  } catch (e) {
    console.error(e);
  }
}

async function saveGlobalDsKey(v) {
  globalDsKey = v;
  localStorage.setItem(LEGACY_DS_KEY, v);
  const patch = { ds_api_key: v, updated_at: nowISO() };
  try {
    const row = await Storage.update(GLOBAL_CONFIG_COLLECTION, GLOBAL_CONFIG_ID, patch);
    if (!row) await Storage.add(GLOBAL_CONFIG_COLLECTION, { id: GLOBAL_CONFIG_ID, ...patch });
  } catch (e) {
    console.error(e);
    toast('API Key 云端保存失败：' + e.message, true);
  }
}

/* ---------- 模块三：运费计算 ---------- */
function fmtMoney(n) {
  return '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function computeFreight() {
  const vol = parseFloat($('#f_volume').value) || 0;
  const truck = parseFloat($('#f_truck_price').value) || 0;
  const rate = getRateNum();
  const land = vol / 68 * truck * rate;
  const seaPrice = parseFloat($('#f_sea_price').value) || 0;
  const sea = vol / 68 * seaPrice * rate;
  $('#f_land').textContent = fmtMoney(land);
  $('#f_sea').textContent = fmtMoney(sea);
  $('#f_total').textContent = fmtMoney(land + sea);
}
function initFreight() {
  $('#f_truck_price').value = settings.truck_price;
  $('#f_sea_price').value = settings.sea_price;
  computeFreight();
}

/* ---------- 报价计算 ---------- */
function fmtUsd(n) {
  return '$' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function computeQuote() {
  const unit = parseFloat($('#q_unit_price').value) || 0;
  const qty = parseFloat($('#q_carton_qty').value) || 0;
  const L = parseFloat($('#q_ctn_l').value) || 0;
  const W = parseFloat($('#q_ctn_w').value) || 0;
  const H = parseFloat($('#q_ctn_h').value) || 0;
  const rate = getRateNum();
  const profit = parseFloat($('#q_profit').value) || 0;

  const volume = L * W * H / 1000000;              // 外箱体积（m³）
  const portFee = qty ? volume / qty * 60 : 0;     // 港杂费（¥/个）
  const totalCost = unit + portFee;                // 总成本（¥/个）
  const rmb = totalCost * (1 + profit / 100);      // 人民币报价（¥/个）
  const usd = rate ? rmb / rate : 0;               // 美元报价（$/个）

  $('#q_volume').textContent = volume.toFixed(4) + ' m³';
  $('#q_port_fee').textContent = fmtMoney(portFee);
  $('#q_total_cost').textContent = fmtMoney(totalCost);
  $('#q_rmb').textContent = fmtMoney(rmb);
  $('#q_usd').textContent = fmtUsd(usd);
}
/* ---------- 常用小工具：大小写转换 ---------- */
const CASE_SMALL_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'at', 'by', 'in', 'of', 'on', 'to', 'with', 'from', 'into', 'onto', 'over', 'under',
]);

function toTitleCase(str) {
  let first = true;
  return str.toLowerCase().replace(/(^|[^a-z'])([a-z][a-z']*)/g, (m, sep, word) => {
    const isFirst = first;
    first = false;
    if (!isFirst && CASE_SMALL_WORDS.has(word)) return sep + word;
    return sep + word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function applyCase(type) {
  const input = $('#caseInput').value;
  const out = $('#caseOutput');
  if (type === 'upper') out.value = input.toUpperCase();
  else if (type === 'lower') out.value = input.toLowerCase();
  else out.value = toTitleCase(input);
}

function execCopy(el) {
  try {
    el.focus();
    el.select();
    return document.execCommand('copy');
  } catch (e) {
    return false;
  }
}

function copyCaseOutput() {
  const out = $('#caseOutput');
  const text = out.value;
  if (!text) { toast('没有可复制的内容', true); return; }
  const done = () => toast('已复制到剪贴板');
  const fail = () => toast('复制失败，请手动选中复制', true);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { execCopy(out) ? done() : fail(); });
  } else if (execCopy(out)) {
    done();
  } else {
    fail();
  }
}

/* ---------- 智能助手 ---------- */
const DS_BASE = 'https://api.deepseek.com';
const DS_MODEL = 'deepseek-chat';
const DS_SYSTEM = '你是一名资深外贸从业者，拥有多年国际贸易实战经验，熟悉外贸全流程：询盘报价、贸易术语（FOB/CIF/DDP等）、付款方式（T/T/L/C/D/P等）、报关清关、国际物流与集装箱、单证制作、客户开发与谈判、合同条款与风险防范等。你乐于解答用户的疑问，用通俗易懂的中文回答，内容专业、实用、条理清晰，必要时举例说明。';

let conversations = [];
let activeConv = null; // 当前对话对象（id 为 null 表示尚未保存的新对话）

function getDsKey() { return globalDsKey || ''; }

function inlineMarkdown(s) {
  s = escapeHtml(s);
  // 行内代码 `...`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 加粗 **...**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *...*
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  // 链接 [文字](网址)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function isSpecialLine(line) {
  const t = line.trim();
  return /^```/.test(t) || /^#{1,6}\s/.test(t) || /^[-*+]\s/.test(t) || /^\d+[.)]\s/.test(t)
    || /^>/.test(t) || /^\|/.test(t) || /^(-{3,}|\*{3,}|_{3,})$/.test(t);
}

function renderTable(rows) {
  const parse = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const head = parse(rows[0]);
  const body = rows.slice(1).map(parse);
  return '<table><thead><tr>' + head.map(c => '<th>' + inlineMarkdown(c) + '</th>').join('')
    + '</tr></thead><tbody>'
    + body.map(r => '<tr>' + r.map(c => '<td>' + inlineMarkdown(c) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table>';
}

function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();

    // 代码块
    if (/^```/.test(t)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++; // 跳过结尾 ```
      html += '<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>';
      continue;
    }

    // 表格
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
      const rows = [lines[i]];
      i += 2; // 跳过表头行和分隔行
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i]); i++; }
      html += renderTable(rows);
      continue;
    }

    // 标题
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { html += '<h' + h[1].length + '>' + inlineMarkdown(h[2]) + '</h' + h[1].length + '>'; i++; continue; }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { html += '<hr>'; i++; continue; }

    // 引用
    if (t.startsWith('>')) {
      const items = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { items.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      html += '<blockquote>' + items.map(inlineMarkdown).join('<br>') + '</blockquote>';
      continue;
    }

    // 无序列表
    if (/^[-*+]\s+/.test(t)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*+]\s+/, '')); i++; }
      html += '<ul>' + items.map(x => '<li>' + inlineMarkdown(x) + '</li>').join('') + '</ul>';
      continue;
    }

    // 有序列表
    if (/^\d+[.)]\s+/.test(t)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+[.)]\s+/, '')); i++; }
      html += '<ol>' + items.map(x => '<li>' + inlineMarkdown(x) + '</li>').join('') + '</ol>';
      continue;
    }

    // 空行
    if (t === '') { i++; continue; }

    // 普通段落
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !isSpecialLine(lines[i])) { para.push(lines[i].trim()); i++; }
    if (para.length) html += '<p>' + para.map(inlineMarkdown).join('<br>') + '</p>';
    else i++;
  }
  return html;
}

function renderAssistantMessage(role, text) {
  const box = $('#assistantMessages');
  const div = document.createElement('div');
  div.className = 'assistant-msg ' + (role === 'user' ? 'user' : 'bot');
  if (role === 'user') {
    div.textContent = text;
  } else {
    div.innerHTML = markdownToHtml(text);
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function renderAssistantTyping(show) {
  let el = $('#assistantTyping');
  if (show) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'assistantTyping';
      el.className = 'assistant-msg bot typing';
      el.textContent = '正在思考…';
      $('#assistantMessages').appendChild(el);
    }
  } else if (el) {
    el.remove();
  }
  const box = $('#assistantMessages');
  box.scrollTop = box.scrollHeight;
}

function renderAssistantMessages() {
  const box = $('#assistantMessages');
  box.innerHTML = '';
  const msgs = (activeConv && activeConv.messages) || [];
  if (!msgs.length) {
    const div = document.createElement('div');
    div.className = 'assistant-msg bot';
    div.textContent = '你好，我是你的外贸智能助手 👋 报价、贸易术语、付款方式、报关、客户开发……任何外贸问题都可以问我。';
    box.appendChild(div);
  } else {
    msgs.forEach(m => renderAssistantMessage(m.role, m.content));
  }
  box.scrollTop = box.scrollHeight;
}

function sortConversations() {
  conversations.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
}

function renderConversationList() {
  const box = $('#assistantConvList');
  if (!conversations.length) {
    box.innerHTML = '<div class="assistant-empty">暂无对话</div>';
    return;
  }
  box.innerHTML = conversations.map(c => `
    <div class="assistant-conv-item${c.id === (activeConv && activeConv.id) ? ' active' : ''}" data-conv="${c.id}">
      <div class="assistant-conv-title">${escapeHtml(c.title || '新对话')}</div>
      <div class="assistant-conv-ops">
        <button class="btn-mini" data-conv-rename="${c.id}" type="button" title="重命名">✏️</button>
        <button class="btn-mini danger" data-conv-del="${c.id}" type="button" title="删除">🗑️</button>
      </div>
    </div>`).join('');
}

async function refreshConversations() {
  try {
    conversations = (await Storage.getAll('assistant_conversations')) || [];
  } catch (e) {
    console.error(e);
    conversations = [];
  }
  sortConversations();
  renderConversationList();
}

function newConversation() {
  activeConv = { id: null, title: '新对话', messages: [] };
  renderAssistantMessages();
  renderConversationList();
  $('#assistantInput').value = '';
  $('#assistantInput').focus();
}

async function openConversation(id) {
  const c = conversations.find(x => x.id === id);
  if (!c) return;
  activeConv = c;
  renderAssistantMessages();
  renderConversationList();
  $('#assistantInput').focus();
}

async function persistActiveConv() {
  if (!activeConv || !activeConv.messages.length) return;
  if (!activeConv.id) {
    activeConv.id = genId();
    activeConv.created_at = activeConv.created_at || nowISO();
    activeConv.updated_at = nowISO();
    activeConv = await Storage.add('assistant_conversations', { ...activeConv });
    conversations.unshift(activeConv);
  } else {
    activeConv.updated_at = nowISO();
    await Storage.update('assistant_conversations', activeConv.id, {
      title: activeConv.title, messages: activeConv.messages, updated_at: activeConv.updated_at,
    });
    const idx = conversations.findIndex(c => c.id === activeConv.id);
    if (idx >= 0) conversations[idx] = activeConv;
  }
  sortConversations();
  renderConversationList();
}

async function tryPersist() {
  try {
    await persistActiveConv();
  } catch (e) {
    console.error(e);
    const hint = Storage.isCloud() ? '（云端模式：请确认已在 Supabase 创建 assistant_conversations 表）' : '';
    toast('对话保存失败：' + e.message + hint, true);
  }
}

async function renameConversation(id) {
  const c = conversations.find(x => x.id === id);
  if (!c) return;
  const name = (prompt('重命名对话：', c.title || '') || '').trim();
  if (!name) return;
  c.title = name;
  await Storage.update('assistant_conversations', id, { title: name });
  renderConversationList();
}

async function deleteConversation(id) {
  const c = conversations.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`确定删除对话「${c.title || '新对话'}」？`)) return;
  try {
    await Storage.remove('assistant_conversations', id);
    conversations = conversations.filter(x => x.id !== id);
    if (activeConv && activeConv.id === id) newConversation();
    else renderConversationList();
  } catch (e) {
    toast('删除失败：' + e.message, true);
  }
}

async function sendAssistantMessage() {
  const input = $('#assistantInput');
  const text = input.value.trim();
  if (!text) return;
  const key = getDsKey();
  if (!key) {
    $('#dsKey').value = '';
    $('#assistantSettings').hidden = false;
    renderAssistantMessage('bot', '请先在上方「⚙️ 设置」里填写 DeepSeek API Key，然后就可以提问啦。');
    return;
  }
  input.value = '';

  if (!activeConv) newConversation();
  activeConv.messages.push({ role: 'user', content: text });
  if (!activeConv.title || activeConv.title === '新对话') {
    activeConv.title = text.length > 20 ? text.slice(0, 20) + '…' : text;
  }
  renderAssistantMessages();
  await tryPersist();

  renderAssistantTyping(true);
  try {
    const res = await fetch(DS_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: DS_MODEL,
        messages: [{ role: 'system', content: DS_SYSTEM }, ...activeConv.messages],
        stream: false,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const code = res.status;
      const hint = code === 401 ? '（API Key 无效，请检查）' : code === 402 ? '（账户余额不足）' : code === 429 ? '（请求太频繁，稍后再试）' : '';
      throw new Error('请求失败：HTTP ' + code + hint);
    }
    const data = await res.json();
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '（无回复内容）';
    activeConv.messages.push({ role: 'assistant', content: reply });
    renderAssistantTyping(false);
    renderAssistantMessages();
    await tryPersist();
  } catch (e) {
    renderAssistantTyping(false);
    renderAssistantMessage('bot', '出错了：' + e.message + '\n\n若提示网络错误，可能是浏览器跨域限制或网络问题。');
  }
}

function saveDsKey() {
  const v = $('#dsKey').value.trim();
  if (!v) { toast('请先填写 API Key', true); return; }
  saveGlobalDsKey(v);
  $('#assistantSettings').hidden = true;
  toast('API Key 已保存');
}

/* ---------- 模块四：已有报价 ---------- */
const QUOTE_FIELDS = [
  { key: 'item_no', label: '货号', group: '基本信息' },
  { key: 'product_name', label: '产品名称', span: 2, group: '基本信息' },
  { key: 'supplier_cn', label: '供应商中文', group: '基本信息' },
  { key: 'product_spec', label: '产品规格', span: 2, group: '基本信息' },
  { key: 'product_packing', label: '产品包装', span: 2, group: '基本信息' },

  { key: 'purchase_price', label: '采购单价(¥)', num: true, group: '价格与起订' },
  { key: 'export_price', label: '外销单价($)', num: true, group: '价格与起订' },
  { key: 'moq', label: '最小起订量', num: true, group: '价格与起订' },
  { key: 'unit', label: '单位', group: '价格与起订' },

  { key: 'inner_box', label: '内盒', num: true, group: '装箱尺寸' },
  { key: 'ctn_qty', label: '每箱数量', num: true, group: '装箱尺寸' },
  { key: 'ctn_l', label: '箱长(cm)', num: true, group: '装箱尺寸' },
  { key: 'ctn_w', label: '箱宽(cm)', num: true, group: '装箱尺寸' },
  { key: 'ctn_h', label: '箱高(cm)', num: true, group: '装箱尺寸' },
  { key: 'cbm', label: '立方米 CBM', readonly: true, group: '装箱尺寸' },

  { key: 'nw', label: '净重(kg)', num: true, group: '重量' },
  { key: 'gw', label: '毛重(kg)', num: true, group: '重量' },
];

let quotes = [];
let quoteFolders = [];
let currentFolder = 'all';
let editingQuoteId = null;
let editingImages = [];
let moveQuoteId = null;
let collapsedFolders = new Set();
let folderQuery = '';
let dragFolderId = null;
let renamingFolderId = null;

async function refreshQuotes() {
  try {
    const [q, f] = await Promise.all([Storage.getAll('quotes'), Storage.getAll('quote_folders')]);
    quotes = q || [];
    quoteFolders = f || [];
    renderQuoteFolders();
    renderQuoteList();
  } catch (e) {
    console.error(e);
    toast('加载报价失败：' + e.message, true);
  }
}

/* ---------- 文件夹树 ---------- */
function folderById(id) { return quoteFolders.find(f => f.id === id); }
function folderChildren(parentId) {
  const p = parentId || null;
  return quoteFolders.filter(f => (f.parent_id || null) === p);
}
function sortedFolders(list) {
  return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'));
}
function folderDescendants(id) {
  const out = new Set();
  (function walk(pid) {
    folderChildren(pid).forEach(f => { out.add(f.id); walk(f.id); });
  })(id);
  return out;
}
function folderPath(id) {
  const path = [];
  let cur = folderById(id);
  while (cur) { path.unshift(cur); cur = folderById(cur.parent_id); }
  return path;
}
function folderQuoteCount(id) {
  const ids = new Set([id, ...folderDescendants(id)]);
  return quotes.filter(x => x.folder_id && ids.has(x.folder_id)).length;
}
function visibleFolderIds() {
  const q = folderQuery.trim().toLowerCase();
  if (!q) return null;
  const matched = new Set(quoteFolders.filter(f => (f.name || '').toLowerCase().includes(q)).map(f => f.id));
  const include = new Set(matched);
  quoteFolders.forEach(f => {
    if (!matched.has(f.id)) return;
    let cur = folderById(f.parent_id);
    while (cur) { include.add(cur.id); cur = folderById(cur.parent_id); }
  });
  return include;
}

function folderNodeHtml(f, depth, visible) {
  const children = sortedFolders(folderChildren(f.id));
  const shownChildren = visible === null ? children : children.filter(c => visible.has(c.id));
  const hasChildren = shownChildren.length > 0;
  const collapsed = collapsedFolders.has(f.id);
  const kids = (!collapsed && hasChildren)
    ? shownChildren.map(c => folderNodeHtml(c, depth + 1, visible)).join('')
    : '';
  return `
    <div class="folder-node">
      <div class="folder-item ${currentFolder === f.id ? 'active' : ''}" style="padding-left:${8 + depth * 14}px"
           draggable="true" data-folder-id="${f.id}">
        <button class="folder-toggle" data-folder-toggle="${f.id}" type="button" title="展开/折叠">${hasChildren ? (collapsed ? '▸' : '▾') : ''}</button>
        ${renamingFolderId === f.id
          ? `<input class="folder-rename-input" data-folder-rename-input="${f.id}" value="${escapeHtml(f.name)}" draggable="false">`
          : `<button class="folder-name" data-folder="${f.id}">📁 ${escapeHtml(f.name)}</button>`}
        <span class="folder-ops">
          <button data-folder-add="${f.id}" title="新建子文件夹">＋</button>
          <button data-folder-rename="${f.id}" title="重命名">✏️</button>
          <button data-folder-del="${f.id}" title="删除">🗑️</button>
        </span>
      </div>
      ${kids}
    </div>`;
}

function renderQuoteFolders() {
  const visible = visibleFolderIds();
  const items = [
    `<button class="folder-item ${currentFolder === 'all' ? 'active' : ''}" data-folder="all">📁 全部报价</button>`,
  ];
  const roots = sortedFolders(folderChildren(null));
  const shownRoots = visible === null ? roots : roots.filter(r => visible.has(r.id));
  shownRoots.forEach(f => items.push(folderNodeHtml(f, 0, visible)));
  $('#folderList').innerHTML = items.join('') + '<div class="folder-drop-root" data-drop-root></div>';
  bindRenameInput();
}

function renderQuoteList() {
  const q = $('#quoteSearch').value.trim().toLowerCase();
  let list = quotes;
  let subFolders = [];
  let crumbs = '';

  if (currentFolder === 'all') {
    subFolders = sortedFolders(folderChildren(null));
  } else {
    subFolders = sortedFolders(folderChildren(currentFolder));
    list = list.filter(x => x.folder_id === currentFolder);
    const path = folderPath(currentFolder);
    crumbs = `<div class="quote-breadcrumb">
      <button data-crumb="all" type="button">📁 全部报价</button>${path.map((p, i) =>
        i === path.length - 1
          ? `<span class="crumb-cur"> / ${escapeHtml(p.name)}</span>`
          : ` / <button data-crumb="${p.id}" type="button">${escapeHtml(p.name)}</button>`
      ).join('')}
    </div>`;
  }

  if (q) {
    list = list.filter(x => (x.item_no + ' ' + x.product_name + ' ' + x.supplier_cn + ' ' + x.product_spec).toLowerCase().includes(q));
  }

  const subFolderHtml = subFolders.length
    ? `<div class="subfolder-grid">${subFolders.map(f => `
        <button class="subfolder-card" data-subfolder="${f.id}" type="button">
          <span class="subfolder-icon">📁</span>
          <span class="subfolder-name">${escapeHtml(f.name)}</span>
          <span class="subfolder-count">${folderQuoteCount(f.id)} 项</span>
        </button>`).join('')}</div>`
    : '';

  const quoteHtml = list.length
    ? `<div class="quote-grid">${list.map(quoteCardHtml).join('')}</div>`
    : `<div class="empty">${currentFolder === 'all' ? '暂无报价，点右上角「+ 新增报价」开始' : '此文件夹暂无报价，点右上角「+ 新增报价」添加'}</div>`;

  $('#quoteList').innerHTML = crumbs + subFolderHtml + quoteHtml;
}

function quoteCardHtml(q) {
  const first = (q.images && q.images[0]) ? q.images[0] : '';
  const thumb = first ? `<img src="${first}">` : `<div class="no-img">无图</div>`;
  const count = (q.images && q.images.length) ? `<span class="img-count">${q.images.length}张</span>` : '';
  const folderName = q.folder_id ? ((quoteFolders.find(f => f.id === q.folder_id) || {}).name || '') : '';
  return `
    <div class="quote-card">
      <div class="quote-thumb">${thumb}${count}</div>
      <div class="quote-body">
        <div class="quote-no">${escapeHtml(q.item_no || '未填货号')}</div>
        <div class="quote-name">${escapeHtml(q.product_name || '')}</div>
        <div class="quote-supplier">${escapeHtml(q.supplier_cn || '')}</div>
        <div class="quote-prices">
          <span>¥${escapeHtml(q.purchase_price || '—')}</span>
          <span>$ ${escapeHtml(q.export_price || '—')}</span>
        </div>
        <div class="quote-meta">CBM ${escapeHtml(q.cbm || '—')}${q.moq ? ' · MOQ ' + escapeHtml(q.moq) : ''}${folderName ? ' · ' + escapeHtml(folderName) : ''}</div>
      </div>
      <div class="quote-actions">
        <button class="btn-mini" data-quote-edit="${q.id}">编辑</button>
        <button class="btn-mini" data-quote-move="${q.id}">移动</button>
        <button class="btn-mini danger" data-quote-del="${q.id}">删除</button>
      </div>
    </div>`;
}

function quoteFieldsHtml(q = {}) {
  const groups = [];
  let cur = null;
  QUOTE_FIELDS.forEach(f => {
    const g = f.group || '';
    if (!cur || cur.name !== g) { cur = { name: g, fields: [] }; groups.push(cur); }
    cur.fields.push(f);
  });
  return groups.map(g => `
    <div class="field-group">
      <div class="field-group-title">${g.name}</div>
      <div class="item-grid">${g.fields.map(f => {
        const val = q[f.key] == null ? '' : q[f.key];
        const cls = f.span ? ` item-field span${f.span}` : ' item-field';
        const control = `<input type="text" ${f.num ? 'inputmode="decimal"' : ''} ${f.readonly ? 'readonly' : ''} data-qfield="${f.key}" value="${escapeHtml(val)}">`;
        return `<label class="${cls}">${f.label}${control}</label>`;
      }).join('')}</div>
    </div>`).join('');
}

function folderOptionsHtml(selectedId) {
  let html = `<option value="">未分类</option>`;
  (function walk(list, depth) {
    sortedFolders(list).forEach(f => {
      const indent = depth ? '　'.repeat(depth) + '└ ' : '';
      html += `<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${indent}${escapeHtml(f.name)}</option>`;
      walk(folderChildren(f.id), depth + 1);
    });
  })(folderChildren(null), 0);
  return html;
}

function populateQuoteFolderSelect(selectedId) {
  $('#q_folder_id').innerHTML = folderOptionsHtml(selectedId);
}

function renderImagePreviews() {
  const box = $('#quoteImagePreviews');
  if (!editingImages.length) { box.innerHTML = '<div class="img-empty">暂无图片</div>'; return; }
  box.innerHTML = editingImages.map((im, i) => `
    <div class="img-item">
      <img src="${im.dataUrl}" data-zoom>
      <button type="button" class="img-del" data-img-del="${i}">×</button>
    </div>`).join('');
}

function computeQuoteCbm() {
  const get = k => {
    const el = $('#quoteFields').querySelector(`[data-qfield="${k}"]`);
    return parseFloat(el && el.value) || 0;
  };
  const cbm = get('ctn_l') * get('ctn_w') * get('ctn_h') / 1000000;
  const el = $('#quoteFields').querySelector('[data-qfield="cbm"]');
  if (el) el.value = cbm ? String(Math.round(cbm * 10000) / 10000) : '';
}

function openQuoteAdd() {
  editingQuoteId = null;
  editingImages = [];
  $('#quoteModalTitle').textContent = '新增报价';
  $('#quoteForm').reset();
  const defaultFolder = (currentFolder && currentFolder !== 'all' && currentFolder !== 'none') ? currentFolder : '';
  populateQuoteFolderSelect(defaultFolder);
  $('#quoteFields').innerHTML = quoteFieldsHtml({});
  renderImagePreviews();
  computeQuoteCbm();
  $('#quoteModalMask').hidden = false;
}

function openQuoteEdit(id) {
  const q = quotes.find(x => x.id === id);
  if (!q) return;
  editingQuoteId = id;
  editingImages = (q.images || []).map(d => ({ dataUrl: d }));
  $('#quoteModalTitle').textContent = '查看 / 编辑报价';
  $('#quoteFields').innerHTML = quoteFieldsHtml(q);
  populateQuoteFolderSelect(q.folder_id);
  renderImagePreviews();
  computeQuoteCbm();
  $('#quoteModalMask').hidden = false;
}

function closeQuoteModal() {
  $('#quoteModalMask').hidden = true;
  editingQuoteId = null;
  editingImages = [];
}

async function saveQuote(e) {
  e.preventDefault();
  const data = { images: editingImages.map(i => i.dataUrl), folder_id: $('#q_folder_id').value || null };
  QUOTE_FIELDS.forEach(f => {
    const el = $('#quoteFields').querySelector(`[data-qfield="${f.key}"]`);
    data[f.key] = el ? el.value.trim() : '';
  });
  if (!data.item_no && !data.product_name && !data.supplier_cn && !data.images.length) {
    toast('请至少填写一项内容', true);
    return;
  }
  try {
    if (editingQuoteId) {
      data.updated_at = nowISO();
      await Storage.update('quotes', editingQuoteId, data);
      toast('已保存');
    } else {
      data.id = genId();
      data.created_at = nowISO();
      data.updated_at = nowISO();
      await Storage.add('quotes', data);
      toast('已新增');
    }
    closeQuoteModal();
    await refreshQuotes();
  } catch (err) {
    console.error(err);
    toast('保存失败：' + err.message, true);
  }
}

async function removeQuote(id) {
  const q = quotes.find(x => x.id === id);
  const name = q ? (q.item_no || q.product_name || '未命名') : '';
  if (!confirm(`确定删除报价「${name}」吗？删除后不可恢复。`)) return;
  try {
    await Storage.remove('quotes', id);
    await refreshQuotes();
    toast('已删除');
  } catch (err) {
    toast('删除失败：' + err.message, true);
  }
}

function openMoveQuote(id) {
  moveQuoteId = id;
  const q = quotes.find(x => x.id === id);
  $('#moveFolderId').innerHTML = folderOptionsHtml((q && q.folder_id) ? q.folder_id : '');
  $('#moveFolderId').value = (q && q.folder_id) ? q.folder_id : '';
  $('#moveModalMask').hidden = false;
}

async function doMoveQuote(e) {
  e.preventDefault();
  const folderId = $('#moveFolderId').value || null;
  try {
    await Storage.update('quotes', moveQuoteId, { folder_id: folderId, updated_at: nowISO() });
    $('#moveModalMask').hidden = true;
    await refreshQuotes();
    toast('已移动');
  } catch (err) {
    toast('移动失败：' + err.message, true);
  }
}

async function addFolder(parentId = null) {
  const name = prompt(parentId ? '请输入子文件夹名称：' : '请输入文件夹名称：');
  if (!name || !name.trim()) return;
  try {
    await Storage.add('quote_folders', { id: genId(), name: name.trim(), parent_id: parentId || null, created_at: nowISO() });
    if (parentId) collapsedFolders.delete(parentId);
    await refreshQuotes();
    toast('已新建文件夹');
  } catch (err) {
    toast('新建失败：' + err.message, true);
  }
}

function toggleFolder(id) {
  if (collapsedFolders.has(id)) collapsedFolders.delete(id);
  else collapsedFolders.add(id);
  renderQuoteFolders();
}

function canDropInto(srcId, targetId) {
  if (srcId === targetId) return false;
  return !folderDescendants(srcId).has(targetId);
}

async function moveFolder(id, parentId) {
  if (id === parentId) return;
  try {
    await Storage.update('quote_folders', id, { parent_id: parentId || null });
    await refreshQuotes();
    toast(parentId ? '已移动到该文件夹内' : '已移动到根目录');
  } catch (err) {
    toast('移动失败：' + err.message, true);
  }
}

function renameFolder(id) {
  renamingFolderId = id;
  renderQuoteFolders();
}

function bindRenameInput() {
  const inp = document.querySelector('[data-folder-rename-input]');
  if (!inp) return;
  inp.focus();
  inp.select();
  const finish = save => {
    const id = inp.dataset.folderRenameInput;
    const val = inp.value;
    if (save) commitRenameFolder(id, val);
    else { renamingFolderId = null; renderQuoteFolders(); }
  };
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('click', e => e.stopPropagation());
}

async function commitRenameFolder(id, val) {
  const name = (val || '').trim();
  renamingFolderId = null;
  if (!name) { renderQuoteFolders(); return; }
  try {
    await Storage.update('quote_folders', id, { name });
    await refreshQuotes();
    toast('已重命名');
  } catch (err) {
    toast('重命名失败：' + err.message, true);
  }
}

async function removeFolder(id) {
  const f = folderById(id);
  if (!f) return;
  const children = folderChildren(id);
  const msg = children.length
    ? `删除文件夹「${f.name}」？其子文件夹会移到上层，里面的报价会取消归类（仍可在「全部报价」里看到）。`
    : `删除文件夹「${f.name}」？里面的报价会取消归类（仍可在「全部报价」里看到）。`;
  if (!confirm(msg)) return;
  try {
    const affected = quotes.filter(q => q.folder_id === id);
    for (const q of affected) {
      await Storage.update('quotes', q.id, { folder_id: null, updated_at: nowISO() });
    }
    for (const c of children) {
      await Storage.update('quote_folders', c.id, { parent_id: f.parent_id || null });
    }
    await Storage.remove('quote_folders', id);
    if (currentFolder === id) currentFolder = 'all';
    collapsedFolders.delete(id);
    await refreshQuotes();
    toast('已删除文件夹');
  } catch (err) {
    toast('删除失败：' + err.message, true);
  }
}

/* 图片处理 */
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
async function compressImage(file, maxDim = 1280, quality = 0.82) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
async function handleQuoteImages(files) {
  for (const file of Array.from(files)) {
    try {
      const dataUrl = await compressImage(file);
      editingImages.push({ dataUrl });
    } catch (e) {
      console.error(e);
      toast('图片处理失败：' + (e && e.message || ''), true);
    }
  }
  renderImagePreviews();
}

function openLightbox(src) {
  $('#lightboxImg').src = src;
  $('#lightbox').hidden = false;
}

/* ---------- 模块切换 ---------- */
function setModule(m) {
  currentModule = m;
  $$('.side-nav-item').forEach(b => b.classList.toggle('active', b.dataset.module === m));
  $('#module-contracts').hidden = m !== 'contracts';
  $('#module-tracking').hidden = m !== 'tracking';
  $('#module-tools').hidden = m !== 'tools';
  $('#module-utils').hidden = m !== 'utils';
  $('#module-quotes').hidden = m !== 'quotes';
  $('#module-assistant').hidden = m !== 'assistant';
  $('#module-admin').hidden = m !== 'admin';
}

/* ---------- 小工具切换 ---------- */
function setTool(t, root) {
  const scope = root || document;
  scope.querySelectorAll('.tool-tab').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  scope.querySelectorAll('.tool-panel').forEach(p => { p.hidden = p.id !== 'tool-' + t; });
}

/* ---------- 提示浮层 ---------- */
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  document.addEventListener('click', e => {
    const nav = e.target.closest('.side-nav-item');
    if (nav) { setModule(nav.dataset.module); return; }
    const tool = e.target.closest('.tool-tab');
    if (tool) { setTool(tool.dataset.tool, tool.closest('.module-panel')); return; }
    const caseBtn = e.target.closest('[data-case]');
    if (caseBtn) { applyCase(caseBtn.dataset.case); return; }
    const copyCase = e.target.closest('[data-copy-case]');
    if (copyCase) { copyCaseOutput(); return; }
    const edit = e.target.closest('[data-edit]');
    if (edit) { openEdit(edit.dataset.edit); return; }
    const del = e.target.closest('[data-del]');
    if (del) { removeContract(del.dataset.del); return; }
    const track = e.target.closest('[data-track]');
    if (track) { openProgress(track.dataset.track, track.dataset.itemId); return; }
    const rm = e.target.closest('[data-item-remove]');
    if (rm) {
      const cards = $$('#itemsContainer .item-card');
      if (cards.length > 1) { rm.closest('.item-card').remove(); renumberItems(); }
      else toast('至少保留一个货号', true);
      return;
    }
  });

  $('#btnAdd').addEventListener('click', openAdd);
  $('#btnAddItem').addEventListener('click', () => addItem());
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#contractForm').addEventListener('submit', save);

  $('#progressModalClose').addEventListener('click', closeProgress);
  $('#progressModalCancel').addEventListener('click', closeProgress);
  $('#progressForm').addEventListener('submit', saveProgress);

  $('#searchInput').addEventListener('input', renderList);
  $('#typeFilter').addEventListener('change', renderList);
  $('#trackSearch').addEventListener('input', renderTracking);
  $('#trackTypeFilter').addEventListener('change', renderTracking);

  // 运费计算
  $('#f_volume').addEventListener('input', computeFreight);
  $('#f_truck_price').addEventListener('input', e => { setFreightSetting('truck_price', e.target.value); computeFreight(); });
  $('#f_sea_price').addEventListener('input', e => { setFreightSetting('sea_price', e.target.value); computeFreight(); });

  // 报价计算
  $('#q_unit_price').addEventListener('input', computeQuote);
  $('#q_carton_qty').addEventListener('input', computeQuote);
  $('#q_ctn_l').addEventListener('input', computeQuote);
  $('#q_ctn_w').addEventListener('input', computeQuote);
  $('#q_ctn_h').addEventListener('input', computeQuote);
  $('#q_profit').addEventListener('input', computeQuote);

  // 全局汇率（改动后所有用到汇率的地方一起重算）
  $('#globalRate').addEventListener('input', e => {
    setExchangeRate(e.target.value);
    computeFreight();
    computeQuote();
  });

  $('#itemsContainer').addEventListener('input', e => {
    const f = e.target.dataset && e.target.dataset.itemField;
    if (f === 'pack_size' || f === 'boxes' || f === 'unit_price') recompute(e.target.closest('.item-card'));
  });

  // 已有报价
  document.addEventListener('click', e => {
    const ft = e.target.closest('[data-folder-toggle]');
    if (ft) { toggleFolder(ft.dataset.folderToggle); return; }
    const fa = e.target.closest('[data-folder-add]');
    if (fa) { addFolder(fa.dataset.folderAdd); return; }
    const folder = e.target.closest('[data-folder]');
    if (folder) { currentFolder = folder.dataset.folder; renderQuoteFolders(); renderQuoteList(); return; }
    const sf = e.target.closest('[data-subfolder]');
    if (sf) { currentFolder = sf.dataset.subfolder; renderQuoteFolders(); renderQuoteList(); return; }
    const cr = e.target.closest('[data-crumb]');
    if (cr) { currentFolder = cr.dataset.crumb; renderQuoteFolders(); renderQuoteList(); return; }
    const fr = e.target.closest('[data-folder-rename]');
    if (fr) { renameFolder(fr.dataset.folderRename); return; }
    const fd = e.target.closest('[data-folder-del]');
    if (fd) { removeFolder(fd.dataset.folderDel); return; }
    const qe = e.target.closest('[data-quote-edit]');
    if (qe) { openQuoteEdit(qe.dataset.quoteEdit); return; }
    const qm = e.target.closest('[data-quote-move]');
    if (qm) { openMoveQuote(qm.dataset.quoteMove); return; }
    const qd = e.target.closest('[data-quote-del]');
    if (qd) { removeQuote(qd.dataset.quoteDel); return; }
    const imd = e.target.closest('[data-img-del]');
    if (imd) { editingImages.splice(Number(imd.dataset.imgDel), 1); renderImagePreviews(); return; }
    const zoom = e.target.closest('[data-zoom]');
    if (zoom) { openLightbox(zoom.src); return; }
  });

  $('#btnQuoteAdd').addEventListener('click', openQuoteAdd);
  $('#btnFolderAdd').addEventListener('click', () => addFolder(null));
  $('#folderSearch').addEventListener('input', e => { folderQuery = e.target.value; renderQuoteFolders(); });
  $('#quoteModalClose').addEventListener('click', closeQuoteModal);
  $('#quoteModalCancel').addEventListener('click', closeQuoteModal);
  $('#quoteForm').addEventListener('submit', saveQuote);
  $('#quoteSearch').addEventListener('input', renderQuoteList);

  // 文件夹拖拽移动（拖到某个文件夹 = 成为其子文件夹；拖到空白处 = 移到根目录）
  const folderListEl = $('#folderList');
  folderListEl.addEventListener('dragstart', e => {
    if (e.target.closest('input, textarea')) return;
    const node = e.target.closest('[data-folder-id]');
    if (!node) return;
    dragFolderId = node.dataset.folderId;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragFolderId); } catch (_) {}
    node.classList.add('dragging');
  });
  folderListEl.addEventListener('dragend', () => {
    dragFolderId = null;
    folderListEl.querySelectorAll('.dragging, .drop-over').forEach(el => el.classList.remove('dragging', 'drop-over'));
    folderListEl.classList.remove('drop-root');
  });
  folderListEl.addEventListener('dragover', e => {
    if (!dragFolderId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    folderListEl.querySelectorAll('.drop-over').forEach(el => el.classList.remove('drop-over'));
    const target = e.target.closest('[data-folder-id]');
    if (target) {
      if (canDropInto(dragFolderId, target.dataset.folderId)) target.classList.add('drop-over');
    } else {
      folderListEl.classList.add('drop-root');
    }
  });
  folderListEl.addEventListener('drop', async e => {
    if (!dragFolderId) return;
    e.preventDefault();
    const target = e.target.closest('[data-folder-id]');
    const srcId = dragFolderId;
    dragFolderId = null;
    folderListEl.querySelectorAll('.dragging, .drop-over').forEach(el => el.classList.remove('dragging', 'drop-over'));
    folderListEl.classList.remove('drop-root');
    const newParent = target ? target.dataset.folderId : null;
    if (newParent === srcId) return;
    await moveFolder(srcId, newParent);
  });
  $('#btnQuoteImg').addEventListener('click', () => $('#quoteImgInput').click());
  $('#quoteImgInput').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    handleQuoteImages(files);
  });
  $('#quoteFields').addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.qfield;
    if (k === 'ctn_l' || k === 'ctn_w' || k === 'ctn_h') computeQuoteCbm();
  });
  $('#moveModalClose').addEventListener('click', () => { $('#moveModalMask').hidden = true; });
  $('#moveModalCancel').addEventListener('click', () => { $('#moveModalMask').hidden = true; });
  $('#moveForm').addEventListener('submit', doMoveQuote);
  $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });

  // 账号系统
  $('#authForm').addEventListener('submit', handleAuthSubmit);
  $('#authTabLogin').addEventListener('click', () => setAuthMode('login'));
  $('#authTabRegister').addEventListener('click', () => setAuthMode('register'));
  $('#btnLogout').addEventListener('click', doLogout);
  $('#btnAdminAddUser').addEventListener('click', adminAddUser);

  document.addEventListener('click', e => {
    const reset = e.target.closest('[data-admin-reset]');
    if (reset) { adminResetPassword(reset.dataset.adminReset); return; }
    const toggle = e.target.closest('[data-admin-toggle]');
    if (toggle) { adminToggleRole(toggle.dataset.adminToggle); return; }
    const del = e.target.closest('[data-admin-del]');
    if (del) { adminDeleteUser(del.dataset.adminDel); return; }
  });

  // 智能助手
  $('#btnAssistantSend').addEventListener('click', sendAssistantMessage);
  $('#btnAssistantNew').addEventListener('click', newConversation);
  $('#btnAssistantSettings').addEventListener('click', () => {
    $('#dsKey').value = getDsKey();
    $('#assistantSettings').hidden = !$('#assistantSettings').hidden;
  });
  $('#btnSaveKey').addEventListener('click', saveDsKey);
  $('#assistantInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAssistantMessage(); }
  });
  document.addEventListener('click', e => {
    const ren = e.target.closest('[data-conv-rename]');
    if (ren) { renameConversation(ren.dataset.convRename); return; }
    const del = e.target.closest('[data-conv-del]');
    if (del) { deleteConversation(del.dataset.convDel); return; }
    const conv = e.target.closest('[data-conv]');
    if (conv) { openConversation(conv.dataset.conv); return; }
  });
}

function populateFilters() {
  const opts = '<option value="">全部类型</option>' +
    ORDER_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  $('#typeFilter').innerHTML = opts;
  $('#trackTypeFilter').innerHTML = opts;
}

/* ---------- 账号系统 / 管理员 ---------- */
let authMode = 'login';
let adminUsers = [];

function updateAuthUI() {
  const u = Auth.currentUser();
  $('#userName').textContent = u || '未登录';
  const isAdmin = Auth.isAdmin();
  $('#navAdmin').hidden = !isAdmin;
  $('#btnLogout').hidden = !Auth.loggedIn();
  if (!isAdmin && currentModule === 'admin') setModule('contracts');
}

async function afterLogin() {
  await Auth.refresh();
  if (!Auth.loggedIn()) {
    $('#authOverlay').hidden = false;
    updateAuthUI();
    return;
  }
  $('#authOverlay').hidden = true;
  updateAuthUI();
  setModule('contracts');
  await loadGlobalConfig();
  await loadSettings();
  populateFilters();
  await refresh();
  await refreshQuotes();
  await refreshConversations();
  newConversation();
  if (Auth.isAdmin()) await refreshAdmin();
}

function setAuthMode(m) {
  authMode = m;
  $('#authTabLogin').classList.toggle('active', m === 'login');
  $('#authTabRegister').classList.toggle('active', m === 'register');
  $('#authSubmit').textContent = m === 'login' ? '登 录' : '注 册';
  $('#authMsg').textContent = '';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = $('#authUsername').value;
  const password = $('#authPassword').value;
  const msg = $('#authMsg');
  msg.textContent = '';
  try {
    if (authMode === 'login') await Auth.login(username, password);
    else await Auth.register(username, password);
    $('#authUsername').value = '';
    $('#authPassword').value = '';
    await afterLogin();
  } catch (err) {
    msg.textContent = err.message || '操作失败';
  }
}

function doLogout() {
  Auth.logout();
  $('#authOverlay').hidden = false;
  $('#authUsername').value = '';
  $('#authPassword').value = '';
  setAuthMode('login');
  setModule('contracts');
  updateAuthUI();
  $('#contractList').innerHTML = '';
  $('#trackList').innerHTML = '';
  $('#quoteList').innerHTML = '';
  $('#folderList').innerHTML = '';
  $('#adminUserList').innerHTML = '';
  $('#assistantConvList').innerHTML = '';
  $('#assistantMessages').innerHTML = '';
  conversations = [];
  activeConv = null;
}

/* ---- 管理员面板 ---- */
async function refreshAdmin() {
  adminUsers = await Auth.listUsers();
  renderAdminUsers();
}

function renderAdminUsers() {
  const box = $('#adminUserList');
  if (!adminUsers.length) { box.innerHTML = '<div class="empty">暂无账号</div>'; return; }
  box.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>账号</th><th>角色</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>${adminUsers.map(u => `
          <tr>
            <td class="strong">${escapeHtml(u.username)}</td>
            <td>${u.is_admin ? '<span class="role-badge admin">管理员</span>' : '<span class="role-badge">普通用户</span>'}</td>
            <td>${fmtDate(u.created_at)}</td>
            <td class="ops">
              <button class="btn-mini" data-admin-reset="${u.id}">重置密码</button>
              <button class="btn-mini" data-admin-toggle="${u.id}">${u.is_admin ? '取消管理员' : '设为管理员'}</button>
              <button class="btn-mini danger" data-admin-del="${u.id}">删除</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function adminResetPassword(id) {
  const u = adminUsers.find(x => x.id === id);
  if (!u) return;
  const pwd = prompt(`为账号「${u.username}」设置新密码：`);
  if (!pwd) return;
  try {
    await Auth.resetPassword(u.username, pwd);
    toast('密码已重置');
  } catch (err) { toast('重置失败：' + err.message, true); }
}

async function adminToggleRole(id) {
  const u = adminUsers.find(x => x.id === id);
  if (!u) return;
  if (u.username === 'wlb') { toast('主管理员账号的角色不能修改', true); return; }
  try {
    await Storage.update('users', u.id, { is_admin: !u.is_admin });
    await refreshAdmin();
    toast('已更新角色');
  } catch (err) { toast('操作失败：' + err.message, true); }
}

async function adminDeleteUser(id) {
  const u = adminUsers.find(x => x.id === id);
  if (!u) return;
  if (u.username === 'wlb') { toast('不能删除主管理员账号', true); return; }
  if (!confirm(`确定删除账号「${u.username}」？其名下所有数据也会一并删除，不可恢复。`)) return;
  try {
    for (const col of ['contracts', 'quotes', 'quote_folders']) {
      const all = await Storage.getAll(col);
      for (const r of all.filter(x => x.owner === u.username)) {
        await Storage.remove(col, r.id);
      }
    }
    await Storage.remove('users', u.id);
    await refreshAdmin();
    toast('已删除账号');
  } catch (err) { toast('删除失败：' + err.message, true); }
}

async function adminAddUser() {
  const username = (prompt('新账号用户名：') || '').trim();
  if (!username) return;
  if (username.length < 2) { toast('用户名至少 2 个字符', true); return; }
  const pwd = prompt('设置密码：');
  if (!pwd) return;
  try {
    const users = await Auth.listUsers();
    if (users.some(u => u.username === username)) { toast('该账号已存在', true); return; }
    const isAdmin = confirm('是否设为管理员？（确定=管理员，取消=普通用户）');
    const user = { id: genId(), username, password: Auth.hashPassword(username, pwd), is_admin: isAdmin, created_at: nowISO() };
    await Storage.add('users', user);
    await refreshAdmin();
    toast('已新增账号');
  } catch (err) { toast('新增失败：' + err.message, true); }
}

/* ---------- 启动 ---------- */
async function init() {
  Storage.init();
  renderModeBadge();
  bindEvents();
  Auth.loadSession();
  updateAuthUI();
  if (!Auth.loggedIn()) {
    $('#authOverlay').hidden = false;
    return;
  }
  await afterLogin();
}
document.addEventListener('DOMContentLoaded', init);
