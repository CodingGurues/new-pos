import { query, run } from './db.js?v=stockfix14';
import { fmtCurrency, toast } from './ui.js?v=stockfix14';

let actionToRun = null;

export function initInvoices(refreshAll) {
  const form = document.getElementById('invoice-form');
  form.innerHTML = invoiceFormTemplate();
  wireInvoiceForm(form, refreshAll);
  renderInvoiceFormOptions(form);
  recalcInvoicePreview(form);
  renderInvoices(refreshAll);
}

function invoiceFormTemplate() {
  return `
    <div class="form-mode">Create Professional Invoice</div>
    <div class="field"><label>Customer</label><select name="customer_id"></select></div>
    <div class="field"><label>Product Search</label><input name="product_search" placeholder="Search by name, SKU, category" /></div>
    <div class="field"><label>Product</label><select name="product_id" required></select></div>
    <div class="field"><label>Product Category</label><input name="product_category" readonly /></div>
    <div class="field"><label>Unit Price</label><input name="unit_price" type="number" step="0.01" required /></div>
    <div class="field"><label>Quantity</label><input name="qty" type="number" min="1" value="1" required /></div>

    <div class="field"><label>Product Discount</label><input name="product_discount_value" type="number" step="0.01" value="0" /></div>
    <div class="field"><label>Discount Type</label><select name="product_discount_type"><option value="percent">%</option><option value="fixed">Fixed</option></select></div>

    <div class="field"><label>Invoice Discount</label><input name="invoice_discount_value" type="number" step="0.01" value="0" /></div>
    <div class="field"><label>Discount Type</label><select name="invoice_discount_type"><option value="percent">%</option><option value="fixed">Fixed</option></select></div>

    <div class="field"><label>Tax</label><input name="tax_value" type="number" step="0.01" value="0" /></div>
    <div class="field"><label>Tax Type</label><select name="tax_type"><option value="percent">%</option><option value="fixed">Fixed</option></select></div>

    <div class="field"><label>Payment Type</label><select name="payment_type"><option>Cash</option><option>Bank Transfer</option><option>Easypaisa</option><option>JazzCash</option></select></div>
    <div class="field"><label>Paid Amount</label><input name="paid_amount" type="number" step="0.01" value="0" /></div>

    <div class="field"><label>Subtotal</label><input name="subtotal" readonly /></div>
    <div class="field"><label>Total</label><input name="total" readonly /></div>
    <div class="field"><label>Profit</label><input name="profit" readonly /></div>
    <div class="field"><label>Return Amount</label><input name="return_amount" readonly /></div>
    <div class="field"><label>Due Amount</label><input name="due_amount" readonly /></div>

    <div class="form-actions-row">
      <button class="btn" type="button" id="save-invoice-btn">💾 Save Invoice</button>
      <button class="ghost-btn" type="button" id="hold-invoice-btn">📌 Hold Invoice</button>
      <button class="ghost-btn" type="button" id="pay-all-btn">💰 Pay All</button>
      <button class="ghost-btn" type="button" id="reset-invoice-btn">🔄 Reset Invoice</button>
    </div>
  `;
}

function wireInvoiceForm(form, refreshAll) {
  const recalc = () => recalcInvoicePreview(form);
  form.oninput = recalc;
  form.onchange = e => {
    if (e.target.name === 'product_id') applyProductSelection(form);
    recalc();
  };

  form.querySelector('[name="product_search"]').oninput = () => filterProducts(form);

  form.querySelector('#pay-all-btn').onclick = () => {
    recalc();
    form.elements.paid_amount.value = form.elements.total.value || '0';
    recalc();
  };

  form.querySelector('#reset-invoice-btn').onclick = () => {
    form.reset();
    renderInvoiceFormOptions(form);
    recalcInvoicePreview(form);
  };

  form.querySelector('#save-invoice-btn').onclick = () => {
    actionToRun = () => submitInvoice(form, refreshAll, 'ISSUED');
    openInvoiceActionModal();
  };
  form.querySelector('#hold-invoice-btn').onclick = () => {
    actionToRun = () => submitInvoice(form, refreshAll, 'HOLD');
    openInvoiceActionModal();
  };
}

