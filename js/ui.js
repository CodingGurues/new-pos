export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

export function fmtCurrency(n) { return `$${Number(n || 0).toFixed(2)}`; }

export function table(columns, rows) {
  const head = columns.map(c => `<th>${c.label}</th>`).join('');
  const body = rows.map(r => `<tr>${columns.map(c => `<td>${c.render ? c.render(r[c.key], r) : (r[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<table class="table"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="99">No records.</td></tr>'}</tbody></table>`;
}
