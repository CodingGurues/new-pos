import { query, run } from './db.js';
import { table, fmtCurrency, toast } from './ui.js';

export function initCustomers(refreshAll) {
  const form = document.getElementById('customer-form');
  form.innerHTML = `
    <input name="name" placeholder="Name" required />
    <input name="phone" placeholder="Phone" required />
    <input name="email" placeholder="Email" />
    <input name="address" placeholder="Address" />
    <button class="btn" type="submit">Save Customer</button>
  `;
  form.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    run('INSERT INTO customers(name,phone,email,address) VALUES (?,?,?,?)', [d.name, d.phone, d.email, d.address]);
    form.reset(); toast('Customer added'); refreshAll();
  };
  renderCustomers(refreshAll);
}

export function renderCustomers(refreshAll) {
  const rows = query('SELECT * FROM customers ORDER BY id DESC');
  document.getElementById('customers-table').innerHTML = table([
    { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
    { key: 'address', label: 'Address' }, { key: 'total_purchases', label: 'Total Purchases', render: v => fmtCurrency(v) },
    { key: 'due_amount', label: 'Due', render: v => fmtCurrency(v) },
    { key: 'id', label: 'Action', render: v => `<button class="ghost-btn" data-del-cus="${v}">Delete</button>` }
  ], rows);
  document.querySelectorAll('[data-del-cus]').forEach(btn => btn.onclick = () => {
    run('DELETE FROM customers WHERE id=?', [+btn.dataset.delCus]);
    toast('Customer deleted'); refreshAll();
  });
}
