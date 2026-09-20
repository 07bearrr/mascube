/* ============================================================
   外贸跟单管理 · 主逻辑
   包含：统计卡片 / 表格视图 / 看板视图 / 增删改查
   ============================================================ */

const ORDER_STATUSES = ['待跟进', '报价中', '已下单', '生产中', '质检', '已发货', '已到港', '已完成', '已取消'];
const FINISHED_STATUSES = ['已发货', '已完成', '已取消'];

const STATUS_COLORS = {
  '待跟进': '#8b95a3',
  '报价中': '#3b82f6',
  '已下单': '#7c3aed',
  '生产中': '#f59e0b',
  '质检': '#14b8a6',
  '已发货': '#22c55e',
  '已到港': '#06b6d4',
  '已完成': '#16a34a',
  '已取消': '#ef4444',
};

let orders = [];
let viewMode = 'table';   // 'table' | 'kanban'
let filters = { search: '', status: '' };
let sort = { field: 'created_at', dir: 'desc' };
let currentPage = 1;
let editingId = null;
let currentModule = 'orders';   // 'orders' | 'contracts'
const PAGE_SIZE = 20;

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
function autoOrderNo() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return 'PO-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}
function statusBadge(status) {
  const c = STATUS_COLORS[status] || '#8b95a3';
  return `<span class="status-badge" style="background:${c}1a;color:${c};border:1px solid ${c}40">${escapeHtml(status)}</span>`;
}

/* ---------- 数据加载 ---------- */
async function refresh() {
  try {
    orders = await Storage.getAll('orders');
    render();
  } catch (err) {
    console.error(err);
    toast('加载数据失败：' + err.message, true);
  }
}

