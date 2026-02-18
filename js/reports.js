import { query } from './db.js';

let salesChart;
let profitChart;

export function renderReports() {
  const rows = query(`SELECT substr(created_at,1,10) day, SUM(total) sales, SUM(profit) profit FROM invoices GROUP BY day ORDER BY day`);
  const labels = rows.map(r => r.day);
  const sales = rows.map(r => r.sales);
  const profit = rows.map(r => r.profit);

  if (salesChart) salesChart.destroy();
  if (profitChart) profitChart.destroy();

  salesChart = new Chart(document.getElementById('salesChart'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Sales', data: sales, borderColor: '#5d5fef', fill: true, backgroundColor: 'rgba(93,95,239,0.15)' }] }
  });
  profitChart = new Chart(document.getElementById('profitChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Profit', data: profit, backgroundColor: '#16a34a' }] }
  });
}
