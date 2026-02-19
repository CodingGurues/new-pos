import { query, run } from './db.js?v=stockfix13';
import { toast } from './ui.js?v=stockfix13';

const MAX_CUSTOMER_IMAGE_MB = 2;
const CUSTOMER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

let editingCustomerId = null;
let editingPictureData = null;

export function initCustomers(refreshAll) {
  const form = document.getElementById('customer-form');
  form.innerHTML = `
    <div class="form-mode" id="customer-form-mode">Add New Customer</div>
    <div class="field"><label>First Name *</label><input name="first_name" placeholder="First Name" required /></div>
    <div class="field"><label>Last Name *</label><input name="last_name" placeholder="Last Name" required /></div>
    <div class="field"><label>Phone *</label><input name="phone" placeholder="Phone" required /></div>

    <div class="field area-field">
      <label>Area</label>
      <div class="inline-input-action">
        <select name="area"></select>
        <button id="show-add-area-btn" class="ghost-btn" type="button">Add Area</button>
      </div>
      <div class="inline-input-action hidden" id="add-area-inline">
        <input name="new_area" placeholder="New Area" />
        <button id="add-area-btn" class="ghost-btn" type="button">Save Area</button>
      </div>
    </div>

    <div class="file-field-row">
      <label class="muted-label">Picture (optional, max ${MAX_CUSTOMER_IMAGE_MB}MB)</label>
      <input id="customer-picture" name="picture" type="file" accept="image/*" />
      <img id="customer-picture-preview" class="image-preview hidden" alt="Customer preview" />
    </div>

    <div class="form-actions-row">
      <button class="btn" id="save-customer-btn" type="submit">Save Customer</button>
      <button class="ghost-btn hidden" id="cancel-customer-edit-btn" type="button">Cancel Edit</button>
    </div>
  `;

  syncAreaSelectOptions();

  const pictureInput = form.querySelector('#customer-picture');
  const picturePreview = form.querySelector('#customer-picture-preview');

  pictureInput.onchange = async () => {
    const file = pictureInput.files?.[0];
    if (!file) {
      if (!editingPictureData) clearPreview(picturePreview);
      return;
    }

    const validation = validateCustomerImage(file);
    if (!validation.ok) {
      pictureInput.value = '';
      toast(validation.message);
      if (!editingPictureData) clearPreview(picturePreview);
      return;
    }

    try {
      picturePreview.src = await fileToDataUrl(file);
      picturePreview.classList.remove('hidden');
    } catch (error) {
      pictureInput.value = '';
      toast(error?.message || 'Failed to preview picture');
    }
  };

  const addAreaInline = form.querySelector('#add-area-inline');
  form.querySelector('#show-add-area-btn').onclick = () => {
    addAreaInline.classList.toggle('hidden');
    if (!addAreaInline.classList.contains('hidden')) {
      form.elements.new_area.focus();
    }
  };

  form.querySelector('#add-area-btn').onclick = () => {
    const newArea = String(form.elements.new_area.value || '').trim();
    if (!newArea) {
      toast('Enter area name first');
      return;
    }
    try {
      run('INSERT OR IGNORE INTO areas(name) VALUES (?)', [newArea]);
      syncAreaSelectOptions(newArea);
      form.elements.new_area.value = '';
      addAreaInline.classList.add('hidden');
      toast('Area added');
    } catch (error) {
      toast(error.message || 'Failed to add area');
    }
  };

  form.querySelector('#cancel-customer-edit-btn').onclick = () => {
    resetCustomerForm(form);
    toast('Customer edit cancelled');
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));

    const firstName = String(d.first_name || '').trim();
    const lastName = String(d.last_name || '').trim();
    const phone = String(d.phone || '').trim();
    const area = String(d.area || '').trim();

    if (!firstName || !lastName || !phone) {
      toast('Required: First Name, Last Name, Phone');
      return;
    }

    let pictureData = editingPictureData;
    const pictureFile = pictureInput.files?.[0];
    if (pictureFile) {
      const validation = validateCustomerImage(pictureFile);
      if (!validation.ok) {
        toast(validation.message);
        return;
      }
      try {
        pictureData = await fileToDataUrl(pictureFile);
      } catch (error) {
        toast(error?.message || 'Failed to read picture file');
        return;
      }
    }

    const fullName = `${firstName} ${lastName}`.trim();

    try {
      if (area) run('INSERT OR IGNORE INTO areas(name) VALUES (?)', [area]);

      if (editingCustomerId) {
        run(
          `UPDATE customers
           SET name=?, first_name=?, last_name=?, phone=?, area=?, picture_data=?
           WHERE id=?`,
          [fullName, firstName, lastName, phone, area || null, pictureData, editingCustomerId]
        );
        toast('Customer updated');
      } else {
        run(
          `INSERT INTO customers(name,first_name,last_name,phone,area,picture_data,total_purchases,due_amount)
           VALUES (?,?,?,?,?,?,0,0)`,
          [fullName, firstName, lastName, phone, area || null, pictureData]
        );
        toast('Customer added');
      }

      resetCustomerForm(form);
      refreshAll();
    } catch (error) {
      toast(error.message || 'Failed to save customer');
    }
  };

  renderCustomers(refreshAll);
}

