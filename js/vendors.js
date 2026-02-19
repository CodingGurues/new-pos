import { query, run } from './db.js?v=stockfix14';
import { fmtCurrency, toast } from './ui.js?v=stockfix14';

const MAX_VENDOR_IMAGE_MB = 2;
const VENDOR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

let editingVendorId = null;
let editingVendorImageData = null;

export function initVendors(refreshAll) {
  const form = document.getElementById('vendor-form');
  form.innerHTML = `
    <div class="form-mode" id="vendor-form-mode">Add New Vendor</div>
    <div class="field"><label>Vendor Name *</label><input name="name" placeholder="Vendor Name" required /></div>
    <div class="field"><label>Phone *</label><input name="phone" placeholder="Phone" required /></div>

    <div class="field area-field">
      <label>Area *</label>
      <div class="inline-input-action">
        <select name="area" required></select>
        <button id="show-add-vendor-area-btn" class="ghost-btn" type="button">Add Area</button>
      </div>
      <div class="inline-input-action hidden" id="add-vendor-area-inline">
        <input name="new_area" placeholder="New Area" />
        <button id="add-vendor-area-btn" class="ghost-btn" type="button">Save Area</button>
      </div>
    </div>

    <div class="file-field-row">
      <label class="muted-label">Vendor Picture (optional, JPG/PNG, max ${MAX_VENDOR_IMAGE_MB}MB)</label>
      <input id="vendor-picture" name="picture" type="file" accept="image/png,image/jpeg,.jpg,.jpeg" />
      <img id="vendor-picture-preview" class="image-preview hidden" alt="Vendor preview" />
    </div>

    <div class="form-actions-row">
      <button class="btn" id="save-vendor-btn" type="submit">Save Vendor</button>
      <button class="ghost-btn hidden" id="cancel-vendor-edit-btn" type="button">Cancel Edit</button>
    </div>
  `;

  syncVendorAreaSelectOptions();

  const pictureInput = form.querySelector('#vendor-picture');
  const picturePreview = form.querySelector('#vendor-picture-preview');

  pictureInput.onchange = async () => {
    const file = pictureInput.files?.[0];
    if (!file) {
      if (!editingVendorImageData) clearPreview(picturePreview);
      return;
    }
    const validation = validateVendorImage(file);
    if (!validation.ok) {
      pictureInput.value = '';
      toast(validation.message);
      if (!editingVendorImageData) clearPreview(picturePreview);
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

  const addAreaInline = form.querySelector('#add-vendor-area-inline');
  form.querySelector('#show-add-vendor-area-btn').onclick = () => {
    addAreaInline.classList.toggle('hidden');
    if (!addAreaInline.classList.contains('hidden')) form.elements.new_area.focus();
  };

  form.querySelector('#add-vendor-area-btn').onclick = () => {
    const area = String(form.elements.new_area.value || '').trim();
    if (!area) return toast('Enter area name first');
    try {
      run('INSERT OR IGNORE INTO areas(name) VALUES (?)', [area]);
      syncVendorAreaSelectOptions(area);
      form.elements.new_area.value = '';
      addAreaInline.classList.add('hidden');
      toast('Area added');
    } catch (error) {
      toast(error.message || 'Failed to add area');
    }
  };

  form.querySelector('#cancel-vendor-edit-btn').onclick = () => {
    resetVendorForm(form);
    toast('Vendor edit cancelled');
  };

  form.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));

    const name = String(d.name || '').trim();
    const phone = String(d.phone || '').trim();
    const area = String(d.area || '').trim();

    if (!name || !phone || !area) {
      toast('Required: Vendor Name, Phone, Area');
      return;
    }

    let imageData = editingVendorImageData;
    const file = pictureInput.files?.[0];
    if (file) {
      const validation = validateVendorImage(file);
      if (!validation.ok) return toast(validation.message);
      try {
        imageData = await fileToDataUrl(file);
      } catch (error) {
        return toast(error?.message || 'Failed to read picture file');
      }
    }

    try {
      run('INSERT OR IGNORE INTO areas(name) VALUES (?)', [area]);

      if (editingVendorId) {
        run('UPDATE vendors SET name=?, phone=?, area=?, image_data=? WHERE id=?', [name, phone, area, imageData, editingVendorId]);
        toast('Vendor updated');
      } else {
        run('INSERT INTO vendors(name,phone,area,image_data,total_purchase) VALUES (?,?,?,?,0)', [name, phone, area, imageData]);
        toast('Vendor added');
      }

      resetVendorForm(form);
      refreshAll();
    } catch (error) {
      toast(error.message || 'Failed to save vendor');
    }
  };

  renderVendors(refreshAll);
}

