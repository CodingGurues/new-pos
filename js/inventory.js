import { query, run } from './db.js';
import { table, fmtCurrency, toast } from './ui.js';

export function initInventory(refreshAll) {
  const form = document.getElementById('product-form');
  form.innerHTML = `
    <input name="name" placeholder="Product Name" required />
    <input name="sku" placeholder="SKU" required />
    <input name="category" placeholder="Category" required />
    <input name="cost" type="number" step="0.01" placeholder="Cost Price" required />
    <input name="price" type="number" step="0.01" placeholder="Sale Price" required />
    <input name="quantity" type="number" placeholder="Quantity" required />
    <input name="vendor" placeholder="Vendor" required />
    <input name="threshold" type="number" placeholder="Low Stock Threshold" required />
    <button class="btn" type="submit">Save Product</button>
  `;
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    run('INSERT INTO products(name,sku,category,cost,price,quantity,vendor,threshold) VALUES (?,?,?,?,?,?,?,?)',
      [d.name, d.sku, d.category, +d.cost, +d.price, +d.quantity, d.vendor, +d.threshold]);
    form.reset(); toast('Product added'); refreshAll();
  };
  renderInventory(refreshAll);
}

export function renderInventory(refreshAll) {
  const rows = query('SELECT * FROM products ORDER BY id DESC');
  document.getElementById('inventory-table').innerHTML = table([
    { key: 'name', label: 'Name' }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' },
    { key: 'cost', label: 'Cost', render: v => fmtCurrency(v) }, { key: 'price', label: 'Sale', render: v => fmtCurrency(v) },
    { key: 'quantity', label: 'Qty' }, { key: 'vendor', label: 'Vendor' },
    { key: 'status', label: 'Status', render: (_, r) => statusTag(r.quantity, r.threshold) },
    { key: 'id', label: 'Action', render: v => `<button class="ghost-btn" data-del-prod="${v}">Delete</button>` }
  ], rows);
  document.querySelectorAll('[data-del-prod]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Delete product?')) return;
      run('DELETE FROM products WHERE id=?', [+btn.dataset.delProd]);
      toast('Product deleted'); refreshAll();
    };
  });
}

const statusTag = (q, t) => q <= 0 ? '<span class="tag out">Out</span>' : q <= t ? '<span class="tag low">Low</span>' : '<span class="tag ok">In Stock</span>';
