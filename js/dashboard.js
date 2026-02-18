import { query } from './db.js';
import { fmtCurrency, table } from './ui.js';

export function renderDashboard() {
  const el = document.getElementById('dashboard');
  const stats = computeStats();
  el.innerHTML = `
    <div class="stats-grid">
      ${card('Total Sales', stats.totalSales)}
      ${card('Total Revenue', fmtCurrency(stats.revenue))}
      ${card('Total Profit', fmtCurrency(stats.profit))}
      ${card('Total Stock Items', stats.stockItems)}
      ${card('Low Stock Alerts', stats.lowStock)}
      ${card('Total Customers', stats.customers)}
      ${card('Total Vendors', stats.vendors)}
    </div>
    <div class="card"><h3>Recent Transactions</h3>${table([
      { key: 'id', label: 'Invoice #' },
      { key: 'created_at', label: 'Date' },
      { key: 'total', label: 'Total', render: v => fmtCurrency(v) },
      { key: 'profit', label: 'Profit', render: v => fmtCurrency(v) }
    ], stats.recent)}</div>
  `;
}

const card = (label, value) => `<article class="card stat-card"><h3>${label}</h3><p>${value}</p></article>`;

function computeStats() {
  const inv = query('SELECT * FROM invoices ORDER BY id DESC');
  return {
    totalSales: inv.length,
    revenue: inv.reduce((a, b) => a + b.total, 0),
    profit: inv.reduce((a, b) => a + b.profit, 0),
    stockItems: query('SELECT SUM(quantity) qty FROM products')[0]?.qty || 0,
    lowStock: query('SELECT COUNT(*) c FROM products WHERE quantity <= threshold')[0]?.c || 0,
    customers: query('SELECT COUNT(*) c FROM customers')[0]?.c || 0,
    vendors: query('SELECT COUNT(*) c FROM vendors')[0]?.c || 0,
    recent: inv.slice(0, 6)
  };
}