export function renderVendors(refreshAll) {
  syncVendorAreaSelectOptions();
  const rows = query('SELECT * FROM vendors ORDER BY id DESC');
  const wrap = document.getElementById('vendors-table');

  wrap.innerHTML = `
    <div class="cards-header">Vendors (${rows.length})</div>
    <div class="vendors-grid">
      ${rows.map(v => vendorCard(v)).join('') || '<div class="muted-text">No vendors found.</div>'}
    </div>
  `;

  wrap.querySelectorAll('[data-edit-vendor]').forEach(btn => {
    btn.onclick = () => openEditVendor(+btn.dataset.editVendor);
  });

  wrap.querySelectorAll('[data-del-vendor]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Delete this vendor?')) return;
      try {
        run('DELETE FROM vendor_purchases WHERE vendor_id=?', [+btn.dataset.delVendor]);
        run('DELETE FROM vendors WHERE id=?', [+btn.dataset.delVendor]);
        toast('Vendor deleted');
        refreshAll();
      } catch (error) {
        toast(error.message || 'Delete failed');
      }
    };
  });
}

function vendorCard(vendor) {
  const img = vendor.image_data
    ? `<img class="thumb large" src="${vendor.image_data}" alt="${escapeHtml(vendor.name)}" />`
    : '<div class="thumb large placeholder">No Image</div>';

  return `
    <article class="vendor-card">
      <div class="vendor-card-main">
        ${img}
        <div>
          <h3>${escapeHtml(vendor.name || 'Unknown Vendor')}</h3>
          <p class="muted-text">Phone: ${escapeHtml(vendor.phone || '—')}</p>
          <p class="muted-text">Area: ${escapeHtml(vendor.area || '—')}</p>
          <p class="muted-text">Total Purchase: ${fmtCurrency(vendor.total_purchase || 0)}</p>
        </div>
      </div>
      <div class="action-group card-actions">
        <button class="ghost-btn edit-btn" data-edit-vendor="${vendor.id}">Edit</button>
        <button class="ghost-btn danger-btn" data-del-vendor="${vendor.id}">Delete</button>
      </div>
    </article>
  `;
}

function openEditVendor(vendorId) {
  const form = document.getElementById('vendor-form');
  const vendor = query('SELECT * FROM vendors WHERE id=?', [vendorId])[0];
  if (!form || !vendor) return;

  editingVendorId = vendorId;
  editingVendorImageData = vendor.image_data || null;

  form.elements.name.value = vendor.name || '';
  form.elements.phone.value = vendor.phone || '';
  form.elements.new_area.value = '';
  syncVendorAreaSelectOptions(vendor.area || '');

  form.elements.picture.value = '';
  const preview = form.querySelector('#vendor-picture-preview');
  if (editingVendorImageData) {
    preview.src = editingVendorImageData;
    preview.classList.remove('hidden');
  } else {
    clearPreview(preview);
  }

  form.querySelector('#save-vendor-btn').textContent = 'Update Vendor';
  form.querySelector('#vendor-form-mode').textContent = `Editing Vendor #${vendorId}`;
  form.querySelector('#cancel-vendor-edit-btn').classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetVendorForm(form) {
  editingVendorId = null;
  editingVendorImageData = null;
  form.reset();
  syncVendorAreaSelectOptions();
  clearPreview(form.querySelector('#vendor-picture-preview'));
  form.querySelector('#save-vendor-btn').textContent = 'Save Vendor';
  form.querySelector('#vendor-form-mode').textContent = 'Add New Vendor';
  form.querySelector('#cancel-vendor-edit-btn').classList.add('hidden');
  form.querySelector('#add-vendor-area-inline').classList.add('hidden');
}

function syncVendorAreaSelectOptions(selected = null) {
  const areaSelect = document.querySelector('#vendor-form select[name="area"]');
  if (!areaSelect) return;

  const current = selected ?? areaSelect.value;
  const areas = query(`
    SELECT name FROM areas
    UNION
    SELECT DISTINCT area AS name FROM vendors WHERE area IS NOT NULL AND TRIM(area) != ''
    ORDER BY name
  `);

  areaSelect.innerHTML = `<option value="">Select Area</option>${areas.map(a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`).join('')}`;
  if (current && [...areaSelect.options].some(opt => opt.value === current)) areaSelect.value = current;
}

function validateVendorImage(file) {
  if (!VENDOR_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, message: 'Invalid picture format. Use JPG or PNG.' };
  }
  if (file.size > MAX_VENDOR_IMAGE_MB * 1024 * 1024) {
    return { ok: false, message: `Picture too large. Max size is ${MAX_VENDOR_IMAGE_MB}MB.` };
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

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
