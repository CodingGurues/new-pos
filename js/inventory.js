import { query, run } from './db.js';
import { fmtCurrency, toast } from './ui.js';

let editingProductId = null;
let editingImageData = null;

export function initInventory(refreshAll) {
  const form = document.getElementById('product-form');

  form.innerHTML = `
    <div class="form-mode" id="product-form-mode">Add New Product</div>
    <div class="field"><label>Product Name *</label><input name="name" placeholder="Product Name" required /></div>
    <div class="field"><label>Product Code / SKU *</label><input name="sku" placeholder="SKU" required /></div>
    <div class="field"><label>Category *</label><input name="category" placeholder="Category" required /></div>
    <div class="field"><label>Cost Price *</label><input name="cost" type="number" step="0.01" min="0" placeholder="Cost Price" required /></div>
    <div class="field"><label>Sale Price *</label><input name="price" type="number" step="0.01" min="0" placeholder="Sale Price" required /></div>
    <div class="field"><label>Wholesale Sale Price</label><input name="wholesale_price" type="number" step="0.01" min="0" placeholder="Wholesale Sale Price" /></div>
    <div class="field"><label>Quantity *</label><input name="quantity" type="number" min="0" placeholder="Quantity" required /></div>
    <div class="field"><label>Vendor *</label><select name="vendor" required></select></div>
    <div class="field"><label>Low Stock Threshold *</label><input name="threshold" type="number" min="0" placeholder="Low Stock Threshold" required /></div>
    <div class="field"><label>Box Size (optional)</label><input name="box_size" type="number" min="1" placeholder="Box Size" /></div>

    <div class="file-field-row">
      <label class="muted-label">Product Image (optional)</label>
      <input id="product-image" name="image" type="file" accept="image/*" />
      <img id="image-preview" class="image-preview hidden" alt="Product preview" />
    </div>

    <div class="form-actions-row">
      <button class="btn" id="save-product-btn" type="submit">Save Product</button>
      <button class="ghost-btn hidden" id="cancel-edit-btn" type="button">Cancel Edit</button>
    </div>
  `;

  syncVendorSelectOptions();

  const imageInput = form.querySelector('#product-image');
  const imagePreview = form.querySelector('#image-preview');

  imageInput.onchange = async () => {
    const file = imageInput.files?.[0];
    if (!file) {
      if (!editingImageData) {
        imagePreview.classList.add('hidden');
        imagePreview.removeAttribute('src');
      }
      return;
    }
    imagePreview.src = await fileToDataUrl(file);
    imagePreview.classList.remove('hidden');
  };

  form.querySelector('#cancel-edit-btn').onclick = () => {
    resetFormState(form);
    toast('Edit cancelled');
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));

    if (!d.sku?.trim() || !d.name?.trim() || !d.cost || !d.price || !d.vendor) {
      toast('Required: Product Code, Product Name, Cost Price, Sale Price, Vendor');
      return;
    }

    const duplicate = query(
      'SELECT id FROM products WHERE sku = ? AND (? IS NULL OR id != ?) LIMIT 1',
      [d.sku.trim(), editingProductId, editingProductId]
    )[0];
    if (duplicate) {
      toast('SKU already exists');
      return;
    }

    let imageData = editingImageData;
    const imageFile = imageInput.files?.[0];
    if (imageFile) imageData = await fileToDataUrl(imageFile);

    const values = [
      d.name.trim(),
      d.sku.trim(),
      d.category,
      +d.cost,
      +d.price,
      +(d.wholesale_price || d.price),
      d.box_size ? +d.box_size : null,
      imageData,
      +d.quantity,
      d.vendor,
      +d.threshold
    ];

    try {
      if (editingProductId) {
        run(
          `UPDATE products
           SET name=?, sku=?, category=?, cost=?, price=?, wholesale_price=?, box_size=?, image_data=?, quantity=?, vendor=?, threshold=?
           WHERE id=?`,
          [...values, editingProductId]
        );
        toast('Product updated');
      } else {
        run(
          `INSERT INTO products(name,sku,category,cost,price,wholesale_price,box_size,image_data,quantity,vendor,threshold)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          values
        );
        toast('Product added');
      }

      resetFormState(form);
      refreshAll();
    } catch (error) {
      toast(error.message || 'Failed to save product');
    }
  };

  renderInventory(refreshAll);
  renderAddStockPanel(refreshAll);
}

export function renderInventory(refreshAll) {
  syncVendorSelectOptions();
  const rows = query('SELECT * FROM products ORDER BY id DESC');
  const host = document.getElementById('inventory-table');

  host.innerHTML = `
    <div class="products-grid">
      ${rows.map(r => `
        <article class="product-card">
          <div class="product-card-top">
            ${r.image_data ? `<img src="${r.image_data}" class="thumb large" alt="${r.name}" />` : '<div class="thumb placeholder">No Image</div>'}
            <div>
              <h3>${escapeHtml(r.name || '')}</h3>
              <p class="muted-text">SKU: ${escapeHtml(r.sku || '-')}</p>
            </div>
          </div>
          <div class="product-meta">
            <p><strong>Qty:</strong> ${r.quantity ?? 0}</p>
            <p><strong>Cost:</strong> ${fmtCurrency(r.cost)}</p>
            <p><strong>Sale:</strong> ${fmtCurrency(r.price)}</p>
            <p><strong>Wholesale:</strong> ${fmtCurrency(r.wholesale_price)}</p>
            <p><strong>Vendor:</strong> ${escapeHtml(r.vendor || '-')}</p>
            <p><strong>Status:</strong> ${statusTag(r.quantity, r.threshold)}</p>
          </div>
          <div class="action-group card-actions">
            <button class="ghost-btn edit-btn" data-edit-prod="${r.id}">Edit</button>
            <button class="ghost-btn danger-btn" data-del-prod="${r.id}">Delete</button>
          </div>
        </article>
      `).join('') || '<p>No products found.</p>'}
    </div>
    <div id="add-stock-panel" class="stock-entry-wrap"></div>
  `;

  document.querySelectorAll('[data-edit-prod]').forEach(btn => {
    btn.onclick = () => openEditProduct(+btn.dataset.editProd);
  });

  document.querySelectorAll('[data-del-prod]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Delete this product permanently?')) return;
      try {
        const id = +btn.dataset.delProd;
        run('DELETE FROM stock_entries WHERE product_id=?', [id]);
        run('DELETE FROM vendor_purchases WHERE product_id=?', [id]);
        run('DELETE FROM products WHERE id=?', [id]);
        if (editingProductId === id) {
          const form = document.getElementById('product-form');
          resetFormState(form);
        }
        toast('Product deleted');
        refreshAll();
      } catch (error) {
        toast(error.message || 'Delete failed');
      }
    };
  });

  renderAddStockPanel(refreshAll);
}

function renderAddStockPanel(refreshAll) {
  const host = document.getElementById('add-stock-panel');
  if (!host) return;

  const products = query('SELECT id,name,sku,quantity FROM products ORDER BY name');
  host.innerHTML = `
    <h3>Add New Stock with Different Cost/Sale Price</h3>
    <form id="stock-entry-form" class="grid-form stock-entry-form">
      <div class="field">
        <label>Product *</label>
        <select name="product_id" required>
          <option value="">Select Product</option>
          ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku)}) — Qty: ${p.quantity}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Added Quantity *</label><input name="qty" type="number" min="1" required placeholder="Add Quantity" /></div>
      <div class="field"><label>New Cost Price *</label><input name="cost_price" type="number" min="0" step="0.01" required placeholder="New Cost Price" /></div>
      <div class="field"><label>New Sale Price *</label><input name="sale_price" type="number" min="0" step="0.01" required placeholder="New Sale Price" /></div>
      <button class="btn" type="submit">Update Stock Now</button>
    </form>
  `;

  const form = host.querySelector('#stock-entry-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));

    try {
      run('UPDATE products SET quantity = quantity + ?, cost = ?, price = ? WHERE id=?', [+d.qty, +d.cost_price, +d.sale_price, +d.product_id]);
      run('INSERT INTO stock_entries(product_id,qty,cost_price,sale_price,created_at) VALUES (?,?,?,?,datetime("now"))', [+d.product_id, +d.qty, +d.cost_price, +d.sale_price]);
      toast('Stock quantity and pricing updated in real time');
      refreshAll();
    } catch (error) {
      toast(error.message || 'Failed to update stock');
    }
  };
}

function openEditProduct(productId) {
  const form = document.getElementById('product-form');
  const p = query('SELECT * FROM products WHERE id=?', [productId])[0];
  if (!p || !form) return;

  editingProductId = productId;
  editingImageData = p.image_data || null;

  form.elements.name.value = p.name || '';
  form.elements.sku.value = p.sku || '';
  form.elements.category.value = p.category || '';
  form.elements.cost.value = p.cost ?? '';
  form.elements.price.value = p.price ?? '';
  form.elements.wholesale_price.value = p.wholesale_price ?? '';
  form.elements.quantity.value = p.quantity ?? '';
  form.elements.vendor.value = p.vendor || '';
  form.elements.threshold.value = p.threshold ?? '';
  form.elements.box_size.value = p.box_size ?? '';
  form.elements.image.value = '';

  const imagePreview = form.querySelector('#image-preview');
  if (editingImageData) {
    imagePreview.src = editingImageData;
    imagePreview.classList.remove('hidden');
  } else {
    imagePreview.classList.add('hidden');
    imagePreview.removeAttribute('src');
  }

  form.querySelector('#save-product-btn').textContent = 'Update Product';
  form.querySelector('#product-form-mode').textContent = `Editing Product #${productId}`;
  form.querySelector('#cancel-edit-btn').classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetFormState(form) {
  editingProductId = null;
  editingImageData = null;

  form.reset();
  syncVendorSelectOptions();
  const imagePreview = form.querySelector('#image-preview');
  imagePreview.classList.add('hidden');
  imagePreview.removeAttribute('src');
  form.querySelector('#save-product-btn').textContent = 'Save Product';
  form.querySelector('#product-form-mode').textContent = 'Add New Product';
  form.querySelector('#cancel-edit-btn').classList.add('hidden');
}

function syncVendorSelectOptions() {
  const vendorSelect = document.querySelector('#product-form select[name="vendor"]');
  if (!vendorSelect) return;
  const current = vendorSelect.value;
  const vendors = query('SELECT name FROM vendors ORDER BY name');
  vendorSelect.innerHTML = `<option value="">Select Vendor *</option>${vendors.map(v => `<option value="${v.name}">${v.name}</option>`).join('')}`;
  if (current && [...vendorSelect.options].some(opt => opt.value === current)) vendorSelect.value = current;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function escapeHtml(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const statusTag = (q, t) => q <= 0 ? '<span class="tag out">Out of Stock</span>' : q <= t ? '<span class="tag low">Low Stock</span>' : '<span class="tag ok">In Stock</span>';
