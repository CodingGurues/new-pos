import { query, run } from './db.js?v=stockfix8';
import { table, fmtCurrency, toast } from './ui.js?v=stockfix8';

export function initVendors(refreshAll) {
  const form = document.getElementById('vendor-form');
  form.innerHTML = `
    <input name="name" placeholder="Vendor Name" required />
    <input name="phone" placeholder="Phone" />
    <input name="address" placeholder="Address" />
    <input name="product_id" type="number" placeholder="Product ID to restock" />
    <input name="qty" type="number" placeholder="Qty Purchased" />
    <input name="unit_cost" type="number" step="0.01" placeholder="Unit Cost" />
    <button class="btn" type="submit">Save Vendor / Purchase</button>
  `;
  form.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    try {
      run('INSERT INTO vendors(name,phone,address,total_purchase) VALUES (?,?,?,0)', [d.name, d.phone, d.address]);
      const vendorId = query('SELECT last_insert_rowid() id')[0].id;
      if (d.product_id && d.qty && d.unit_cost) {
        run('INSERT INTO vendor_purchases(vendor_id,product_id,qty,unit_cost,created_at) VALUES (?,?,?,?,datetime("now"))', [vendorId, +d.product_id, +d.qty, +d.unit_cost]);
        run('UPDATE products SET quantity = quantity + ? WHERE id=?', [+d.qty, +d.product_id]);
        run('UPDATE vendors SET total_purchase = total_purchase + ? WHERE id=?', [+d.qty * +d.unit_cost, vendorId]);
      }
      form.reset(); toast('Vendor saved'); refreshAll();
    } catch (error) {
      toast(error.message || 'Failed to save vendor');
    }
  };
  renderVendors(refreshAll);
}

export function renderVendors(refreshAll) {
  const rows = query('SELECT * FROM vendors ORDER BY id DESC');
  document.getElementById('vendors-table').innerHTML = table([
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' }, { key: 'total_purchase', label: 'Total Purchase', render: v => fmtCurrency(v) },
    { key: 'id2', label: 'History', render: (_, r) => `Purchases: ${query('SELECT COUNT(*) c FROM vendor_purchases WHERE vendor_id=?', [r.id])[0].c}` },
    { key: 'id', label: 'Action', render: v => `<button class="ghost-btn" data-del-vendor="${v}">Delete</button>` }
  ], rows);
  document.querySelectorAll('[data-del-vendor]').forEach(btn => btn.onclick = () => {
    run('DELETE FROM vendors WHERE id=?', [+btn.dataset.delVendor]);
    toast('Vendor deleted'); refreshAll();
  });
}