function renderInvoiceFormOptions(form) {
  const products = query('SELECT id,name,sku,category,price,quantity FROM products ORDER BY name');
  const customers = query('SELECT id,name,first_name,last_name FROM customers ORDER BY id DESC');
  form._allProducts = products;

  form.elements.customer_id.innerHTML = `<option value="">Walking Customer</option>${customers.map(c => `<option value="${c.id}">${escapeHtml(customerLabel(c))}</option>`).join('')}`;
  form.elements.product_id.innerHTML = products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku || '-')}) - Stock:${p.quantity}</option>`).join('');
  applyProductSelection(form);
}

function filterProducts(form) {
  const q = String(form.elements.product_search.value || '').toLowerCase().trim();
  const products = form._allProducts || [];
  const filtered = products.filter(p => (`${p.name} ${p.sku || ''} ${p.category || ''}`).toLowerCase().includes(q));
  form.elements.product_id.innerHTML = filtered.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku || '-')}) - Stock:${p.quantity}</option>`).join('');
  applyProductSelection(form);
}

function applyProductSelection(form) {
  const pid = +form.elements.product_id.value;
  const product = query('SELECT * FROM products WHERE id=?', [pid])[0];
  if (!product) return;
  form.elements.product_category.value = product.category || '';
  if (!form.elements.unit_price.value || +form.elements.unit_price.value <= 0) form.elements.unit_price.value = Number(product.price || 0).toFixed(2);
  recalcInvoicePreview(form);
}

function recalcInvoicePreview(form) {
  const pid = +form.elements.product_id.value;
  const product = query('SELECT * FROM products WHERE id=?', [pid])[0];
  if (!product) return;

  const unitPrice = +form.elements.unit_price.value || 0;
  const qty = Math.max(1, +form.elements.qty.value || 1);
  const lineGross = unitPrice * qty;
  const productDiscount = computeAdjustment(lineGross, +form.elements.product_discount_value.value || 0, form.elements.product_discount_type.value);
  const lineNet = Math.max(0, lineGross - productDiscount);

  const invoiceDiscount = computeAdjustment(lineNet, +form.elements.invoice_discount_value.value || 0, form.elements.invoice_discount_type.value);
  const taxable = Math.max(0, lineNet - invoiceDiscount);
  const tax = computeAdjustment(taxable, +form.elements.tax_value.value || 0, form.elements.tax_type.value);
  const total = Math.max(0, taxable + tax);

  const costTotal = (+product.cost || 0) * qty;
  const profit = total - costTotal;

  const paid = +form.elements.paid_amount.value || 0;
  const returnAmount = paid > total ? paid - total : 0;
  const dueAmount = paid < total ? total - paid : 0;

  form.elements.subtotal.value = lineNet.toFixed(2);
  form.elements.total.value = total.toFixed(2);
  form.elements.profit.value = profit.toFixed(2);
  form.elements.return_amount.value = returnAmount.toFixed(2);
  form.elements.due_amount.value = dueAmount.toFixed(2);
}

