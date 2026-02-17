import { initDB, exportDB, importDB } from './db.js';
import { renderDashboard } from './dashboard.js';
import { initInventory, renderInventory } from './inventory.js';
import { initCustomers, renderCustomers } from './customers.js';
import { initInvoices, renderInvoices } from './invoices.js';
import { initVendors, renderVendors } from './vendors.js';
import { toast } from './ui.js';

await initDB();

const refreshAll = () => {
  renderDashboard();
  renderInventory(refreshAll);
  renderCustomers(refreshAll);
  renderInvoices();
  renderVendors(refreshAll);
};

initInventory(refreshAll);
initCustomers(refreshAll);
initInvoices(refreshAll);
initVendors(refreshAll);
refreshAll();

const nav = document.getElementById('sidebar-nav');
nav.querySelectorAll('.nav-item').forEach(btn => btn.onclick = () => {
  nav.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(btn.dataset.view).classList.add('active');
});

document.getElementById('theme-toggle').onclick = () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
};
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');

document.getElementById('export-db').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(exportDB());
  a.download = 'pos-backup.sqlite';
  a.click();
  toast('Backup exported');
};

document.getElementById('import-db').onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  importDB(await f.arrayBuffer());
  toast('Database imported');
  refreshAll();
};
