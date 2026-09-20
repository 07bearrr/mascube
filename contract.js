/* ============================================================
   合同识别模块
   上传 JPG/PNG/PDF → 免费 OCR（Tesseract.js）识别文字 →
   尽量自动填字段 → 人工核对 → 保存
   ============================================================ */

const CONTRACT_ITEM_FIELDS = [
  { key: 'item_no', label: '货号' },
  { key: 'description', label: '产品描述' },
  { key: 'unit', label: '计量单位' },
  { key: 'pack_size', label: '装量' },
  { key: 'boxes', label: '箱数' },
  { key: 'total_qty', label: '总数' },
  { key: 'unit_price', label: '单价(含税)' },
  { key: 'amount', label: '金额' },
  { key: 'ean_each', label: 'EAN/EACH条码' },
  { key: 'mid_box_barcode', label: '中盒条码' },
  { key: 'outer_itf14', label: '外箱ITF-14条码' },
  { key: 'spec_description', label: '产品具体描述' },
  { key: 'lot_no', label: 'lot号' },
];

const ContractApp = (() => {
  let contracts = [];
  let editingId = null;
  let pendingFiles = [];   // 本次待上传的文件（File 对象）
  let savedFiles = [];     // 已保存的文件信息（编辑时载入）
  let ocrBusy = false;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ---------- 数据加载 / 列表 ---------- */
  async function refresh() {
    try {
      contracts = await Storage.getAll('contracts');
      renderList();
    } catch (err) {
      console.error(err);
      toast('加载合同失败：' + err.message, true);
    }
  }

  function renderList() {
    const s = $('#contractSearch').value.trim().toLowerCase();
    const list = contracts.filter(c => {
      if (!s) return true;
      return ((c.sales_order_no || '') + ' ' + (c.party_b || '')).toLowerCase().includes(s);
    });
    const rows = list.length ? list.map(c => {
      const items = Array.isArray(c.items) ? c.items : [];
      const files = Array.isArray(c.files) ? c.files : [];
      return `<tr>
        <td>${escapeHtml(c.sales_order_no || '—')}</td>
        <td class="strong">${escapeHtml(c.party_b || '—')}</td>
        <td>${fmtDate(c.delivery_date)}</td>
        <td>${items.length} 个货号</td>
        <td>${files.length} 个文件</td>
        <td>${fmtDate(c.created_at ? String(c.created_at).slice(0, 10) : '')}</td>
        <td class="ops">
          <button class="btn-mini" data-contract-edit="${c.id}">查看/编辑</button>
          <button class="btn-mini danger" data-contract-del="${c.id}">删除</button>
        </td>
      </tr>`;
    }).join('')
      : `<tr><td colspan="7" class="empty">暂无合同，点「上传合同」开始</td></tr>`;

    $('#contractList').innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>销售单号</th><th>乙方</th><th>交货日期</th><th>明细</th><th>文件</th><th>创建时间</th><th style="width:150px">操作</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  /* ---------- 弹窗打开 / 关闭 ---------- */
  function resetForm() {
    editingId = null;
    pendingFiles = [];
    savedFiles = [];
    $('#contractModalTitle').textContent = '上传合同';
    $('#contractForm').reset();
    $('#cf_sales_order_no').value = '';
    $('#cf_party_b').value = '';
    $('#cf_delivery_date').value = '';
    $('#itemsContainer').innerHTML = '';
    $('#ocrRawBox').hidden = true;
    $('#ocrRawText').textContent = '';
    setOcrStatus('');
    renderFileList();
    addItemRow();
  }

  function openUpload() {
    resetForm();
    $('#contractModalMask').hidden = false;
  }

  function openEdit(id) {
    const c = contracts.find(x => x.id === id);
    if (!c) return;
    editingId = id;
    pendingFiles = [];
    savedFiles = Array.isArray(c.files) ? c.files : [];
    $('#contractModalTitle').textContent = '查看 / 编辑合同';
    $('#cf_sales_order_no').value = c.sales_order_no || '';
    $('#cf_party_b').value = c.party_b || '';
    $('#cf_delivery_date').value = c.delivery_date || '';
    $('#itemsContainer').innerHTML = '';
    const items = (Array.isArray(c.items) && c.items.length) ? c.items : [{}];
    items.forEach(it => addItemRow(it));
    $('#ocrRawBox').hidden = true;
    setOcrStatus('');
    renderFileList();
    $('#contractModalMask').hidden = false;
  }

  function closeModal() {
    $('#contractModalMask').hidden = true;
    editingId = null;
    pendingFiles = [];
  }

  /* ---------- 文件选择 ---------- */
  function handleFiles(files) {
    Array.from(files || []).forEach(f => {
      const ok = /\.(jpe?g|png|pdf)$/i.test(f.name) || /^image\//.test(f.type) || f.type === 'application/pdf';
      if (!ok) { toast('跳过不支持的文件：' + f.name, true); return; }
      pendingFiles.push(f);
    });
    renderFileList();
    if (pendingFiles.length) setOcrStatus(`已选 ${pendingFiles.length} 个文件，点「智能识别」开始`);
  }

  function renderFileList() {
    let html = '';
    savedFiles.forEach(f => { html += fileItemHtml(f, true, null); });
    pendingFiles.forEach((f, i) => { html += fileItemHtml(f, false, i); });
    $('#contractFileList').innerHTML = html;
  }

  function fileItemHtml(f, saved, idx) {
    const link = f.url
      ? `<a class="file-link" href="${f.url}" target="_blank" rel="noopener">打开</a>`
      : (f.dataUrl ? `<a class="file-link" href="${f.dataUrl}" download="${escapeHtml(f.name || 'file')}">下载</a>` : '');
    const badge = saved ? '<span class="file-badge saved">已保存</span>' : '<span class="file-badge">待上传</span>';
    const remove = saved ? '' : `<button class="btn-mini danger" type="button" data-remove-file="${idx}">移除</button>`;
    return `<div class="file-item"><span class="file-name">📄 ${escapeHtml(f.name || '文件')}</span>${link}${badge}${remove}</div>`;
  }

  /* ---------- OCR 识别 ---------- */
  async function recognize() {
    if (ocrBusy) return;
    if (!pendingFiles.length) { toast('请先上传合同文件', true); return; }
    if (typeof Tesseract === 'undefined') {
      toast('OCR 引擎还没加载好（网络较慢），请稍等几秒再点「智能识别」', true);
      return;
    }
    const hasPdf = pendingFiles.some(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (hasPdf && typeof pdfjsLib === 'undefined') {
      toast('PDF 引擎还没加载好（网络较慢），请稍等几秒再试', true);
      return;
    }

    ocrBusy = true;
    $('#btnRecognize').disabled = true;
    setOcrStatus('正在加载识别引擎（首次较慢，需下载中文语言包）...');
    try {
      let fullText = '';
      for (let i = 0; i < pendingFiles.length; i++) {
        const f = pendingFiles[i];
        setOcrStatus(`识别中 ${i + 1}/${pendingFiles.length}：${f.name}（多页 PDF 较慢，请耐心等待）...`);
        const text = await ocrFile(f);
        fullText += '\n\n===== ' + f.name + ' =====\n' + text;
      }
      $('#ocrRawText').textContent = fullText;
      $('#ocrRawBox').hidden = false;
      applyExtraction(fullText);
      setOcrStatus('识别完成 ✅ 已自动填入部分字段，请核对后再保存');
      toast('识别完成，请核对字段');
    } catch (err) {
      console.error(err);
      setOcrStatus('');
      toast('识别失败：' + err.message + '（仍可手动填写）', true);
    } finally {
      ocrBusy = false;
      $('#btnRecognize').disabled = false;
    }
  }

  async function ocrFile(file) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return await ocrPdf(file);
    return await ocrImage(file);
  }

  async function ocrImage(imageInput) {
    if (typeof Tesseract === 'undefined') throw new Error('OCR 引擎未加载');
    const worker = await Tesseract.createWorker('chi_sim+eng');
    try {
      const { data } = await worker.recognize(imageInput);
      return data.text || '';
    } finally {
      await worker.terminate();
    }
  }

  async function ocrPdf(file) {
    if (typeof Tesseract === 'undefined' || typeof pdfjsLib === 'undefined') throw new Error('PDF/OCR 引擎未加载');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const worker = await Tesseract.createWorker('chi_sim+eng');
    let out = '';
    try {
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const { data } = await worker.recognize(canvas);
        out += (data.text || '') + '\n';
      }
    } finally {
      await worker.terminate();
    }
    return out;
  }

  /* ---------- 字段自动提取（尽力而为，需人工核对） ---------- */
  function applyExtraction(text) {
    const ex = extractFields(text);
    if (ex.sales_order_no && !$('#cf_sales_order_no').value) $('#cf_sales_order_no').value = ex.sales_order_no;
    if (ex.party_b && !$('#cf_party_b').value) $('#cf_party_b').value = ex.party_b;
    if (ex.delivery_date && !$('#cf_delivery_date').value) $('#cf_delivery_date').value = ex.delivery_date;

    const existing = collectItems();
    if (!existing.some(anyValue)) {
      $('#itemsContainer').innerHTML = '';
      (ex.items && ex.items.length ? ex.items : [{}]).forEach(it => addItemRow(it));
    }
  }

  function pick(re, text) {
    const m = text.match(re);
    return m ? (m[1] || m[0]).trim() : '';
  }

  function normalizeDate(s) {
    if (!s) return '';
    const m = s.match(/(\d{4})[年\/\-.](\d{1,2})[月\/\-.](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
  }

  function extractFields(text) {
    const t = (text || '').replace(/[ \t]+/g, ' ');
    const r = { sales_order_no: '', party_b: '', delivery_date: '', items: [] };

    r.sales_order_no = pick(/销售单号[：:\s]*([A-Za-z0-9][A-Za-z0-9\-\/]*)/, t)
      || pick(/订单号[：:\s]*([A-Za-z0-9][A-Za-z0-9\-\/]*)/, t)
      || pick(/单号[：:\s]*([A-Za-z0-9][A-Za-z0-9\-\/]*)/, t);

    r.party_b = pick(/乙方[：:\s]*([^\n\r，,。;；]+)/, t)
      || pick(/客户名称[：:\s]*([^\n\r，,。;；]+)/, t)
      || pick(/客户[：:\s]*([^\n\r，,。;；]+)/, t);

    r.delivery_date = normalizeDate(
      pick(/交货日期[：:\s]*(\d{4}[年\/\-.]\d{1,2}[月\/\-.]\d{1,2}日?)/, t)
      || pick(/交\s*期[：:\s]*(\d{4}[年\/\-.]\d{1,2}[月\/\-.]\d{1,2}日?)/, t)
    );

    r.items = extractItems(t);
    if (r.items.length === 1) {
      r.items[0] = { ...r.items[0], ...extractItemMeta(t), ...extractBarcodes(t) };
    }
    return r;
  }

  function extractItems(t) {
    const items = [];
    const seen = new Set();
    const re = /货号[：:\s]*([A-Za-z0-9][A-Za-z0-9\-\/\.]{1,30})/g;
    let m;
    while ((m = re.exec(t))) {
      const code = m[1];
      if (seen.has(code)) continue;
      seen.add(code);
      items.push({ item_no: code });
    }
    return items;
  }

  function extractItemMeta(t) {
    const g = re => { const m = t.match(re); return m ? m[1].trim() : ''; };
    return {
      unit: g(/计量单位[：:\s]*([^\s，,。;；\n]{1,10})/) || g(/单位[：:\s]*([^\s，,。;；\n]{1,10})/),
      pack_size: g(/装量[：:\s]*([\d.]+)/) || g(/包装规格[：:\s]*([\d.]+)/),
      boxes: g(/箱数[：:\s]*([\d,]+)/),
      total_qty: g(/总[数量数]{0,2}[：:\s]*([\d,]+)/) || g(/数量[：:\s]*([\d,]+)/),
      unit_price: g(/(?:含税)?单价[：:\s]*([¥￥]?\s*[\d,]+\.?\d*)/),
      amount: g(/金额[：:\s]*([¥￥]?\s*[\d,]+\.?\d*)/) || g(/合计[：:\s]*([¥￥]?\s*[\d,]+\.?\d*)/),
      lot_no: g(/[Ll]ot\s*[号#：:\s]*([A-Za-z0-9\-]+)/) || g(/批号[：:\s]*([A-Za-z0-9\-]+)/),
    };
  }

  function extractBarcodes(t) {
    const list = [];
    const seen = new Set();
    const re = /\b(\d{12,14})\b/g;
    let m;
    while ((m = re.exec(t))) {
      if (!seen.has(m[1])) { seen.add(m[1]); list.push(m[1]); }
    }
    const r = { ean_each: '', mid_box_barcode: '', outer_itf14: '' };
    list.forEach(d => {
      if (d.length === 14 && !r.outer_itf14) r.outer_itf14 = d;
      else if (d.length === 13 && !r.ean_each) r.ean_each = d;
      else if (d.length === 13 && !r.mid_box_barcode) r.mid_box_barcode = d;
    });
    return r;
  }

  /* ---------- 明细行 ---------- */
  function addItemRow(data = {}) {
    const el = document.createElement('div');
    el.className = 'item-card';
    el.innerHTML = `
      <div class="item-card-head">
        <span class="item-idx"></span>
        <button class="btn-mini danger" type="button" data-item-remove>删除此行</button>
      </div>
      <div class="item-grid">
        ${CONTRACT_ITEM_FIELDS.map(f =>
          `<label>${f.label}<input data-item-field="${f.key}" value="${escapeHtml(data[f.key] || '')}"></label>`
        ).join('')}
      </div>`;
    $('#itemsContainer').appendChild(el);
    renumberItems();
  }

  function renumberItems() {
    $$('#itemsContainer .item-card').forEach((card, i) => {
      card.querySelector('.item-idx').textContent = '第 ' + (i + 1) + ' 行';
    });
  }

  function collectItems() {
    return $$('#itemsContainer .item-card').map(card => {
      const obj = {};
      card.querySelectorAll('[data-item-field]').forEach(inp => {
        obj[inp.dataset.itemField] = inp.value.trim();
      });
      return obj;
    });
  }

  function anyValue(it) {
    return Object.values(it).some(v => String(v).trim() !== '');
  }

  /* ---------- 保存 / 删除 ---------- */
  async function save(e) {
    e.preventDefault();
    const items = collectItems().filter(anyValue);
    const data = {
      sales_order_no: $('#cf_sales_order_no').value.trim(),
      party_b: $('#cf_party_b').value.trim(),
      delivery_date: $('#cf_delivery_date').value,
      items,
      files: savedFiles.slice(),
    };
    if (!data.sales_order_no && !data.party_b && !items.length && !data.files.length) {
      toast('请至少填写一项内容', true);
      return;
    }
    try {
      if (!Storage.isCloud() && pendingFiles.some(f => f.size > 1.5 * 1024 * 1024)) {
        toast('本地模式下文件较大，保存可能失败；建议先配置云端（见 README）', true);
      }
      for (const f of pendingFiles) {
        data.files.push(await Storage.uploadFile(f));
      }
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
    const name = c ? (c.sales_order_no || c.party_b || '未命名') : '';
    if (!confirm(`确定删除合同「${name}」吗？删除后不可恢复。`)) return;
    try {
      await Storage.remove('contracts', id);
      toast('已删除');
      await refresh();
    } catch (err) {
      toast('删除失败：' + err.message, true);
    }
  }

  /* ---------- 状态提示 ---------- */
  function setOcrStatus(msg) {
    const el = $('#ocrStatus');
    el.textContent = msg || '';
    el.className = 'ocr-status' + (msg && msg.includes('失败') ? ' error' : '');
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    $('#btnUploadContract').addEventListener('click', openUpload);
    $('#contractModalClose').addEventListener('click', closeModal);
    $('#contractModalCancel').addEventListener('click', closeModal);
    $('#contractModalMask').addEventListener('click', e => { if (e.target === $('#contractModalMask')) closeModal(); });
    $('#contractForm').addEventListener('submit', save);
    $('#btnAddItem').addEventListener('click', () => addItemRow());
    $('#btnRecognize').addEventListener('click', recognize);
    $('#contractSearch').addEventListener('input', renderList);

    const dz = $('#dropzone');
    dz.addEventListener('click', e => {
      if (e.target === $('#contractFileInput')) return;
      $('#contractFileInput').click();
    });
    $('#contractFileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });
    ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => { handleFiles(e.dataTransfer.files); });

    document.addEventListener('click', e => {
      const rm = e.target.closest('[data-item-remove]');
      if (rm) { rm.closest('.item-card').remove(); renumberItems(); return; }
      const rf = e.target.closest('[data-remove-file]');
      if (rf) { pendingFiles.splice(Number(rf.dataset.removeFile), 1); renderFileList(); return; }
      const edit = e.target.closest('[data-contract-edit]');
      if (edit) { openEdit(edit.dataset.contractEdit); return; }
      const del = e.target.closest('[data-contract-del]');
      if (del) { removeContract(del.dataset.contractDel); return; }
    });
  }

  /* ---------- 启动 ---------- */
  async function init() {
    bindEvents();
    await refresh();
  }

  return { init, refresh, openUpload, openEdit };
})();
