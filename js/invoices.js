import { query, run } from './db.js?v=stockfix11';
import { table, fmtCurrency, toast } from './ui.js?v=stockfix11';

export function initInvoices(refreshAll) {
  const form = document.getElementById('invoice-form');
  renderInvoiceForm(form);
  form.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const product = query('SELECT * FROM products WHERE id=?', [+d.product_id])[0];
    if (!product || product.quantity < +d.qty) return toast('Insufficient stock');
    const subtotal = product.price * +d.qty;
    const costTotal = product.cost * +d.qty;
    const discount = +d.discount || 0;
    const tax = +d.tax || 0;
    const total = subtotal - discount + tax;
    const profit = total - costTotal;
    try {
      run('INSERT INTO invoices(customer_id,created_at,subtotal,discount,tax,total,profit,items_json) VALUES (?,?,?,?,?,?,?,?)',
        [+d.customer_id, new Date().toISOString(), subtotal, discount, tax, total, profit, JSON.stringify([{ product_id: product.id, name: product.name, qty: +d.qty, price: product.price }])]);
      run('UPDATE products SET quantity = quantity - ? WHERE id=?', [+d.qty, product.id]);
      run('UPDATE customers SET total_purchases = total_purchases + ? WHERE id=?', [total, +d.customer_id]);
      toast('Invoice saved');
      form.reset();
      renderInvoiceForm(form);
      refreshAll();
    } catch (error) {
      toast(error.message || 'Failed to save invoice');
    }
  };
  renderInvoices();
}

function renderInvoiceForm(form) {
  const products = query('SELECT id,name,quantity FROM products');
  const customers = query('SELECT id,name FROM customers');
  form.innerHTML = `
    <select name="customer_id" required>${customers.map(c => `<option value="${c.id}">${c.name}</option>`)}</select>
    <select name="product_id" required>${products.map(p => `<option value="${p.id}">${p.name} (Stock:${p.quantity})</option>`)}</select>
    <input name="qty" type="number" placeholder="Qty" required />
    <input name="discount" type="number" step="0.01" placeholder="Discount" value="0" />
    <input name="tax" type="number" step="0.01" placeholder="Tax" value="0" />
    <button class="btn" type="submit">Generate Invoice</button>
  `;
}

export function renderInvoices() {
  const rows = query('SELECT * FROM invoices ORDER BY id DESC');
  document.getElementById('invoices-table').innerHTML = table([
    { key: 'id', label: 'ID' }, { key: 'created_at', label: 'Date' }, { key: 'customer_id', label: 'Customer ID' },
    { key: 'subtotal', label: 'Subtotal', render: v => fmtCurrency(v) },
    { key: 'discount', label: 'Discount', render: v => fmtCurrency(v) },
    { key: 'tax', label: 'Tax', render: v => fmtCurrency(v) },
    { key: 'total', label: 'Total', render: v => fmtCurrency(v) },
    { key: 'profit', label: 'Profit', render: v => fmtCurrency(v) },
    { key: 'items_json', label: 'Print', render: v => `<button class="ghost-btn" data-print='${encodeURIComponent(v)}'>Print</button>` }
  ], rows);
  document.querySelectorAll('[data-print]').forEach(btn => btn.onclick = () => printInvoice(JSON.parse(decodeURIComponent(btn.dataset.print))));
}

function printInvoice(items) {
  const w = window.open('', '_blank');
  w.document.write(`<h2>Invoice</h2>${items.map(i => `<p>${i.name} x ${i.qty} = ${fmtCurrency(i.qty * i.price)}</p>`).join('')}<script>window.print()</script>`);
  w.document.close();
}