export function renderCustomers(refreshAll) {
  syncAreaSelectOptions();
  const rows = query('SELECT * FROM customers ORDER BY id DESC');

  const wrap = document.getElementById('customers-table');
  wrap.innerHTML = `
    <div class="cards-header">Customers (${rows.length})</div>
    <div class="customers-grid">
      ${rows.map(c => customerCard(c)).join('') || '<div class="muted-text">No customers found.</div>'}
    </div>
  `;

  wrap.querySelectorAll('[data-edit-cus]').forEach(btn => {
    btn.onclick = () => openEditCustomer(+btn.dataset.editCus);
  });

  wrap.querySelectorAll('[data-del-cus]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Delete this customer?')) return;
      try {
        run('DELETE FROM customers WHERE id=?', [+btn.dataset.delCus]);
        toast('Customer deleted');
        refreshAll();
      } catch (error) {
        toast(error.message || 'Delete failed');
      }
    };
  });
}

function customerCard(customer) {
  const image = customer.picture_data
    ? `<img class="thumb large" src="${customer.picture_data}" alt="${escapeHtml(getCustomerName(customer))}" />`
    : '<div class="thumb large placeholder">No Image</div>';

  return `
    <article class="customer-card">
      <div class="customer-card-main">
        ${image}
        <div>
          <h3>${escapeHtml(getCustomerName(customer))}</h3>
          <p class="muted-text">Phone: ${escapeHtml(customer.phone || '—')}</p>
          <p class="muted-text">Area: ${escapeHtml(customer.area || '—')}</p>
        </div>
      </div>
      <div class="action-group card-actions">
        <button class="ghost-btn edit-btn" data-edit-cus="${customer.id}">Edit</button>
        <button class="ghost-btn danger-btn" data-del-cus="${customer.id}">Delete</button>
      </div>
    </article>
  `;
}

function openEditCustomer(customerId) {
  const form = document.getElementById('customer-form');
  const customer = query('SELECT * FROM customers WHERE id=?', [customerId])[0];
  if (!form || !customer) return;

  editingCustomerId = customerId;
  editingPictureData = customer.picture_data || null;

  const [firstName, lastName] = splitName(customer);
  form.elements.first_name.value = customer.first_name || firstName;
  form.elements.last_name.value = customer.last_name || lastName;
  form.elements.phone.value = customer.phone || '';
  form.elements.new_area.value = '';

  syncAreaSelectOptions(customer.area || '');

  form.elements.picture.value = '';
  const picturePreview = form.querySelector('#customer-picture-preview');
  if (editingPictureData) {
    picturePreview.src = editingPictureData;
    picturePreview.classList.remove('hidden');
  } else {
    clearPreview(picturePreview);
  }

  form.querySelector('#save-customer-btn').textContent = 'Update Customer';
  form.querySelector('#customer-form-mode').textContent = `Editing Customer #${customerId}`;
  form.querySelector('#cancel-customer-edit-btn').classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetCustomerForm(form) {
  editingCustomerId = null;
  editingPictureData = null;

  form.reset();
  syncAreaSelectOptions();
  clearPreview(form.querySelector('#customer-picture-preview'));
  form.querySelector('#save-customer-btn').textContent = 'Save Customer';
  form.querySelector('#customer-form-mode').textContent = 'Add New Customer';
  form.querySelector('#cancel-customer-edit-btn').classList.add('hidden');
  form.querySelector('#add-area-inline').classList.add('hidden');
}

function syncAreaSelectOptions(selected = null) {
  const areaSelect = document.querySelector('#customer-form select[name="area"]');
  if (!areaSelect) return;

  const current = selected ?? areaSelect.value;
  const areas = query(`
    SELECT name FROM areas
    UNION
    SELECT DISTINCT area AS name FROM customers WHERE area IS NOT NULL AND TRIM(area) != ''
    ORDER BY name
  `);

  areaSelect.innerHTML = `<option value="">Select Area</option>${areas.map(a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`).join('')}`;

  if (current && [...areaSelect.options].some(opt => opt.value === current)) {
    areaSelect.value = current;
  }
}

function validateCustomerImage(file) {
  if (!CUSTOMER_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, message: 'Invalid picture format. Use JPG, PNG, WEBP, or GIF.' };
  }
  if (file.size > MAX_CUSTOMER_IMAGE_MB * 1024 * 1024) {
    return { ok: false, message: `Picture too large. Max size is ${MAX_CUSTOMER_IMAGE_MB}MB.` };
  }
  return { ok: true };
}

function clearPreview(imgEl) {
  imgEl.classList.add('hidden');
  imgEl.removeAttribute('src');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function splitName(customer) {
  const name = String(customer?.name || '').trim();
  if (!name) return ['', ''];
  const [first, ...rest] = name.split(' ');
  return [first || '', rest.join(' ') || ''];
}

function getCustomerName(customer) {
  const first = String(customer?.first_name || '').trim();
  const last = String(customer?.last_name || '').trim();
  const joined = `${first} ${last}`.trim();
  return joined || String(customer?.name || 'Unknown');
}

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
