const DB_KEY = 'pos_sqlite_backup';

let SQL;
let db;

const schemaSql = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, sku TEXT UNIQUE, category TEXT, cost REAL, price REAL,
  quantity INTEGER, vendor TEXT, threshold INTEGER
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, phone TEXT, email TEXT, address TEXT,
  total_purchases REAL DEFAULT 0, due_amount REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, phone TEXT, address TEXT, total_purchase REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER, created_at TEXT, subtotal REAL, discount REAL, tax REAL,
  total REAL, profit REAL, items_json TEXT
);
CREATE TABLE IF NOT EXISTS vendor_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER, product_id INTEGER, qty INTEGER, unit_cost REAL, created_at TEXT
);
`;

export async function initDB() {
  SQL = await initSqlJs({ locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}` });
  const stored = localStorage.getItem(DB_KEY);
  db = stored ? new SQL.Database(Uint8Array.from(atob(stored), c => c.charCodeAt(0))) : new SQL.Database();
  db.run(schemaSql);
  seedData();
  saveDB();
  return db;
}

function seedData() {
  const hasProducts = db.exec('SELECT COUNT(*) c FROM products')[0].values[0][0] > 0;
  if (hasProducts) return;
  db.run(`INSERT INTO vendors(name,phone,address,total_purchase) VALUES
    ('Alpha Mobile Supplies','1234567890','City Center',0),('Prime Accessories','9876543210','Market Road',0);`);
  db.run(`INSERT INTO products(name,sku,category,cost,price,quantity,vendor,threshold) VALUES
    ('USB-C Fast Charger','CHG-001','Chargers',8,15,120,'Alpha Mobile Supplies',20),
    ('Tempered Glass iPhone 14','GLS-014','Screen Guards',1.5,5,200,'Prime Accessories',40),
    ('Wireless Earbuds Pro','EAR-090','Audio',20,35,60,'Alpha Mobile Supplies',15);`);
  db.run(`INSERT INTO customers(name,phone,email,address,total_purchases,due_amount) VALUES
    ('Ahmed Khan','03001234567','ahmed@example.com','Lahore',0,0),('Sara Ali','03007654321','sara@example.com','Karachi',0,0);`);
}

export function run(sql, params = []) { db.run(sql, params); saveDB(); }

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
  saveDB();
}

function saveDB() {
  const binary = db.export();
  const b64 = btoa(String.fromCharCode(...binary));
  localStorage.setItem(DB_KEY, b64);
}
