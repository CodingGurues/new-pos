const DB_KEY = 'pos_sqlite_backup';

let SQL;
let db;

const schemaSql = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  sku TEXT UNIQUE,
  category TEXT,
  cost REAL,
  price REAL,
  wholesale_price REAL DEFAULT 0,
  box_purchase_price REAL,
  box_sale_price REAL,
  box_size INTEGER,
  image_data TEXT,
  quantity INTEGER,
  vendor TEXT,
  threshold INTEGER
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  area TEXT,
  picture_data TEXT,
  total_purchases REAL DEFAULT 0,
  due_amount REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  area TEXT,
  image_data TEXT,
  total_purchase REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  status TEXT,
  created_at TEXT,
  subtotal REAL,
  discount REAL,
  tax REAL,
  total REAL,
  paid_amount REAL,
  return_amount REAL,
  due_amount REAL,
  payment_type TEXT,
  profit REAL
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  product_id INTEGER,
  quantity INTEGER,
  unit_price REAL,
  discount REAL,
  total REAL,
  profit REAL
);
CREATE TABLE IF NOT EXISTS vendor_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER, product_id INTEGER, qty INTEGER, unit_cost REAL, created_at TEXT
);
CREATE TABLE IF NOT EXISTS stock_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  qty INTEGER,
  cost_price REAL,
  sale_price REAL,
  created_at TEXT
);
`;

export async function initDB() {
  SQL = await initSqlJs({ locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}` });
  const stored = localStorage.getItem(DB_KEY);
  db = stored ? new SQL.Database(Uint8Array.from(atob(stored), c => c.charCodeAt(0))) : new SQL.Database();
  db.run(schemaSql);
  migrateProductColumns();
  migrateCustomerColumns();
  migrateVendorColumns();
  migrateInvoiceColumns();
  seedData();
  syncCategoriesFromProducts();
  syncAreasFromCustomers();
  saveDB();
  return db;
}