function submitInvoice(form, refreshAll, status) {
  recalcInvoicePreview(form);

  const pid = +form.elements.product_id.value;
  const product = query('SELECT * FROM products WHERE id=?', [pid])[0];
  if (!product) return toast('Select a valid product');

  const qty = Math.max(1, +form.elements.qty.value || 1);
  const total = +form.elements.total.value || 0;
  const paid = +form.elements.paid_amount.value || 0;
  const due = +form.elements.due_amount.value || 0;
  const customerId = form.elements.customer_id.value ? +form.elements.customer_id.value : null;

  if (status === 'ISSUED' && qty > +product.quantity) return toast('Insufficient stock');
  if (due > 0 && !customerId && status === 'ISSUED') return toast('Customer required when due amount exists');

  const nowIso = new Date().toISOString();
  const subtotal = +form.elements.subtotal.value || 0;
  const discount = computeAdjustment(subtotal, +form.elements.invoice_discount_value.value || 0, form.elements.invoice_discount_type.value);
  const tax = computeAdjustment(Math.max(0, subtotal - discount), +form.elements.tax_value.value || 0, form.elements.tax_type.value);
  const unitPrice = +form.elements.unit_price.value || 0;
  const lineGross = unitPrice * qty;
  const lineDiscount = computeAdjustment(lineGross, +form.elements.product_discount_value.value || 0, form.elements.product_discount_type.value);
  const lineTotal = Math.max(0, lineGross - lineDiscount);
  const lineProfit = lineTotal - ((+product.cost || 0) * qty);
  const paymentType = form.elements.payment_type.value;
  const profit = +form.elements.profit.value || 0;

  try {
    run(`INSERT INTO invoices(customer_id,status,created_at,subtotal,discount,tax,total,paid_amount,return_amount,due_amount,payment_type,profit)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [customerId, status, nowIso, subtotal, discount + lineDiscount, tax, total, paid, +form.elements.return_amount.value || 0, due, paymentType, profit]);

    const invoiceId = query('SELECT last_insert_rowid() id')[0].id;
    run(`INSERT INTO invoice_items(invoice_id,product_id,quantity,unit_price,discount,total,profit)
         VALUES (?,?,?,?,?,?,?)`, [invoiceId, pid, qty, unitPrice, lineDiscount, lineTotal, lineProfit]);

    if (status === 'ISSUED') {
      run('UPDATE products SET quantity = quantity - ? WHERE id=?', [qty, pid]);
      if (customerId) {
        run('UPDATE customers SET total_purchases = total_purchases + ?, due_amount = due_amount + ? WHERE id=?', [total, due, customerId]);
      }
    }

    toast(status === 'HOLD' ? 'Invoice saved as HOLD' : 'Invoice issued');
    form.reset();
    renderInvoiceFormOptions(form);
    recalcInvoicePreview(form);
    refreshAll();
    renderInvoices(refreshAll);

    if (status === 'ISSUED') showPrintableInvoice(invoiceId);
  } catch (error) {
    toast(error.message || 'Failed to save invoice');
  }
}

export function renderInvoices(refreshAll) {
  const invoices = query(`SELECT i.*, c.name, c.first_name, c.last_name
                          FROM invoices i
                          LEFT JOIN customers c ON c.id=i.customer_id
                          ORDER BY i.id DESC`);
  const el = document.getElementById('invoices-table');
  el.innerHTML = `
    <div class="cards-header">Invoices (${invoices.length})</div>
    <div class="invoice-grid">
      ${invoices.map(inv => invoiceCard(inv)).join('') || '<div class="muted-text">No invoices found.</div>'}
    </div>
  `;

  el.querySelectorAll('[data-view-invoice]').forEach(btn => btn.onclick = () => showPrintableInvoice(+btn.dataset.viewInvoice));
  el.querySelectorAll('[data-print-invoice]').forEach(btn => btn.onclick = () => printInvoice(+btn.dataset.printInvoice));
  el.querySelectorAll('[data-del-invoice]').forEach(btn => btn.onclick = () => {
    if (!confirm('Delete this invoice?')) return;
    try {
      run('DELETE FROM invoice_items WHERE invoice_id=?', [+btn.dataset.delInvoice]);
      run('DELETE FROM invoices WHERE id=?', [+btn.dataset.delInvoice]);
      toast('Invoice deleted');
      refreshAll();
      renderInvoices(refreshAll);
    } catch (error) {
      toast(error.message || 'Delete failed');
    }
  });
}

function invoiceCard(inv) {
  const statusClass = inv.status === 'HOLD' ? 'low' : (inv.due_amount > 0 ? 'out' : 'ok');
  const label = inv.status === 'HOLD' ? 'Held' : (inv.due_amount > 0 ? 'Due' : (inv.paid_amount > 0 && inv.due_amount > 0 ? 'Partial' : 'Paid'));
  return `
    <article class="invoice-card">
      <h3>Invoice #${inv.id}</h3>
      <p class="muted-text">${escapeHtml(customerName(inv) || 'Walking Customer')}</p>
      <p class="muted-text">${new Date(inv.created_at).toLocaleString()}</p>
      <p>Total: <strong>${fmtCurrency(inv.total)}</strong></p>
      <p>Profit: ${fmtCurrency(inv.profit)}</p>
      <span class="tag ${statusClass}">${label}</span>
      <div class="action-group card-actions">
        <button class="ghost-btn edit-btn" data-view-invoice="${inv.id}">View</button>
        <button class="ghost-btn" data-print-invoice="${inv.id}">Print</button>
        <button class="ghost-btn danger-btn" data-del-invoice="${inv.id}">Delete</button>
      </div>
    </article>
  `;
}

function openInvoiceActionModal() {
  let modal = document.getElementById('invoice-action-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'invoice-action-modal';
    modal.className = 'confirm-modal';
    modal.innerHTML = `
      <div class="confirm-modal-content">
        <h3>Invoice Actions</h3>
        <div class="action-group">
          <button class="btn" data-modal-act="print">🖨️ Print Now</button>
          <button class="ghost-btn" data-modal-act="save">💾 Save Only</button>
          <button class="ghost-btn" data-modal-act="hold">📌 Hold</button>
          <button class="ghost-btn danger-btn" data-modal-act="cancel">❌ Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.add('show');
  modal.querySelectorAll('[data-modal-act]').forEach(btn => btn.onclick = () => {
    const act = btn.dataset.modalAct;
    modal.classList.remove('show');
    if (act === 'cancel') return;
    if (act === 'hold') return actionToRun && actionToRun('HOLD');
    if (actionToRun) actionToRun('ISSUED');
  });
}

function showPrintableInvoice(invoiceId) {
  const inv = query('SELECT * FROM invoices WHERE id=?', [invoiceId])[0];
  if (!inv) return;
  const items = query('SELECT ii.*, p.name FROM invoice_items ii LEFT JOIN products p ON p.id=ii.product_id WHERE invoice_id=?', [invoiceId]);
  const customer = inv.customer_id ? query('SELECT * FROM customers WHERE id=?', [inv.customer_id])[0] : null;
  const html = printableHtml(inv, items, customer);
  const container = document.getElementById('print-preview-container') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-preview-container' }));
  container.innerHTML = html;
}

function printInvoice(invoiceId) {
  const inv = query('SELECT * FROM invoices WHERE id=?', [invoiceId])[0];
  if (!inv) return;
  const items = query('SELECT ii.*, p.name FROM invoice_items ii LEFT JOIN products p ON p.id=ii.product_id WHERE invoice_id=?', [invoiceId]);
  const customer = inv.customer_id ? query('SELECT * FROM customers WHERE id=?', [inv.customer_id])[0] : null;
  const w = window.open('', '_blank');
  w.document.write(printableHtml(inv, items, customer, true));
  w.document.close();
}

function printableHtml(inv, items, customer, autoPrint = false) {
  const customerNameText = customer ? customerName(customer) : 'Walking Customer';
  const rows = items.map(i => `<tr><td>${escapeHtml(i.name || 'Item')}</td><td>${i.quantity}</td><td>${fmtCurrency(i.unit_price)}</td><td>${fmtCurrency(i.discount)}</td><td>${fmtCurrency(i.total)}</td></tr>`).join('');
  return `
    <div class="print-invoice">
      <h2>POS Suite</h2>
      <p>Invoice #${inv.id}</p>
      <p>Date & Time: ${new Date(inv.created_at).toLocaleString()}</p>
      <p>Customer: ${escapeHtml(customerNameText)}</p>
      <p>Payment Type: ${escapeHtml(inv.payment_type || 'Cash')}</p>
      <table class="table"><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Subtotal: ${fmtCurrency(inv.subtotal)}</p>
      <p>Tax: ${fmtCurrency(inv.tax)}</p>
      <p>Discount: ${fmtCurrency(inv.discount)}</p>
      <p><strong>Grand Total: ${fmtCurrency(inv.total)}</strong></p>
      <p>Paid Amount: ${fmtCurrency(inv.paid_amount)}</p>
      <p>Return Amount: ${fmtCurrency(inv.return_amount)}</p>
      <p>Due Amount: ${fmtCurrency(inv.due_amount)}</p>
    </div>
    ${autoPrint ? '<script>window.print()</script>' : ''}
  `;
}

function computeAdjustment(base, value, type) {
  const v = Number(value || 0);
  if (v <= 0) return 0;
  if (type === 'percent') return (base * v) / 100;
  return v;
}

function customerLabel(c) {
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || `Customer #${c.id}`;
}

function customerName(c) {
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || '';
}

function escapeHtml(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