function render() {
  renderModeBadge();
  renderStats();
  if (viewMode === 'table') renderTable();
  else renderKanban();
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

/* ---------- 统计卡片 ---------- */
function renderStats() {
  const total = orders.length;
  const countBy = s => orders.filter(o => o.status === s).length;
  const warning = orders.filter(o => {
    const d = daysUntil(o.delivery_date);
    return d !== null && d <= 7 && !FINISHED_STATUSES.includes(o.status);
  }).length;

  const cards = [
    { label: '订单总数', value: total, color: '#2563eb' },
    { label: '待跟进', value: countBy('待跟进'), color: '#8b95a3' },
    { label: '生产中', value: countBy('生产中'), color: '#f59e0b' },
    { label: '已发货', value: countBy('已发货'), color: '#22c55e' },
    { label: '交期预警（7天内）', value: warning, color: warning > 0 ? '#ef4444' : '#16a34a' },
  ];
  $('#stats').innerHTML = cards.map(c =>
    `<div class="stat-card"><div class="stat-value" style="color:${c.color}">${c.value}</div><div class="stat-label">${c.label}</div></div>`
  ).join('');
}

/* ---------- 筛选 / 排序 ---------- */
function getFiltered() {
  const s = filters.search.trim().toLowerCase();
  let list = orders.filter(o => {
    if (filters.status && o.status !== filters.status) return false;
    if (s) {
      const hay = [o.order_no, o.customer, o.product, o.country, o.remark].join(' ').toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });
  const f = sort.field, dir = sort.dir === 'asc' ? 1 : -1;
  list.sort((a, b) => cmp(a, b, f) * dir);
  return list;
}

function cmp(a, b, field) {
  let va = a[field], vb = b[field];
  if (va == null) va = ''; if (vb == null) vb = '';
  if (field === 'quantity' || field === 'amount') {
    const na = parseFloat(String(va).replace(/[^0-9.-]/g, ''));
    const nb = parseFloat(String(vb).replace(/[^0-9.-]/g, ''));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
  }
  return String(va).localeCompare(String(vb), 'zh-CN');
}

/* ---------- 表格视图 ---------- */
function renderTable() {
  const list = getFiltered();
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  const columns = [
    { key: 'order_no', label: '订单号' },
    { key: 'customer', label: '客户名称' },
    { key: 'country', label: '国家' },
    { key: 'product', label: '产品' },
    { key: 'quantity', label: '数量' },
    { key: 'amount', label: '金额' },
    { key: 'order_date', label: '下单日期' },
    { key: 'delivery_date', label: '交期' },
    { key: 'status', label: '状态' },
  ];
  const head = columns.map(c => {
    const arrow = sort.field === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th data-sort="${c.key}" class="sortable">${c.label}${arrow}</th>`;
  }).join('') + '<th style="width:120px">操作</th>';

  const body = pageItems.length
    ? pageItems.map(o => `
      <tr>
        <td>${escapeHtml(o.order_no || '—')}</td>
        <td class="strong">${escapeHtml(o.customer || '—')}</td>
        <td>${escapeHtml(o.country || '—')}</td>
        <td>${escapeHtml(o.product || '—')}</td>
        <td>${escapeHtml(o.quantity || '—')}</td>
        <td>${escapeHtml(o.amount || '—')}</td>
        <td>${fmtDate(o.order_date)}</td>
        <td>${fmtDate(o.delivery_date)}</td>
        <td>${statusBadge(o.status)}</td>
        <td class="ops">
          <button class="btn-mini" data-edit="${o.id}">编辑</button>
          <button class="btn-mini danger" data-del="${o.id}">删除</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="10" class="empty">暂无数据，点击右上角「+ 新增订单」开始</td></tr>`;

  $('#viewContainer').innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="pagination">
      <span>共 ${list.length} 条</span>
      <div class="page-btns">
        <button class="btn" data-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
        <span class="page-info">${currentPage} / ${totalPages}</span>
        <button class="btn" data-page="next" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
      </div>
    </div>`;
}

/* ---------- 看板视图 ---------- */
function renderKanban() {
  const filtered = getFiltered();
  const cols = ORDER_STATUSES.map(status => {
    const items = filtered.filter(o => o.status === status);
    return `
      <div class="kanban-col" data-status="${status}">
        <div class="kanban-col-head">
          <span class="dot" style="background:${STATUS_COLORS[status]}"></span>
          <span class="kanban-col-title">${status}</span>
          <span class="count">${items.length}</span>
          <button class="kanban-add" data-add-status="${status}" title="在此状态下新增">+</button>
        </div>
        <div class="kanban-body">
          ${items.map(o => `
            <div class="kanban-card" draggable="true" data-id="${o.id}" data-edit="${o.id}" title="拖拽可改状态，点击可编辑">
              <div class="kanban-card-title">${escapeHtml(o.customer || '—')}</div>
              <div class="kanban-card-sub">${escapeHtml(o.order_no || '—')}</div>
              <div class="kanban-card-sub">${escapeHtml(o.product || '—')}</div>
              <div class="kanban-card-foot">
                <span>交期 ${fmtDate(o.delivery_date)}</span>
                <span>${o.delivery_date && daysUntil(o.delivery_date) !== null && daysUntil(o.delivery_date) <= 7 && !FINISHED_STATUSES.includes(o.status) ? '⚠️' : ''}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
  $('#viewContainer').innerHTML = `<div class="kanban">${cols}</div>`;
}

/* ---------- 弹窗：新增 / 编辑 ---------- */
function openAdd(status) {
  editingId = null;
  $('#modalTitle').textContent = '新增订单';
  $('#orderForm').reset();
  $('#f_order_no').value = autoOrderNo();
  $('#f_status').value = status || ORDER_STATUSES[0];
  $('#modalMask').hidden = false;
  $('#f_customer').focus();
}

function openEdit(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  editingId = id;
  $('#modalTitle').textContent = '编辑订单';
  $('#f_order_no').value = o.order_no || '';
  $('#f_customer').value = o.customer || '';
  $('#f_country').value = o.country || '';
  $('#f_product').value = o.product || '';
  $('#f_quantity').value = o.quantity || '';
  $('#f_amount').value = o.amount || '';
  $('#f_order_date').value = o.order_date || '';
  $('#f_delivery_date').value = o.delivery_date || '';
  $('#f_status').value = o.status || ORDER_STATUSES[0];
  $('#f_payment').value = o.payment || '';
  $('#f_remark').value = o.remark || '';
  $('#modalMask').hidden = false;
}

function closeModal() {
  $('#modalMask').hidden = true;
  editingId = null;
}

async function onSubmit(e) {
  e.preventDefault();
  const data = {
    order_no: $('#f_order_no').value.trim(),
    customer: $('#f_customer').value.trim(),
    country: $('#f_country').value.trim(),
    product: $('#f_product').value.trim(),
    quantity: $('#f_quantity').value.trim(),
    amount: $('#f_amount').value.trim(),
    order_date: $('#f_order_date').value,
    delivery_date: $('#f_delivery_date').value,
    status: $('#f_status').value,
    payment: $('#f_payment').value.trim(),
    remark: $('#f_remark').value.trim(),
  };
  if (!data.customer) { toast('请至少填写「客户名称」', true); return; }

  try {
    if (editingId) {
      data.updated_at = nowISO();
      await Storage.update('orders', editingId, data);
      toast('已保存');
    } else {
      data.id = genId();
      data.created_at = nowISO();
      data.updated_at = nowISO();
      await Storage.add('orders', data);
      toast('已新增');
    }
    closeModal();
    await refresh();
  } catch (err) {
    console.error(err);
    toast('保存失败：' + err.message, true);
  }
}

async function confirmDelete(id) {
  const o = orders.find(x => x.id === id);
  const name = o ? o.customer : '';
  if (!confirm(`确定删除「${name}」这条订单吗？删除后不可恢复。`)) return;
  try {
    await Storage.remove('orders', id);
    toast('已删除');
    await refresh();
  } catch (err) {
    toast('删除失败：' + err.message, true);
  }
}

/* ---------- 提示浮层 ---------- */
let toastTimer;
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- 视图切换 ---------- */
function setView(v) {
  viewMode = v;
  $$('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  render();
}

/* ---------- 模块切换 ---------- */
function setModule(m) {
  currentModule = m;
  $$('.module-tab').forEach(t => t.classList.toggle('active', t.dataset.module === m));
  $('#module-orders').hidden = m !== 'orders';
  $('#module-contracts').hidden = m !== 'contracts';
  $('#btnAdd').textContent = m === 'orders' ? '+ 新增订单' : '+ 上传合同';
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  document.addEventListener('click', e => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) { openEdit(editBtn.dataset.edit); return; }
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) { confirmDelete(delBtn.dataset.del); return; }
    const addStatus = e.target.closest('[data-add-status]');
    if (addStatus) { openAdd(addStatus.dataset.addStatus); return; }
    const pageBtn = e.target.closest('[data-page]');
    if (pageBtn && !pageBtn.disabled) {
      currentPage += pageBtn.dataset.page === 'prev' ? -1 : 1;
      render(); return;
    }
    const sortTh = e.target.closest('th[data-sort]');
    if (sortTh) {
      const key = sortTh.dataset.sort;
      if (sort.field === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else { sort.field = key; sort.dir = 'asc'; }
      render(); return;
    }
    const moduleTab = e.target.closest('.module-tab');
    if (moduleTab) { setModule(moduleTab.dataset.module); return; }
    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) { setView(viewBtn.dataset.view); return; }
  });

  /* 看板拖拽改状态 */
  document.addEventListener('dragstart', e => {
    const card = e.target.closest('.kanban-card');
    if (card) { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); }
  });
  document.addEventListener('dragend', e => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.remove('dragging');
  });
  document.addEventListener('dragover', e => {
    if (e.target.closest('.kanban-col')) e.preventDefault();
  });
  document.addEventListener('drop', async e => {
    const col = e.target.closest('.kanban-col');
    if (!col) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const status = col.dataset.status;
    const o = orders.find(x => x.id === id);
    if (o && o.status !== status) {
      await Storage.update('orders', id, { status });
      await refresh();
    }
  });

  $('#orderForm').addEventListener('submit', onSubmit);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalMask').addEventListener('click', e => { if (e.target === $('#modalMask')) closeModal(); });
  $('#btnAdd').addEventListener('click', () => {
    if (currentModule === 'orders') openAdd();
    else if (window.ContractApp) ContractApp.openUpload();
  });

  $('#searchInput').addEventListener('input', e => { filters.search = e.target.value; currentPage = 1; render(); });
  $('#statusFilter').addEventListener('change', e => { filters.status = e.target.value; currentPage = 1; render(); });
}

function populateSelects() {
  const opts = ORDER_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
  $('#statusFilter').innerHTML = '<option value="">全部状态</option>' + opts;
  $('#f_status').innerHTML = opts;
}

/* ---------- 启动 ---------- */
async function init() {
  Storage.init();
  populateSelects();
  bindEvents();
  setModule('orders');
  if (window.ContractApp) await ContractApp.init();
  await refresh();
}
document.addEventListener('DOMContentLoaded', init);