function migrateProductColumns() {
  const cols = db.exec('PRAGMA table_info(products)');
  const existing = new Set(cols[0]?.values?.map(v => v[1]) || []);
  const needed = [
    ['wholesale_price', 'REAL DEFAULT 0'],
    ['box_purchase_price', 'REAL'],
    ['box_sale_price', 'REAL'],
    ['box_size', 'INTEGER'],
    ['image_data', 'TEXT']
  ];
  needed.forEach(([name, type]) => {
    if (!existing.has(name)) db.run(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
  });
}


function migrateCustomerColumns() {
  const cols = db.exec('PRAGMA table_info(customers)');
  const existing = new Set(cols[0]?.values?.map(v => v[1]) || []);
  const needed = [
    ['name', 'TEXT'],
    ['first_name', 'TEXT'],
    ['last_name', 'TEXT'],
    ['phone', 'TEXT'],
    ['email', 'TEXT'],
    ['area', 'TEXT'],
    ['picture_data', 'TEXT'],
    ['total_purchases', 'REAL DEFAULT 0'],
    ['due_amount', 'REAL DEFAULT 0']
  ];
  needed.forEach(([name, type]) => {
    if (!existing.has(name)) db.run(`ALTER TABLE customers ADD COLUMN ${name} ${type}`);
  });
}


function migrateVendorColumns() {
  const cols = db.exec('PRAGMA table_info(vendors)');
  const existing = new Set(cols[0]?.values?.map(v => v[1]) || []);
  const needed = [
    ['name', 'TEXT'],
    ['phone', 'TEXT'],
    ['area', 'TEXT'],
    ['image_data', 'TEXT'],
    ['total_purchase', 'REAL DEFAULT 0']
  ];
  needed.forEach(([name, type]) => {
    if (!existing.has(name)) db.run(`ALTER TABLE vendors ADD COLUMN ${name} ${type}`);
  });
}


function migrateInvoiceColumns() {
  const cols = db.exec('PRAGMA table_info(invoices)');
  const existing = new Set(cols[0]?.values?.map(v => v[1]) || []);
  const needed = [
    ['customer_id', 'INTEGER'],
    ['status', 'TEXT'],
    ['created_at', 'TEXT'],
    ['subtotal', 'REAL'],
    ['discount', 'REAL'],
    ['tax', 'REAL'],
    ['total', 'REAL'],
    ['paid_amount', 'REAL'],
    ['return_amount', 'REAL'],
    ['due_amount', 'REAL'],
    ['payment_type', 'TEXT'],
    ['profit', 'REAL']
  ];
  needed.forEach(([name, type]) => {
    if (!existing.has(name)) db.run(`ALTER TABLE invoices ADD COLUMN ${name} ${type}`);
  });
  db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    unit_price REAL,
    discount REAL,
    total REAL,
    profit REAL
  );`);
}

function seedData() {
  const hasProducts = db.exec('SELECT COUNT(*) c FROM products')[0].values[0][0] > 0;
  if (hasProducts) return;
  db.run(`INSERT INTO vendors(name,phone,area,total_purchase) VALUES
    ('Alpha Mobile Supplies','1234567890','City Center',0),('Prime Accessories','9876543210','Market Road',0);`);
  db.run(`INSERT INTO categories(name) VALUES
    ('Chargers'),('Screen Guards'),('Audio')
  ON CONFLICT(name) DO NOTHING;`);
  db.run(`INSERT INTO areas(name) VALUES
    ('City Center'),('North Zone'),('Market Road')
  ON CONFLICT(name) DO NOTHING;`);
  db.run(`INSERT INTO products(name,sku,category,cost,price,wholesale_price,quantity,vendor,threshold) VALUES
    ('USB-C Fast Charger','CHG-001','Chargers',8,15,13,120,'Alpha Mobile Supplies',20),
    ('Tempered Glass iPhone 14','GLS-014','Screen Guards',1.5,5,4,200,'Prime Accessories',40),
    ('Wireless Earbuds Pro','EAR-090','Audio',20,35,31,60,'Alpha Mobile Supplies',15);`);
  db.run(`INSERT INTO customers(name,first_name,last_name,phone,area,total_purchases,due_amount) VALUES
    ('Ahmed Khan','Ahmed','Khan','03001234567','City Center',0,0),
    ('Sara Ali','Sara','Ali','03007654321','Market Road',0,0);`);
}

function syncCategoriesFromProducts() {
  db.run(`INSERT INTO categories(name)
          SELECT DISTINCT TRIM(category)
          FROM products
          WHERE category IS NOT NULL AND TRIM(category) != ''
          ON CONFLICT(name) DO NOTHING;`);
}

function syncAreasFromCustomers() {
  db.run(`INSERT INTO areas(name)
          SELECT DISTINCT TRIM(name)
          FROM (
            SELECT area AS name FROM customers
            UNION ALL
            SELECT area AS name FROM vendors
          )
          WHERE name IS NOT NULL AND TRIM(name) != ''
          ON CONFLICT(name) DO NOTHING;`);
}

export function run(sql, params = []) {
  db.run(sql, params);
  if (/\bproducts\b|\bcategories\b/i.test(sql)) syncCategoriesFromProducts();
  if (/\bcustomers\b|\bvendors\b|\bareas\b/i.test(sql)) syncAreasFromCustomers();
  saveDB();
}

export function query(sql, params = []) {
  const res = db.exec(sql, params);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

export function exportDB() {
  const binary = db.export();
  return new Blob([binary], { type: 'application/octet-stream' });
}

export function importDB(arrayBuffer) {
  db = new SQL.Database(new Uint8Array(arrayBuffer));
  db.run(schemaSql);
  migrateProductColumns();
  migrateCustomerColumns();
  migrateVendorColumns();
  migrateInvoiceColumns();
  syncCategoriesFromProducts();
  syncAreasFromCustomers();
  saveDB();
}

function saveDB() {
  const binary = db.export();
  let binaryString = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < binary.length; i += chunkSize) {
    binaryString += String.fromCharCode(...binary.subarray(i, i + chunkSize));
  }
  localStorage.setItem(DB_KEY, btoa(binaryString));
}
