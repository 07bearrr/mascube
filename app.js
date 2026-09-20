/* ============================================================
   业务员辅助系统
   模块一：合同管理（合同 + 产品信息，不含进度）
   模块二：进度追踪（关联合同，更新每个货号的订单进度）
   ============================================================ */

const ORDER_TYPES = ['翻单', '新单'];

const PROGRESS_STEPS = [
  { key: 'quote_confirmed', label: '已收到返单工厂单价交期', type: 'check' },
  { key: 'pi_sent', label: 'PI已发送', type: 'check' },
  { key: 'po_received', label: 'PO已收到', type: 'check' },
  { key: 'recheck_price', label: '已复核单价交期', type: 'check' },
  { key: 'contract_drafted', label: '已撰写采购合同', type: 'check' },
  { key: 'contract_stamped', label: '合同已敲章', type: 'check' },
  { key: 'countersigned', label: '供应商已提供回签', type: 'check' },
  { key: 'packaging', label: '包材进度', type: 'select', doneValue: '制版已确认',
    options: ['沿用老设计', '客户修改设计中', '我们的设计师修改设计中', '设计文件已发给对应包装厂', '包装厂已制作出制版', '制版已确认'] },
  { key: 'bulk_prod', label: '大货制作', type: 'select', doneValue: '大货制作完毕', options: ['大货制作中', '大货制作完毕'] },
  { key: 'bulk_sample', label: '大货样', type: 'select', doneValue: '大货样已寄出', options: ['大货样未寄出', '大货样已寄出'] },
  { key: 'bulk_photos', label: '大货照', type: 'select', doneValue: '大货照已齐', options: ['大货照未齐', '大货照已齐'] },
  { key: 'warehouse_receipt', label: '进仓单', type: 'select', doneValue: '进仓单已发', options: ['进仓单未发', '进仓单已发'] },
  { key: 'warehouse', label: '进仓', type: 'select', doneValue: '已进仓', options: ['未进仓', '已进仓'] },
  { key: 'inspection', label: '验货', type: 'select', doneValue: '本人已验货', options: ['本人未验货', '本人已验货'] },
];

const ITEM_FIELDS = [
  { key: 'item_no', label: '货号' },
  { key: 'description', label: '产品描述', span: 2 },
  { key: 'unit', label: '计量单位' },
  { key: 'pack_size', label: '装量', num: true },
  { key: 'boxes', label: '箱数', num: true },
  { key: 'total_qty', label: '总数(装量×箱数)', readonly: true },
  { key: 'unit_price', label: '单价(含税)', num: true },
  { key: 'amount', label: '金额(总数×单价)', readonly: true },
  { key: 'delivery_date', label: '交货日期', type: 'date' },
  { key: 'ship_date', label: '船期', type: 'date' },
  { key: 'ean_each', label: 'EAN/EACH条码' },
  { key: 'mid_box_barcode', label: '中盒条码' },
  { key: 'outer_itf14', label: '外箱ITF-14条码' },
  { key: 'lot_no', label: 'LOT号' },
  { key: 'packaging_req', label: '包装要求', span: 3 },
  { key: 'order_type', label: '订单类型', type: 'select', options: ORDER_TYPES },
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

function progressDone(item) {
  const p = item.progress || {};
  let done = 0;
  PROGRESS_STEPS.forEach(s => {
    if (s.type === 'check') { if (p[s.key] === true) done++; }
    else if (p[s.key] === s.doneValue) done++;
  });
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
    const pct = Math.round(done / PROGRESS_STEPS.length * 100);
    return `<tr>
      <td>${escapeHtml(r.c.sales_order_no || '—')}</td>
      <td class="strong">${escapeHtml(r.it.item_no || '—')}</td>
      <td>${escapeHtml(r.it.order_type || '未定')}</td>
      <td>${fmtDate(r.it.delivery_date)}</td>
      <td class="cell-progress">
        <div class="track-progress">
          <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
          <span>${done}/${PROGRESS_STEPS.length}</span>
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
  const fields = ITEM_FIELDS.map(f => {
    const val = item[f.key] == null ? '' : item[f.key];
    const cls = f.span ? ` item-field span${f.span}` : ' item-field';
    let control;
    if (f.type === 'date') {
      control = `<input type="date" data-item-field="${f.key}" value="${escapeHtml(val)}">`;
    } else if (f.type === 'select') {
      control = `<select data-item-field="${f.key}">${f.options.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    } else {
      control = `<input type="text" ${f.num ? 'inputmode="decimal"' : ''} ${f.readonly ? 'readonly' : ''} data-item-field="${f.key}" value="${escapeHtml(val)}">`;
    }
    return `<label class="${cls}">${f.label}${control}</label>`;
  }).join('');

  return `
    <div class="item-card" data-item-id="${item.id || ''}">
      <div class="item-card-head">
        <span class="item-idx"></span>
        <button class="btn-mini danger" type="button" data-item-remove>删除此货号</button>
      </div>
      <div class="item-grid">${fields}</div>
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
  return PROGRESS_STEPS.map(s => {
    if (s.type === 'check') {
      return `<label class="progress-step">
        <input type="checkbox" data-progress-check="${s.key}" ${progress[s.key] === true ? 'checked' : ''}>
        <span>${s.label}</span>
      </label>`;
    }
    const cur = progress[s.key] || '';
    return `<label class="progress-step select">
      <span>${s.label}</span>
      <select data-progress-select="${s.key}">
        <option value="">未开始</option>
        ${s.options.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </label>`;
  }).join('');
}

function readProgressFrom(root) {
  const progress = {};
  root.querySelectorAll('[data-progress-check]').forEach(cb => { progress[cb.dataset.progressCheck] = cb.checked; });
  root.querySelectorAll('[data-progress-select]').forEach(sel => { if (sel.value) progress[sel.dataset.progressSelect] = sel.value; });
  return progress;
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

/* ---------- 模块切换 ---------- */
function setModule(m) {
  currentModule = m;
  $$('.side-nav-item').forEach(b => b.classList.toggle('active', b.dataset.module === m));
  $('#module-contracts').hidden = m !== 'contracts';
  $('#module-tracking').hidden = m !== 'tracking';
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
  $('#modalMask').addEventListener('click', e => { if (e.target === $('#modalMask')) closeModal(); });
  $('#contractForm').addEventListener('submit', save);

  $('#progressModalClose').addEventListener('click', closeProgress);
  $('#progressModalCancel').addEventListener('click', closeProgress);
  $('#progressModalMask').addEventListener('click', e => { if (e.target === $('#progressModalMask')) closeProgress(); });
  $('#progressForm').addEventListener('submit', saveProgress);

  $('#searchInput').addEventListener('input', renderList);
  $('#typeFilter').addEventListener('change', renderList);
  $('#trackSearch').addEventListener('input', renderTracking);
  $('#trackTypeFilter').addEventListener('change', renderTracking);

  $('#itemsContainer').addEventListener('input', e => {
    const f = e.target.dataset && e.target.dataset.itemField;
    if (f === 'pack_size' || f === 'boxes' || f === 'unit_price') recompute(e.target.closest('.item-card'));
  });
}

function populateFilters() {
  const opts = '<option value="">全部类型</option>' +
    ORDER_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  $('#typeFilter').innerHTML = opts;
  $('#trackTypeFilter').innerHTML = opts;
}

/* ---------- 启动 ---------- */
async function init() {
  Storage.init();
  renderModeBadge();
  populateFilters();
  bindEvents();
  setModule('contracts');
  await refresh();
}
document.addEventListener('DOMContentLoaded', init);
