import { query, run } from './db.js';
import { table, fmtCurrency, toast } from './ui.js';

export function initInventory(refreshAll) {
  const form = document.getElementById('product-form');
  const vendorOptions = getVendorOptions();

  form.innerHTML = `
    <input name="name" placeholder="Product Name *" required />
    <input name="sku" placeholder="Product Code / SKU *" required />
    <input name="category" placeholder="Category" required />
    <input name="cost" type="number" step="0.01" min="0" placeholder="Cost Price *" required />
    <input name="price" type="number" step="0.01" min="0" placeholder="Sale Price *" required />
    <input name="wholesale_price" type="number" step="0.01" min="0" placeholder="Wholesale Sale Price" />
    <input name="quantity" type="number" min="0" placeholder="Quantity" required />
    <select name="vendor" required>
      <option value="">Select Vendor *</option>
      ${vendorOptions}
    </select>
    <input name="threshold" type="number" min="0" placeholder="Low Stock Threshold" required />

    <label class="inline-switch">
      <input type="checkbox" id="box-details-toggle" />
      Add Box Pricing Details (optional)
    </label>

    <div id="box-details" class="conditional-fields hidden">
      <input name="box_purchase_price" type="number" step="0.01" min="0" placeholder="Box Purchase Price" />
      <input name="box_sale_price" type="number" step="0.01" min="0" placeholder="Box Sale Price" />
      <input name="box_size" type="number" min="1" placeholder="Box Size (Qty in one box)" />
    </div>

    <div class="file-field-row">
      <label class="muted-label">Product Image (optional)</label>
      <input id="product-image" name="image" type="file" accept="image/*" />
      <img id="image-preview" class="image-preview hidden" alt="Product preview" />
    </div>

    <button class="btn" type="submit">Save Product</button>
  `;

  const boxToggle = form.querySelector('#box-details-toggle');
  const boxDetails = form.querySelector('#box-details');
  const imageInput = form.querySelector('#product-image');
  const imagePreview = form.querySelector('#image-preview');

  boxToggle.onchange = () => boxDetails.classList.toggle('hidden', !boxToggle.checked);
  imageInput.onchange = async () => {
    const file = imageInput.files?.[0];
    if (!file) {
      imagePreview.classList.add('hidden');
      imagePreview.removeAttribute('src');
      return;
    }
    imagePreview.src = await fileToDataUrl(file);
    imagePreview.classList.remove('hidden');
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));

    if (!d.sku?.trim() || !d.name?.trim() || !d.cost || !d.price) {
      toast('Please fill required fields: Product Code, Name, Cost Price, Sale Price');
      return;
    }

    let imageData = null;
    const imageFile = imageInput.files?.[0];
    if (imageFile) imageData = await fileToDataUrl(imageFile);

    run(
      `INSERT INTO products(name,sku,category,cost,price,wholesale_price,box_purchase_price,box_sale_price,box_size,image_data,quantity,vendor,threshold)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.name.trim(),
        d.sku.trim(),
        d.category,
        +d.cost,
        +d.price,
        +(d.wholesale_price || d.price),
        boxToggle.checked && d.box_purchase_price ? +d.box_purchase_price : null,
        boxToggle.checked && d.box_sale_price ? +d.box_sale_price : null,
        boxToggle.checked && d.box_size ? +d.box_size : null,
        imageData,
        +d.quantity,
        d.vendor,
        +d.threshold
      ]
    );

    form.reset();
    boxDetails.classList.add('hidden');
    imagePreview.classList.add('hidden');
    imagePreview.removeAttribute('src');
    toast('Product added');
    refreshAll();
    renderAddStockPanel(refreshAll);
  };

  renderInventory(refreshAll);
  renderAddStockPanel(refreshAll);
}

export function renderInventory(refreshAll) {
  syncVendorSelectOptions();
  const rows = query('SELECT * FROM products ORDER BY id DESC');
  document.getElementById('inventory-table').innerHTML = `
    ${table([
      { key: 'image_data', label: 'Image', render: v => v ? `<img src="${v}" class="thumb" alt="product" />` : '—' },
      { key: 'name', label: 'Name' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'cost', label: 'Cost', render: v => fmtCurrency(v) },
      { key: 'price', label: 'Sale', render: v => fmtCurrency(v) },
      { key: 'wholesale_price', label: 'Wholesale', render: v => fmtCurrency(v) },
      { key: 'box_size', label: 'Box Info', render: (_, r) => r.box_size ? `${r.box_size} / box @ ${fmtCurrency(r.box_sale_price)}` : '—' },
      { key: 'quantity', label: 'Qty' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'status', label: 'Status', render: (_, r) => statusTag(r.quantity, r.threshold) },
      { key: 'id', label: 'Action', render: v => `<button class="ghost-btn" data-del-prod="${v}">Delete</button>` }
    ], rows)}
    <div id="add-stock-panel" class="stock-entry-wrap"></div>
  `;

  document.querySelectorAll('[data-del-prod]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Delete product?')) return;
      run('DELETE FROM products WHERE id=?', [+btn.dataset.delProd]);
      toast('Product deleted');
      refreshAll();
      renderAddStockPanel(refreshAll);
    };
  });

  renderAddStockPanel(refreshAll);
}

function renderAddStockPanel(refreshAll) {
  const host = document.getElementById('add-stock-panel');
  if (!host) return;

  const products = query('SELECT id,name,sku,cost,price,quantity FROM products ORDER BY name');
  host.innerHTML = `
    <h3>Add New Stock (Different Cost / Sale Price)</h3>
    <form id="stock-entry-form" class="grid-form stock-entry-form">
      <select name="product_id" required>
        <option value="">Select Product</option>
        ${products.map(p => `<option value="${p.id}">${p.name} (${p.sku}) — Current Qty: ${p.quantity}</option>`).join('')}
      </select>
      <input name="qty" type="number" min="1" required placeholder="Add Quantity" />
      <input name="cost_price" type="number" min="0" step="0.01" required placeholder="New Cost Price" />
      <input name="sale_price" type="number" min="0" step="0.01" required placeholder="New Sale Price" />
      <button class="btn" type="submit">Add Stock Entry</button>
    </form>
  `;

  const form = host.querySelector('#stock-entry-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    if (!d.product_id || !d.qty || !d.cost_price || !d.sale_price) {
      toast('Please fill product, quantity, cost and sale values');
      return;
    }

    run('UPDATE products SET quantity = quantity + ?, cost = ?, price = ? WHERE id=?', [+d.qty, +d.cost_price, +d.sale_price, +d.product_id]);
    run('INSERT INTO stock_entries(product_id,qty,cost_price,sale_price,created_at) VALUES (?,?,?,?,datetime("now"))', [+d.product_id, +d.qty, +d.cost_price, +d.sale_price]);
    toast('Stock updated in real time');
    refreshAll();
  };
}

function syncVendorSelectOptions() {
  const vendorSelect = document.querySelector('#product-form select[name="vendor"]');
  if (!vendorSelect) return;
  const current = vendorSelect.value;
  vendorSelect.innerHTML = `<option value="">Select Vendor *</option>${getVendorOptions()}`;
  if (current) vendorSelect.value = current;
}

function getVendorOptions() {
  const vendors = query('SELECT name FROM vendors ORDER BY name');
  return vendors.map(v => `<option value="${v.name}">${v.name}</option>`).join('');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const statusTag = (q, t) => q <= 0 ? '<span class="tag out">Out</span>' : q <= t ? '<span class="tag low">Low</span>' : '<span class="tag ok">In Stock</span>';
