import { initDB, exportDB, importDB } from './db.js?v=stockfix4';
import { renderDashboard } from './dashboard.js?v=stockfix4';
import { initInventory, renderInventory } from './inventory.js?v=stockfix4';
import { initCustomers, renderCustomers } from './customers.js?v=stockfix4';
import { initInvoices, renderInvoices } from './invoices.js?v=stockfix4';
import { initVendors, renderVendors } from './vendors.js?v=stockfix4';
import { toast } from './ui.js?v=stockfix4';

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
  const selectedView = document.getElementById(btn.dataset.view);
  selectedView.classList.add('active');
  if (window.innerWidth <= 900) {
    selectedView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
