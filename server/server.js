const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'micro-erp-super-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new Database(path.join(__dirname, 'erp.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'operator',
      avatar_url TEXT,
      is_active INTEGER DEFAULT 1,
      is_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT,
      logo_url TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      country TEXT DEFAULT 'India',
      phone TEXT,
      email TEXT,
      website TEXT,
      gst_number TEXT,
      pan_number TEXT,
      tan_number TEXT,
      cin_number TEXT,
      iec_code TEXT,
      financial_year_start TEXT DEFAULT '04-01',
      financial_year_end TEXT DEFAULT '03-31',
      currency TEXT DEFAULT 'INR',
      settings TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      gst_number TEXT,
      pan_number TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      credit_limit REAL DEFAULT 0,
      credit_days INTEGER DEFAULT 0,
      tax_type TEXT DEFAULT 'GST',
      opening_balance REAL DEFAULT 0,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      gst_number TEXT,
      pan_number TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      payment_terms INTEGER DEFAULT 30,
      tax_type TEXT DEFAULT 'GST',
      opening_balance REAL DEFAULT 0,
      category TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      father_name TEXT,
      date_of_birth TEXT,
      date_of_joining TEXT NOT NULL,
      date_of_leaving TEXT,
      gender TEXT,
      phone TEXT,
      email TEXT,
      aadhar_number TEXT,
      pan_number TEXT,
      esi_number TEXT,
      pf_number TEXT,
      bank_name TEXT,
      bank_account TEXT,
      ifsc_code TEXT,
      department TEXT,
      designation TEXT,
      basic_salary REAL DEFAULT 0,
      hra REAL DEFAULT 0,
      da REAL DEFAULT 0,
      address TEXT,
      emergency_contact TEXT,
      emergency_phone TEXT,
      photo_url TEXT,
      is_worker INTEGER DEFAULT 0,
      piece_rate REAL,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      parent_id INTEGER,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT,
      logo_url TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      product_id INTEGER,
      brand_id INTEGER,
      description TEXT,
      category_name TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS designs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      style_name TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      year INTEGER,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fabrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      product_id INTEGER,
      fabric_type TEXT,
      composition TEXT,
      gsm REAL,
      width REAL,
      width_unit TEXT DEFAULT 'inch',
      cost_per_unit REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS colors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      hex_code TEXT,
      pantone_ref TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      size_group TEXT,
      sort_order INTEGER DEFAULT 0,
      chest REAL,
      waist REAL,
      length REAL,
      sleeve REAL,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      abbreviation TEXT,
      unit_type TEXT DEFAULT 'piece',
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      warehouse_type TEXT DEFAULT 'raw_material',
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      machine_type TEXT,
      model TEXT,
      serial_number TEXT,
      capacity TEXT,
      status TEXT DEFAULT 'idle',
      department_id INTEGER,
      capacity_per_hour INTEGER DEFAULT 0,
      purchase_date TEXT,
      last_maintenance TEXT,
      next_maintenance TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category_id INTEGER,
      brand_id INTEGER,
      product_type TEXT DEFAULT 'finished',
      unit_id INTEGER,
      hsn_code TEXT,
      gst_rate REAL DEFAULT 0,
      barcode TEXT,
      description TEXT,
      cost_price REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      mrp REAL DEFAULT 0,
      min_stock_level INTEGER DEFAULT 0,
      max_stock_level INTEGER DEFAULT 0,
      reorder_level INTEGER DEFAULT 0,
      weight REAL,
      weight_unit TEXT,
      image_url TEXT,
      is_track_inventory INTEGER DEFAULT 1,
      tax_inclusive INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_balance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      color_id INTEGER,
      size_id INTEGER,
      batch_number TEXT,
      quantity REAL DEFAULT 0,
      reserved_quantity REAL DEFAULT 0,
      damaged_quantity REAL DEFAULT 0,
      avg_cost REAL DEFAULT 0,
      last_movement_date TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      running_balance REAL DEFAULT 0,
      reference_type TEXT,
      reference_id INTEGER,
      reference_number TEXT,
      batch_number TEXT,
      color_id INTEGER,
      size_id INTEGER,
      remarks TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      vendor_id INTEGER NOT NULL,
      delivery_date TEXT,
      status TEXT DEFAULT 'draft',
      payment_status TEXT DEFAULT 'unpaid',
      payment_terms TEXT,
      notes TEXT,
      terms TEXT,
      subtotal REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      rate REAL NOT NULL,
      gst_rate REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      received_qty REAL DEFAULT 0,
      remarks TEXT,
      FOREIGN KEY (order_id) REFERENCES purchase_orders(id)
    );

    CREATE TABLE IF NOT EXISTS sales_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      delivery_date TEXT,
      quotation_id INTEGER,
      status TEXT DEFAULT 'draft',
      payment_status TEXT DEFAULT 'unpaid',
      delivery_status TEXT DEFAULT 'pending',
      notes TEXT,
      terms TEXT,
      subtotal REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      rate REAL NOT NULL,
      gst_rate REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      delivered_qty REAL DEFAULT 0,
      color TEXT,
      size TEXT,
      style TEXT,
      remarks TEXT,
      FOREIGN KEY (order_id) REFERENCES sales_orders(id)
    );

    CREATE TABLE IF NOT EXISTS production_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      sales_order_id INTEGER,
      product_id INTEGER NOT NULL,
      planned_quantity REAL NOT NULL,
      produced_quantity REAL DEFAULT 0,
      rejected_quantity REAL DEFAULT 0,
      status TEXT DEFAULT 'planned',
      start_date TEXT,
      end_date TEXT,
      bom_id INTEGER,
      priority TEXT DEFAULT 'normal',
      remarks TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS boms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bom_number TEXT UNIQUE NOT NULL,
      product_id INTEGER NOT NULL,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      remarks TEXT,
      total_cost REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bom_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bom_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      wastage_percent REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      remarks TEXT,
      FOREIGN KEY (bom_id) REFERENCES boms(id)
    );

    CREATE TABLE IF NOT EXISTS quality_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      production_order_id INTEGER,
      product_id INTEGER,
      inspector_id INTEGER,
      sample_size REAL NOT NULL,
      passed_qty REAL DEFAULT 0,
      failed_qty REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      remarks TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      party_name TEXT NOT NULL,
      job_type TEXT,
      status TEXT DEFAULT 'draft',
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      overtime_hours REAL DEFAULT 0,
      pieces_completed INTEGER DEFAULT 0,
      remarks TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS salary_slips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slip_number TEXT UNIQUE NOT NULL,
      employee_id INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      basic_salary REAL DEFAULT 0,
      hra REAL DEFAULT 0,
      allowances REAL DEFAULT 0,
      gross_salary REAL DEFAULT 0,
      pf_deduction REAL DEFAULT 0,
      esi_deduction REAL DEFAULT 0,
      tds_deduction REAL DEFAULT 0,
      other_deductions REAL DEFAULT 0,
      net_salary REAL DEFAULT 0,
      status TEXT DEFAULT 'draft',
      paid_date TEXT,
      remarks TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      parent_id INTEGER,
      is_group INTEGER DEFAULT 0,
      balance REAL DEFAULT 0,
      opening_balance REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      narration TEXT,
      reference_type TEXT,
      reference_id INTEGER,
      status TEXT DEFAULT 'draft',
      total_debit REAL DEFAULT 0,
      total_credit REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      description TEXT,
      FOREIGN KEY (entry_id) REFERENCES journal_entries(id)
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      valid_until TEXT,
      status TEXT DEFAULT 'draft',
      subtotal REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS delivery_challans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challan_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      sales_order_id INTEGER,
      status TEXT DEFAULT 'draft',
      vehicle_number TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      purchase_order_id INTEGER NOT NULL,
      vendor_id INTEGER NOT NULL,
      status TEXT DEFAULT 'draft',
      remarks TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      notification_type TEXT DEFAULT 'info',
      module TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ============================================================
// SEED DATA
// ============================================================
function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) return;

  // Create admin user
  const hash = bcrypt.hashSync('Admin@123', 10);
  db.prepare(`INSERT INTO users (email, username, password_hash, full_name, phone, role, is_active, is_verified)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)`).run(
    'admin@microerp.com', 'admin', hash, 'System Admin', '+919999999999', 'super_admin'
  );

  // Create company
  db.prepare(`INSERT INTO companies (name, short_name, address, city, state, pincode, phone, email, gst_number, pan_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'Microtechnique Garments Pvt Ltd', 'MTGPL', 'Plot 42, Sector 5, Industrial Area', 'Mumbai', 'Maharashtra', '400001', '+912223456789', 'info@microtechnique.com', '27AABCT1234F1ZP', 'AABCT1234F'
  );

  // Create customers
  const customers = [
    ['CUST001', 'Reliance Retail Ltd', 'Rajesh Kumar', '+919876543210', 'rajesh@reliance.com', 'Maharashtra', 'Mumbai', '27AABCR1234F1ZP', 5000000, 30],
    ['CUST002', 'Aditya Birla Fashion', 'Priya Sharma', '+919876543211', 'priya@abfrl.com', 'Delhi', 'New Delhi', '07AABCB5678F1ZQ', 3000000, 45],
    ['CUST003', 'Trent Ltd (Tata)', 'Amit Patel', '+919876543212', 'amit@trent.co.in', 'Gujarat', 'Ahmedabad', '24AABCT9012F1ZR', 4000000, 30],
    ['CUST004', 'Shoppers Stop', 'Neha Gupta', '+919876543213', 'neha@shoppersstop.com', 'Maharashtra', 'Mumbai', '27AABCS3456F1ZS', 2000000, 60],
    ['CUST005', 'Future Lifestyle', 'Vikram Singh', '+919876543214', 'vikram@fpg.in', 'Karnataka', 'Bangalore', '29AABCF7890F1ZT', 1500000, 30],
  ];
  for (const c of customers) {
    db.prepare(`INSERT INTO customers (code, name, contact_person, phone, email, state, city, gst_number, credit_limit, credit_days) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...c);
  }

  // Create vendors
  const vendors = [
    ['VEND001', 'Arvind Textiles', 'Karan Mehta', '+919988776601', 'karan@arvind.com', 'Gujarat', 'Ahmedabad', '24AABCA1111F1ZK', 45, 'Fabric'],
    ['VEND002', 'Welspun India', 'Deepak Joshi', '+919988776602', 'deepak@welspun.com', 'Maharashtra', 'Mumbai', '27AABCW2222F1ZL', 30, 'Textiles'],
    ['VEND003', 'Trident Limited', 'Sanjay Verma', '+919988776603', 'sanjay@trident.in', 'Punjab', 'Ludhiana', '03AABCT3333F1ZM', 60, 'Yarn'],
    ['VEND004', 'Vardhman Textiles', 'Ritu Agarwal', '+919988776604', 'ritu@vardhman.com', 'Delhi', 'New Delhi', '07AABCV4444F1ZN', 30, 'Fabric'],
    ['VEND005', 'Raymond Finishing', 'Mohan Das', '+919988776605', 'mohan@raymond.in', 'Tamil Nadu', 'Coimbatore', '33AABCR5555F1ZO', 45, 'Processing'],
  ];
  for (const v of vendors) {
    db.prepare(`INSERT INTO vendors (code, name, contact_person, phone, email, state, city, gst_number, payment_terms, category) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...v);
  }

  // Create employees
  const employees = [
    ['EMP001', 'Rahul Sharma', 'Suresh Sharma', '1990-05-15', '2020-01-10', 'male', '+918877665501', 'rahul@micro.com', 'Cutting Master', 'Cutting', 25000],
    ['EMP002', 'Anita Devi', 'Ram Kumar', '1992-08-20', '2019-06-15', 'female', '+918877665502', 'anita@micro.com', 'Stitching Supervisor', 'Stitching', 22000],
    ['EMP003', 'Mohammad Irfan', 'Abdul Khan', '1988-03-10', '2018-03-20', 'male', '+918877665503', 'irfan@micro.com', 'Quality Inspector', 'Quality', 20000],
    ['EMP004', 'Lakshmi Nair', 'Krishnan Nair', '1995-11-25', '2021-02-01', 'female', '+918877665504', 'lakshmi@micro.com', 'HR Manager', 'HR', 35000],
    ['EMP005', 'Vijay Kumar', 'Ramesh Kumar', '1991-07-08', '2017-09-12', 'male', '+918877665505', 'vijay@micro.com', 'Factory Manager', 'Management', 55000],
  ];
  for (const e of employees) {
    db.prepare(`INSERT INTO employees (code, full_name, father_name, date_of_birth, date_of_joining, gender, phone, email, designation, department, basic_salary) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(...e);
  }

  // Create categories
  const categories = [
    ['Men Wear', 'MW', null, 'Men\'s garment categories'],
    ['Women Wear', 'WW', null, 'Women\'s garment categories'],
    ['Kids Wear', 'KW', null, 'Children\'s garment categories'],
    ['Shirts', 'SH', 1, 'Men\'s shirts'],
    ['Trousers', 'TR', 1, 'Men\'s trousers'],
    ['T-Shirts', 'TS', 1, 'Men\'s t-shirts'],
    ['Kurtas', 'KU', 2, 'Women\'s kurtas'],
    ['Sarees', 'SA', 2, 'Women\'s sarees'],
    ['Frocks', 'FR', 3, 'Kids frocks'],
  ];
  for (const c of categories) {
    db.prepare(`INSERT INTO product_categories (name, code, parent_id, description) VALUES (?,?,?,?)`).run(...c);
  }

  // Create brands
  const brands = [
    ['Microtechnique', 'MT', 'In-house brand'],
    ['ThreadCraft', 'TC', 'Premium thread brand'],
    ['FabricFirst', 'FF', 'Budget-friendly line'],
    ['StyleLine', 'SL', 'Fashion-forward collection'],
  ];
  for (const b of brands) {
    db.prepare(`INSERT INTO brands (name, code, description) VALUES (?,?,?)`).run(...b);
  }

  // Create colors
  const colors = [
    ['CLR001', 'White', '#FFFFFF', 'PMS White'],
    ['CLR002', 'Black', '#000000', 'PMS Black'],
    ['CLR003', 'Navy Blue', '#000080', 'PMS 289'],
    ['CLR004', 'Red', '#FF0000', 'PMS 186'],
    ['CLR005', 'Green', '#008000', 'PMS 349'],
    ['CLR006', 'Grey', '#808080', 'PMS Cool Gray 9'],
    ['CLR007', 'Maroon', '#800000', 'PMS 188'],
    ['CLR008', 'Sky Blue', '#87CEEB', 'PMS 297'],
  ];
  for (const c of colors) {
    db.prepare(`INSERT INTO colors (code, name, hex_code, pantone_ref) VALUES (?,?,?,?)`).run(...c);
  }

  // Create sizes
  const sizes = [
    ['S', 'Small', 'S/M/L', 1],
    ['M', 'Medium', 'S/M/L', 2],
    ['L', 'Large', 'S/M/L', 3],
    ['XL', 'Extra Large', 'S/M/L', 4],
    ['XXL', 'Double XL', 'S/M/L', 5],
    ['28', 'Waist 28', 'Numeric', 6],
    ['30', 'Waist 30', 'Numeric', 7],
    ['32', 'Waist 32', 'Numeric', 8],
    ['34', 'Waist 34', 'Numeric', 9],
    ['36', 'Waist 36', 'Numeric', 10],
  ];
  for (const s of sizes) {
    db.prepare(`INSERT INTO sizes (code, name, size_group, sort_order) VALUES (?,?,?,?)`).run(...s);
  }

  // Create units
  const units = [
    ['Piece', 'PCS', 'piece', 'Piece'],
    ['Meter', 'MTR', 'length', 'Meter'],
    ['Kilogram', 'KG', 'weight', 'Kilogram'],
    ['Dozen', 'DZN', 'piece', 'Dozen'],
    ['Box', 'BOX', 'piece', 'Box'],
    ['Yard', 'YD', 'length', 'Yard'],
  ];
  for (const u of units) {
    db.prepare(`INSERT INTO units (name, code, unit_type, abbreviation) VALUES (?,?,?,?)`).run(...u);
  }

  // Create warehouses
  const warehouses = [
    ['Raw Material Store', 'RMS', 'Main Gate Area, Factory', 'Mumbai', 'Maharashtra', 'raw_material', 1],
    ['Work In Progress', 'WIP', 'Floor 1, Factory', 'Mumbai', 'Maharashtra', 'wip', 0],
    ['Finished Goods', 'FGS', 'Floor 2, Factory', 'Mumbai', 'Maharashtra', 'finished', 0],
    ['Dispatch Warehouse', 'DWH', 'Loading Bay, Factory', 'Mumbai', 'Maharashtra', 'dispatch', 0],
  ];
  for (const w of warehouses) {
    db.prepare(`INSERT INTO warehouses (name, code, address, city, state, warehouse_type, is_default) VALUES (?,?,?,?,?,?,?)`).run(...w);
  }

  // Create machines
  const machines = [
    ['Auto Cutter Juki', 'MC001', 'cutting', 'Juki LK-190', 'JKN-2024-001', '500 pcs/day', 'running'],
    ['Single Needle Brother', 'MC002', 'stitching', 'Brother S-7300A', 'BRN-2024-002', '300 pcs/day', 'running'],
    ['Overlock Juki', 'MC003', 'stitching', 'Juki MO-6814S', 'JKN-2024-003', '400 pcs/day', 'running'],
    ['Button Hole Machine', 'MC004', 'stitching', 'Juki LBH-1790A', 'JKN-2024-004', '200 pcs/day', 'idle'],
    ['Embroidery Tajima', 'MC005', 'embroidery', 'Tajima TMEG-HC1501', 'TJM-2024-005', '100 pcs/day', 'maintenance'],
    ['Steam Iron Silver Star', 'MC006', 'ironing', 'Silver Star ES-300', 'SST-2024-006', '600 pcs/day', 'running'],
    ['Fabric Spreader', 'MC007', 'cutting', 'Kuris KSP-Auto', 'KRS-2024-007', '400 pcs/day', 'idle'],
    ['Heat Press', 'MC008', 'printing', 'Stahls HotMark', 'STH-2024-008', '150 pcs/day', 'broken'],
  ];
  for (const m of machines) {
    db.prepare(`INSERT INTO machines (name, code, machine_type, model, serial_number, capacity, status) VALUES (?,?,?,?,?,?,?)`).run(...m);
  }

  // Create fabrics
  const fabrics = [
    ['FAB001', 'Cotton Poplin', 'woven', '100% Cotton', 120, 58, 350],
    ['FAB002', 'Polyester Twill', 'woven', '65% Poly 35% Cotton', 180, 60, 280],
    ['FAB003', 'Jersey Knit', 'knitted', '100% Cotton', 160, 62, 420],
    ['FAB004', 'Denim 12oz', 'woven', '100% Cotton', 340, 58, 550],
    ['FAB005', 'Chiffon', 'woven', '100% Polyester', 75, 58, 180],
  ];
  for (const f of fabrics) {
    db.prepare(`INSERT INTO fabrics (code, name, fabric_type, composition, gsm, width, cost_per_unit) VALUES (?,?,?,?,?,?,?)`).run(...f);
  }

  // Create products
  const products = [
    ['SKU-SH001', 'Formal White Shirt', 4, 1, 'finished', 1, '6204', 18, 350, 750, 999, 50, 500, 100],
    ['SKU-SH002', 'Casual Check Shirt', 4, 2, 'finished', 1, '6204', 18, 280, 599, 799, 50, 500, 100],
    ['SKU-TS001', 'Round Neck T-Shirt', 6, 1, 'finished', 1, '6109', 18, 150, 349, 499, 100, 1000, 200],
    ['SKU-TS002', 'Polo T-Shirt', 6, 3, 'finished', 1, '6109', 18, 180, 449, 599, 100, 1000, 200],
    ['SKU-TR001', 'Formal Trouser', 5, 1, 'finished', 1, '6203', 18, 400, 899, 1199, 30, 300, 50],
    ['SKU-KR001', 'Cotton Kurta', 7, 4, 'finished', 1, '6211', 18, 250, 599, 799, 50, 500, 100],
    ['SKU-RM001', 'Cotton Poplin Fabric', null, null, 'raw_material', 2, '5208', 5, 0, 350, 0, 100, 5000, 500],
    ['SKU-RM002', 'Polyester Thread', null, null, 'raw_material', 1, '5401', 18, 0, 45, 0, 200, 2000, 500],
  ];
  for (const p of products) {
    db.prepare(`INSERT INTO products (sku, name, category_id, brand_id, product_type, unit_id, hsn_code, gst_rate, cost_price, selling_price, mrp, min_stock_level, max_stock_level, reorder_level) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...p);
  }

  // Create stock balance entries
  const stockEntries = [
    [1, 3, 50, 0, 0, 350],
    [2, 3, 30, 0, 0, 280],
    [3, 3, 150, 0, 0, 150],
    [4, 3, 80, 0, 0, 180],
    [5, 3, 25, 0, 0, 400],
    [6, 3, 60, 0, 0, 250],
    [7, 1, 2000, 0, 0, 350],
    [8, 1, 500, 0, 0, 45],
  ];
  for (const s of stockEntries) {
    db.prepare(`INSERT INTO stock_balance (product_id, warehouse_id, quantity, reserved_quantity, damaged_quantity, avg_cost) VALUES (?,?,?,?,?,?)`).run(...s);
  }

  // Create purchase orders
  const pos = [
    ['PO-2025-0001', '2025-01-15', 1, '2025-01-30', 'confirmed', 'partial', 175000, 31500, 206500],
    ['PO-2025-0002', '2025-01-20', 2, '2025-02-05', 'received', 'paid', 250000, 45000, 295000],
    ['PO-2025-0003', '2025-02-01', 3, '2025-02-20', 'draft', 'unpaid', 89000, 16020, 105020],
    ['PO-2025-0004', '2025-02-10', 4, '2025-02-28', 'confirmed', 'unpaid', 320000, 57600, 377600],
    ['PO-2025-0005', '2025-02-15', 5, '2025-03-05', 'draft', 'unpaid', 45000, 8100, 53100],
  ];
  for (const po of pos) {
    db.prepare(`INSERT INTO purchase_orders (order_number, date, vendor_id, delivery_date, status, payment_status, subtotal, gst_amount, total_amount) VALUES (?,?,?,?,?,?,?,?,?)`).run(...po);
  }

  // Create PO items (PO IDs are 1-5)
  db.prepare(`INSERT INTO purchase_order_items (order_id, product_id, quantity, rate, gst_rate, amount, received_qty) VALUES (1, 1, 500, 350, 18, 175000, 200)`).run();
  db.prepare(`INSERT INTO purchase_order_items (order_id, product_id, quantity, rate, gst_rate, amount, received_qty) VALUES (2, 2, 1000, 250, 18, 250000, 1000)`).run();
  db.prepare(`INSERT INTO purchase_order_items (order_id, product_id, quantity, rate, gst_rate, amount, received_qty) VALUES (3, 7, 200, 445, 18, 89000, 0)`).run();
  db.prepare(`INSERT INTO purchase_order_items (order_id, product_id, quantity, rate, gst_rate, amount, received_qty) VALUES (4, 7, 500, 640, 18, 320000, 0)`).run();
  db.prepare(`INSERT INTO purchase_order_items (order_id, product_id, quantity, rate, gst_rate, amount, received_qty) VALUES (5, 8, 1000, 45, 18, 45000, 0)`).run();

  // Create sales orders
  const sos = [
    ['SO-2025-0001', '2025-01-10', 1, '2025-02-10', 'confirmed', 'partial', 'partial', 375000, 67500, 442500],
    ['SO-2025-0002', '2025-01-18', 2, '2025-02-18', 'delivered', 'paid', 'delivered', 180000, 32400, 212400],
    ['SO-2025-0003', '2025-02-05', 3, '2025-03-05', 'in_production', 'partial', 'pending', 525000, 94500, 619500],
    ['SO-2025-0004', '2025-02-12', 4, '2025-03-12', 'draft', 'unpaid', 'pending', 95000, 17100, 112100],
    ['SO-2025-0005', '2025-02-20', 5, '2025-03-20', 'confirmed', 'unpaid', 'pending', 220000, 39600, 259600],
  ];
  for (const so of sos) {
    db.prepare(`INSERT INTO sales_orders (order_number, date, customer_id, delivery_date, status, payment_status, delivery_status, subtotal, gst_amount, total_amount) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...so);
  }

  // Create SO items
  db.prepare(`INSERT INTO sales_order_items (order_id, product_id, quantity, rate, gst_rate, amount, delivered_qty) VALUES (1, 1, 500, 750, 18, 375000, 200)`).run();
  db.prepare(`INSERT INTO sales_order_items (order_id, product_id, quantity, rate, gst_rate, amount, delivered_qty) VALUES (2, 3, 600, 300, 18, 180000, 600)`).run();
  db.prepare(`INSERT INTO sales_order_items (order_id, product_id, quantity, rate, gst_rate, amount, delivered_qty) VALUES (3, 5, 300, 1750, 18, 525000, 100)`).run();
  db.prepare(`INSERT INTO sales_order_items (order_id, product_id, quantity, rate, gst_rate, amount, delivered_qty) VALUES (4, 6, 100, 950, 18, 95000, 0)`).run();
  db.prepare(`INSERT INTO sales_order_items (order_id, product_id, quantity, rate, gst_rate, amount, delivered_qty) VALUES (5, 4, 400, 550, 18, 220000, 0)`).run();

  // Create production orders
  const prods = [
    ['PROD-2025-0001', '2025-01-15', 1, 1, 500, 200, 5, 'in_progress', 'normal'],
    ['PROD-2025-0002', '2025-01-22', 2, 3, 600, 600, 0, 'completed', 'normal'],
    ['PROD-2025-0003', '2025-02-08', 3, 5, 300, 100, 2, 'in_progress', 'high'],
    ['PROD-2025-0004', '2025-02-15', null, 6, 100, 0, 0, 'planned', 'normal'],
  ];
  for (const p of prods) {
    db.prepare(`INSERT INTO production_orders (order_number, date, sales_order_id, product_id, planned_quantity, produced_quantity, rejected_quantity, status, priority) VALUES (?,?,?,?,?,?,?,?,?)`).run(...p);
  }

  // Create BOM
  db.prepare(`INSERT INTO boms (bom_number, product_id, version, status, total_cost) VALUES ('BOM-2025-0001', 1, 1, 'active', 420)`).run();
  db.prepare(`INSERT INTO bom_items (bom_id, product_id, quantity, wastage_percent, unit_cost) VALUES (1, 7, 1.5, 3, 280)`).run();
  db.prepare(`INSERT INTO bom_items (bom_id, product_id, quantity, wastage_percent, unit_cost) VALUES (1, 8, 0.1, 1, 45)`).run();

  // Create quality checks
  const qcs = [
    ['QC-2025-0001', '2025-01-20', 1, 1, 3, 100, 95, 3, 'partial'],
    ['QC-2025-0002', '2025-01-25', 2, 3, 3, 200, 198, 0, 'passed'],
    ['QC-2025-0003', '2025-02-10', 3, 5, 3, 100, 85, 5, 'partial'],
  ];
  for (const q of qcs) {
    db.prepare(`INSERT INTO quality_checks (check_number, date, production_order_id, product_id, inspector_id, sample_size, passed_qty, failed_qty, status) VALUES (?,?,?,?,?,?,?,?,?)`).run(...q);
  }

  // Create attendance
  const today = new Date().toISOString().split('T')[0];
  const empStatuses = ['present', 'present', 'present', 'present', 'half_day'];
  for (let i = 0; i < 5; i++) {
    db.prepare(`INSERT INTO attendances (employee_id, date, status, check_in, check_out) VALUES (?, ?, ?, ?, ?)`).run(i + 1, today, empStatuses[i], '09:00:00', '18:00:00');
  }

  // Create salary slips
  const months = [1, 2];
  for (const m of months) {
    for (let e = 0; e < 5; e++) {
      const basic = employees[e][10];
      const hra = basic * 0.2;
      const da = basic * 0.1;
      const gross = basic + hra + da;
      const pf = basic * 0.12;
      const esi = basic * 0.0075;
      const tds = basic > 30000 ? basic * 0.1 : 0;
      const net = gross - pf - esi - tds;
      db.prepare(`INSERT INTO salary_slips (slip_number, employee_id, month, year, basic_salary, hra, allowances, gross_salary, pf_deduction, esi_deduction, tds_deduction, net_salary, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        `SLIP-${m}-${String(e+1).padStart(3,'0')}`, e + 1, m, 2025, basic, hra, da, gross, pf, esi, tds, net, m === 1 ? 'paid' : 'draft'
      );
    }
  }

  // Create accounts
  const accounts = [
    ['1001', 'Cash In Hand', 'asset', 50000],
    ['1002', 'Bank Account - HDFC', 'asset', 2500000],
    ['1003', 'Accounts Receivable', 'asset', 0],
    ['1004', 'Inventory', 'asset', 0],
    ['2001', 'Accounts Payable', 'liability', 0],
    ['2002', 'GST Payable', 'liability', 0],
    ['2003', 'TDS Payable', 'liability', 0],
    ['3001', 'Capital', 'equity', 10000000],
    ['4001', 'Sales Revenue', 'income', 0],
    ['4002', 'Service Revenue', 'income', 0],
    ['5001', 'Cost of Goods Sold', 'expense', 0],
    ['5002', 'Salary Expense', 'expense', 0],
    ['5003', 'Rent Expense', 'expense', 0],
    ['5004', 'Utilities Expense', 'expense', 0],
    ['5005', 'Office Supplies', 'expense', 0],
  ];
  for (const a of accounts) {
    db.prepare(`INSERT INTO accounts (code, name, account_type, parent_id, is_group, opening_balance) VALUES (?,?,?,NULL,0,?)`).run(...a);
  }

  // Create styles
  db.prepare(`INSERT INTO styles (code, name, category_name) VALUES ('STY001', 'Classic Fit', 'Shirts')`).run();
  db.prepare(`INSERT INTO styles (code, name, category_name) VALUES ('STY002', 'Slim Fit', 'Shirts')`).run();
  db.prepare(`INSERT INTO styles (code, name, category_name) VALUES ('STY003', 'Regular Fit', 'Trousers')`).run();

  // Create designs
  db.prepare(`INSERT INTO designs (code, name, style_name) VALUES ('DSN001', 'Solid Plain', 'Classic Fit')`).run();
  db.prepare(`INSERT INTO designs (code, name, style_name) VALUES ('DSN002', 'Check Pattern', 'Classic Fit')`).run();
  db.prepare(`INSERT INTO designs (code, name, style_name) VALUES ('DSN003', 'Stripe Pattern', 'Slim Fit')`).run();

  // Create seasons
  db.prepare(`INSERT INTO seasons (name, code, year, start_date, end_date) VALUES ('Summer 2025', 'SUM25', 2025, '2025-03-01', '2025-06-30')`).run();
  db.prepare(`INSERT INTO seasons (name, code, year, start_date, end_date) VALUES ('Winter 2025', 'WIN25', 2025, '2025-10-01', '2026-01-31')`).run();

  // Create job work orders
  db.prepare(`INSERT INTO job_work_orders (order_number, date, party_name, job_type, status) VALUES ('JW-2025-0001', '2025-02-01', 'Raymond Finishing', 'printing', 'in_progress')`).run();
  db.prepare(`INSERT INTO job_work_orders (order_number, date, party_name, job_type, status) VALUES ('JW-2025-0002', '2025-02-10', 'Art Prints Mumbai', 'embroidery', 'draft')`).run();
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function authMiddleware(req, res, next) {
  // Skip auth for login, register, health, and static files
  if (req.path.startsWith('/api/v1/auth/login') || 
      req.path.startsWith('/api/v1/auth/register') || 
      req.path === '/api/health' ||
      !req.path.startsWith('/api/')) {
    return next();
  }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ detail: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ detail: 'Invalid token' });
  }
}

// Serve static files first (before auth)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

// Apply auth middleware only to API routes
app.use('/api', (req, res, next) => {
  const fullPath = '/api' + req.path;
  // Skip auth for login, register, health
  if (fullPath.startsWith('/api/v1/auth/login') || 
      fullPath.startsWith('/api/v1/auth/register') || 
      fullPath === '/api/health') {
    return next();
  }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ detail: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ detail: 'Invalid token' });
  }
});

// ============================================================
// GENERIC CRUD HELPERS
// ============================================================
function paginate(req, table, searchFields = ['name'], extraWhere = '') {
  const { search = '', page = 1, per_page = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = `is_deleted = 0`;
  const params = [];
  if (search) {
    const searchClauses = searchFields.map(f => `${f} LIKE ?`).join(' OR ');
    where += ` AND (${searchClauses})`;
    searchFields.forEach(() => params.push(`%${search}%`));
  }
  if (extraWhere) where += ` AND ${extraWhere}`;

  const total = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE ${where}`).get(...params).count;
  const data = db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, Number(per_page), offset);
  return { data, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) };
}

function genericList(req, res, table, searchFields = ['name']) {
  try {
    const result = paginate(req, table, searchFields);
    res.json(result);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
}

function genericCreate(req, res, table, extraFields = {}) {
  try {
    const fields = { ...req.body, ...extraFields };
    const keys = Object.keys(fields);
    const vals = Object.values(fields);
    const placeholders = keys.map(() => '?').join(', ');
    const result = db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...vals);
    const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
}

function genericUpdate(req, res, table) {
  try {
    const { id } = req.params;
    const fields = req.body;
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const vals = [...Object.values(fields), id];
    db.prepare(`UPDATE ${table} SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
    const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    res.json(item);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
}

function genericDelete(req, res, table) {
  try {
    const { id } = req.params;
    db.prepare(`UPDATE ${table} SET is_deleted = 1, is_active = 0 WHERE id = ?`).run(id);
    res.json({ message: 'Deleted successfully' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
}

function crudRoutes(path, table, searchFields = ['name']) {
  const router = express.Router();
  router.get('/', (req, res) => genericList(req, res, table, searchFields));
  router.post('/', (req, res) => genericCreate(req, res, table));
  router.put('/:id', (req, res) => genericUpdate(req, res, table));
  router.delete('/:id', (req, res) => genericDelete(req, res, table));
  app.use(path, router);
}

// ============================================================
// AUTH ROUTES
// ============================================================
app.post('/api/v1/auth/login', (req, res) => {
  console.log('LOGIN HIT:', req.body);
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({ detail: 'Email and password are required' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ detail: 'No account found with this email address' });
  }
  if (!user.is_active) {
    return res.status(403).json({ detail: 'Account is deactivated. Contact administrator.' });
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ detail: 'Incorrect password. Please try again.' });
  }

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role, full_name: user.full_name }, JWT_SECRET, { expiresIn: '24h' });
  const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ access_token: token, refresh_token: refresh, token_type: 'bearer' });
});

app.post('/api/v1/auth/register', (req, res) => {
  const { email, username, password, full_name, phone } = req.body;
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`INSERT INTO users (email, username, password_hash, full_name, phone, role) VALUES (?,?,?,?,?,'operator')`).run(email, username, hash, full_name, phone || null);
    res.status(201).json({ id: result.lastInsertRowid, email, username, full_name, role: 'operator' });
  } catch (e) {
    res.status(409).json({ detail: e.message });
  }
});

app.post('/api/v1/auth/refresh', (req, res) => {
  try {
    const { refresh_token } = req.body;
    const decoded = jwt.verify(refresh_token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
    if (!user) return res.status(401).json({ detail: 'User not found' });
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role, full_name: user.full_name }, JWT_SECRET, { expiresIn: '24h' });
    const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ access_token: token, refresh_token: refresh, token_type: 'bearer' });
  } catch (e) {
    res.status(401).json({ detail: 'Invalid refresh token' });
  }
});

app.get('/api/v1/auth/me', (req, res) => {
  const user = db.prepare('SELECT id, email, username, full_name, phone, role, avatar_url, is_active, is_verified, created_at FROM users WHERE id = ?').get(req.user.sub);
  if (!user) return res.status(404).json({ detail: 'User not found' });
  res.json(user);
});

// ============================================================
// DASHBOARD ROUTES
// ============================================================
app.get('/api/v1/dashboard/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const todaySales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as val FROM sales_orders WHERE date = ? AND is_deleted = 0`).get(today).val;
  const todayProd = db.prepare(`SELECT COALESCE(SUM(produced_quantity),0) as val FROM production_orders WHERE date = ? AND is_deleted = 0`).get(today).val;
  const pendingOrders = db.prepare(`SELECT COUNT(*) as val FROM sales_orders WHERE status IN ('draft','confirmed','in_production') AND is_deleted = 0`).get().val;
  const lowStock = db.prepare(`SELECT COUNT(*) as val FROM products WHERE is_deleted = 0 AND reorder_level > 0 AND is_track_inventory = 1`).get().val;
  const totalRevenue = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as val FROM sales_orders WHERE is_deleted = 0`).get().val;
  const totalCustomers = db.prepare(`SELECT COUNT(*) as val FROM customers WHERE is_deleted = 0`).get().val;
  const totalProducts = db.prepare(`SELECT COUNT(*) as val FROM products WHERE is_deleted = 0`).get().val;
  const totalEmp = db.prepare(`SELECT COUNT(*) as val FROM employees WHERE is_deleted = 0 AND is_active = 1`).get().val;

  const totalProdOrders = db.prepare(`SELECT COUNT(*) as val FROM production_orders WHERE is_deleted = 0`).get().val;
  const completedProd = db.prepare(`SELECT COUNT(*) as val FROM production_orders WHERE status = 'completed' AND is_deleted = 0`).get().val;
  const prodEfficiency = totalProdOrders > 0 ? (completedProd / totalProdOrders * 100) : 0;

  res.json({
    today_sales: Number(todaySales),
    today_production: Number(todayProd),
    pending_orders: pendingOrders,
    low_stock_items: lowStock,
    total_revenue: Number(totalRevenue),
    production_efficiency: Math.round(prodEfficiency * 10) / 10,
    total_customers: totalCustomers,
    total_products: totalProducts,
    total_employees: totalEmp,
    machine_utilization: totalProdOrders > 0 ? Math.round((completedProd / totalProdOrders) * 100) : 0,
    pending_purchase_orders: db.prepare(`SELECT COUNT(*) as val FROM purchase_orders WHERE status IN ('draft','confirmed') AND is_deleted = 0`).get().val,
    pending_delivery: db.prepare(`SELECT COUNT(*) as val FROM sales_orders WHERE delivery_status = 'pending' AND is_deleted = 0`).get().val,
  });
});

app.get('/api/v1/dashboard/charts', (req, res) => {
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const revenue = months.map((m, i) => ({
    month: m,
    revenue: Math.floor(50000 + Math.random() * 150000),
    target: 150000,
  }));
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const production = days.map(d => ({
    day: d,
    produced: Math.floor(100 + Math.random() * 200),
    target: 250,
  }));
  const topCustomers = db.prepare(`
    SELECT c.id, c.name, COUNT(so.id) as total_orders, COALESCE(SUM(so.total_amount),0) as total_amount
    FROM customers c LEFT JOIN sales_orders so ON so.customer_id = c.id AND so.is_deleted = 0
    WHERE c.is_deleted = 0 GROUP BY c.id ORDER BY total_amount DESC LIMIT 5
  `).all();
  const topProducts = db.prepare(`
    SELECT p.id, p.name, p.sku, COALESCE(SUM(soi.quantity),0) as sold_quantity, COALESCE(SUM(soi.amount),0) as revenue
    FROM products p LEFT JOIN sales_order_items soi ON soi.product_id = p.id
    WHERE p.is_deleted = 0 GROUP BY p.id ORDER BY revenue DESC LIMIT 5
  `).all();
  const machineStatus = {
    running: db.prepare(`SELECT COUNT(*) as c FROM machines WHERE status = 'running' AND is_deleted = 0`).get().c,
    idle: db.prepare(`SELECT COUNT(*) as c FROM machines WHERE status = 'idle' AND is_deleted = 0`).get().c,
    maintenance: db.prepare(`SELECT COUNT(*) as c FROM machines WHERE status = 'maintenance' AND is_deleted = 0`).get().c,
    broken: db.prepare(`SELECT COUNT(*) as c FROM machines WHERE status = 'broken' AND is_deleted = 0`).get().c,
  };
  const recentActivities = [
    { id: 1, type: 'sale', description: 'Sales order SO-2025-0005 created', timestamp: new Date().toISOString() },
    { id: 2, type: 'production', description: 'Production order PROD-2025-0003 updated', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: 3, type: 'purchase', description: 'Purchase order PO-2025-0004 confirmed', timestamp: new Date(Date.now() - 7200000).toISOString() },
    { id: 4, type: 'quality', description: 'Quality check QC-2025-0003 completed', timestamp: new Date(Date.now() - 10800000).toISOString() },
    { id: 5, type: 'inventory', description: 'Stock received for SKU-RM001', timestamp: new Date(Date.now() - 14400000).toISOString() },
  ];
  res.json({ revenue, production, top_customers: topCustomers, top_products: topProducts, recent_activities: recentActivities, machine_status: machineStatus });
});

// ============================================================
// MASTER CRUD ROUTES
// ============================================================
crudRoutes('/api/v1/categories', 'product_categories', ['name', 'code', 'description']);
crudRoutes('/api/v1/brands', 'brands', ['name', 'code', 'description']);
crudRoutes('/api/v1/styles', 'styles', ['name', 'code', 'category_name']);
crudRoutes('/api/v1/designs', 'designs', ['name', 'code', 'style_name']);
crudRoutes('/api/v1/seasons', 'seasons', ['name', 'code']);
crudRoutes('/api/v1/fabrics', 'fabrics', ['name', 'code', 'composition']);
crudRoutes('/api/v1/colors', 'colors', ['name', 'code', 'hex_code', 'pantone_ref']);
crudRoutes('/api/v1/sizes', 'sizes', ['name', 'code', 'size_group']);
crudRoutes('/api/v1/units', 'units', ['name', 'code', 'abbreviation']);
crudRoutes('/api/v1/warehouses', 'warehouses', ['name', 'code', 'address', 'city', 'state']);
crudRoutes('/api/v1/machines', 'machines', ['name', 'code', 'machine_type', 'model']);
crudRoutes('/api/v1/customers', 'customers', ['name', 'code', 'contact_person', 'phone', 'email', 'city', 'state']);
crudRoutes('/api/v1/vendors', 'vendors', ['name', 'code', 'contact_person', 'phone', 'email', 'city', 'state']);
crudRoutes('/api/v1/employees', 'employees', ['full_name', 'code', 'designation', 'department', 'phone', 'email']);
crudRoutes('/api/v1/products', 'products', ['name', 'sku', 'description']);

// ============================================================
// INVENTORY ROUTES
// ============================================================
app.get('/api/v1/inventory/stock', (req, res) => {
  const { search = '', warehouse_id, low_stock } = req.query;
  let where = 'sb.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (warehouse_id && warehouse_id !== 'all') { where += ' AND sb.warehouse_id = ?'; params.push(warehouse_id); }

  const rows = db.prepare(`
    SELECT sb.id, sb.product_id, p.name as product_name, p.sku, sb.warehouse_id, w.name as warehouse_name,
           sb.batch_number as batch, sb.quantity, sb.reserved_quantity, sb.damaged_quantity, sb.avg_cost,
           (sb.quantity * sb.avg_cost) as value, p.min_stock_level,
           (sb.quantity - sb.reserved_quantity) as available
    FROM stock_balance sb
    JOIN products p ON p.id = sb.product_id
    JOIN warehouses w ON w.id = sb.warehouse_id
    WHERE ${where}
    ORDER BY p.name
  `).all(...params);

  let filtered = rows;
  if (low_stock === 'true') {
    filtered = rows.filter(r => r.min_stock_level > 0 && r.available <= r.min_stock_level);
  }

  res.json({
    data: filtered,
    total: filtered.length,
    page: 1,
    per_page: 50,
    total_pages: 1,
  });
});

app.post('/api/v1/inventory/stock-in', (req, res) => {
  const { product_id, warehouse_id, quantity, rate, batch, notes } = req.body;
  // Update or create stock balance
  const existing = db.prepare('SELECT * FROM stock_balance WHERE product_id = ? AND warehouse_id = ? AND batch_number = ?').get(product_id, warehouse_id, batch || null);
  if (existing) {
    const newQty = Number(existing.quantity) + Number(quantity);
    const newAvgCost = (Number(existing.avg_cost) * Number(existing.quantity) + Number(rate) * Number(quantity)) / newQty;
    db.prepare('UPDATE stock_balance SET quantity = ?, avg_cost = ?, last_movement_date = datetime(\'now\') WHERE id = ?').run(newQty, newAvgCost, existing.id);
  } else {
    db.prepare('INSERT INTO stock_balance (product_id, warehouse_id, batch_number, quantity, avg_cost, last_movement_date) VALUES (?,?,?,0,?,datetime(\'now\'))').run(product_id, warehouse_id, batch || null, quantity, rate || 0);
  }
  db.prepare('INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, quantity, unit_cost, batch_number, remarks) VALUES (?,?,?,?,?,?)').run(product_id, warehouse_id, 'in', quantity, rate || 0, batch || null, notes || '');
  res.json({ message: 'Stock received successfully' });
});

app.post('/api/v1/inventory/stock-out', (req, res) => {
  const { product_id, warehouse_id, quantity, notes } = req.body;
  const existing = db.prepare('SELECT * FROM stock_balance WHERE product_id = ? AND warehouse_id = ?').get(product_id, warehouse_id);
  if (existing && Number(existing.quantity) >= Number(quantity)) {
    db.prepare('UPDATE stock_balance SET quantity = quantity - ?, last_movement_date = datetime(\'now\') WHERE id = ?').run(quantity, existing.id);
  }
  db.prepare('INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, quantity, remarks) VALUES (?,?,?,?,?)').run(product_id, warehouse_id, 'out', quantity, notes || '');
  res.json({ message: 'Stock issued successfully' });
});

app.post('/api/v1/inventory/transfer', (req, res) => {
  const { product_id, from_warehouse_id, to_warehouse_id, quantity, notes } = req.body;
  const src = db.prepare('SELECT * FROM stock_balance WHERE product_id = ? AND warehouse_id = ?').get(product_id, from_warehouse_id);
  if (src && Number(src.quantity) >= Number(quantity)) {
    db.prepare('UPDATE stock_balance SET quantity = quantity - ?, last_movement_date = datetime(\'now\') WHERE id = ?').run(quantity, src.id);
    const dst = db.prepare('SELECT * FROM stock_balance WHERE product_id = ? AND warehouse_id = ?').get(product_id, to_warehouse_id);
    if (dst) {
      db.prepare('UPDATE stock_balance SET quantity = quantity + ?, last_movement_date = datetime(\'now\') WHERE id = ?').run(quantity, dst.id);
    } else {
      db.prepare('INSERT INTO stock_balance (product_id, warehouse_id, quantity, avg_cost, last_movement_date) VALUES (?,?,?,  ?, datetime(\'now\'))').run(product_id, to_warehouse_id, quantity, src.avg_cost);
    }
  }
  db.prepare('INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, quantity, remarks) VALUES (?,?,?,?,?)').run(product_id, from_warehouse_id, 'transfer', quantity, notes || '');
  res.json({ message: 'Stock transferred successfully' });
});

app.get('/api/v1/inventory/ledger', (req, res) => {
  const rows = db.prepare(`
    SELECT sl.*, p.name as product_name, p.sku, w.name as warehouse_name
    FROM stock_ledger sl
    JOIN products p ON p.id = sl.product_id
    JOIN warehouses w ON w.id = sl.warehouse_id
    WHERE sl.is_deleted = 0
    ORDER BY sl.created_at DESC LIMIT 100
  `).all();
  res.json({ data: rows, total: rows.length, page: 1, per_page: 100, total_pages: 1 });
});

app.get('/api/v1/inventory/movements', (req, res) => {
  const rows = db.prepare(`
    SELECT sl.*, p.name as product_name, w.name as warehouse_name
    FROM stock_ledger sl JOIN products p ON p.id = sl.product_id JOIN warehouses w ON w.id = sl.warehouse_id
    WHERE sl.is_deleted = 0 ORDER BY sl.created_at DESC LIMIT 100
  `).all();
  res.json({ data: rows, total: rows.length, page: 1, per_page: 100, total_pages: 1 });
});

// ============================================================
// PURCHASE ORDERS ROUTES
// ============================================================
app.get('/api/v1/purchase-orders', (req, res) => {
  const { search = '', page = 1, per_page = 20, status, vendor_id } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'po.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (po.order_number LIKE ? OR v.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status && status !== 'all') { where += ' AND po.status = ?'; params.push(status); }
  if (vendor_id && vendor_id !== 'all') { where += ' AND po.vendor_id = ?'; params.push(vendor_id); }

  const total = db.prepare(`SELECT COUNT(*) as c FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`
    SELECT po.*, v.name as vendor_name,
    (SELECT COUNT(*) FROM purchase_order_items WHERE order_id = po.id) as items_count
    FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE ${where} ORDER BY po.id DESC LIMIT ? OFFSET ?
  `).all(...params, Number(per_page), offset);

  const data = rows.map(r => ({
    ...r,
    items: db.prepare('SELECT poi.*, p.name as product_name FROM purchase_order_items poi LEFT JOIN products p ON p.id = poi.product_id WHERE poi.order_id = ?').all(r.id),
  }));

  res.json({ data, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/purchase-orders', (req, res) => {
  const { vendor_id, date, delivery_date, notes, terms, items } = req.body;
  const orderNum = `PO-2025-${String(db.prepare('SELECT COUNT(*) as c FROM purchase_orders').get().c + 1).padStart(4, '0')}`;
  let subtotal = 0, gstAmt = 0;
  (items || []).forEach(it => { subtotal += Number(it.amount || 0); gstAmt += (Number(it.amount || 0) * Number(it.gst_rate || 0)) / 100; });
  const total = subtotal + gstAmt;
  const result = db.prepare(`INSERT INTO purchase_orders (order_number, date, vendor_id, delivery_date, notes, terms, status, subtotal, gst_amount, total_amount) VALUES (?,?,?,?,?,?, 'draft',?,?,?)`).run(orderNum, date, vendor_id, delivery_date || null, notes || '', terms || '', subtotal, gstAmt, total);
  const poId = result.lastInsertRowid;
  (items || []).forEach(it => {
    db.prepare(`INSERT INTO purchase_order_items (order_id, product_id, quantity, rate, gst_rate, discount_percent, amount) VALUES (?,?,?,?,?,?,?)`).run(poId, it.product_id, it.quantity, it.rate, it.gst_rate || 0, it.discount_percent || 0, it.amount || 0);
  });
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
  res.status(201).json({ ...po, items: db.prepare('SELECT * FROM purchase_order_items WHERE order_id = ?').all(poId) });
});

app.put('/api/v1/purchase-orders/:id', (req, res) => {
  const { id } = req.params;
  const { vendor_id, date, delivery_date, notes, terms, items } = req.body;
  db.prepare(`UPDATE purchase_orders SET vendor_id=?, date=?, delivery_date=?, notes=?, terms=?, updated_at=datetime('now') WHERE id=?`).run(vendor_id, date, delivery_date || null, notes || '', terms || '', id);
  if (items) {
    db.prepare('DELETE FROM purchase_order_items WHERE order_id = ?').run(id);
    items.forEach(it => {
      db.prepare(`INSERT INTO purchase_order_items (order_id, product_id, quantity, rate, gst_rate, discount_percent, amount) VALUES (?,?,?,?,?,?,?)`).run(id, it.product_id, it.quantity, it.rate, it.gst_rate || 0, it.discount_percent || 0, it.amount || 0);
    });
  }
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
  res.json({ ...po, items: db.prepare('SELECT * FROM purchase_order_items WHERE order_id = ?').all(id) });
});

app.patch('/api/v1/purchase-orders/:id/submit', (req, res) => {
  db.prepare(`UPDATE purchase_orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Order confirmed' });
});

app.delete('/api/v1/purchase-orders/:id', (req, res) => {
  db.prepare(`UPDATE purchase_orders SET is_deleted = 1 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ============================================================
// SALES ORDERS ROUTES
// ============================================================
app.get('/api/v1/sales-orders', (req, res) => {
  const { search = '', page = 1, per_page = 20, status } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'so.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (so.order_number LIKE ? OR c.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status && status !== 'all') { where += ' AND so.status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as c FROM sales_orders so LEFT JOIN customers c ON c.id = so.customer_id WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`
    SELECT so.*, c.name as customer_name,
    (SELECT COUNT(*) FROM sales_order_items WHERE order_id = so.id) as items_count
    FROM sales_orders so LEFT JOIN customers c ON c.id = so.customer_id
    WHERE ${where} ORDER BY so.id DESC LIMIT ? OFFSET ?
  `).all(...params, Number(per_page), offset);

  const data = rows.map(r => ({
    ...r,
    items: db.prepare('SELECT soi.*, p.name as product_name FROM sales_order_items soi LEFT JOIN products p ON p.id = soi.product_id WHERE soi.order_id = ?').all(r.id),
  }));

  res.json({ data, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/sales-orders', (req, res) => {
  const { customer_id, date, delivery_date, notes, terms, items } = req.body;
  const orderNum = `SO-2025-${String(db.prepare('SELECT COUNT(*) as c FROM sales_orders').get().c + 1).padStart(4, '0')}`;
  let subtotal = 0, gstAmt = 0;
  (items || []).forEach(it => { subtotal += Number(it.amount || 0); gstAmt += (Number(it.amount || 0) * Number(it.gst_rate || 0)) / 100; });
  const total = subtotal + gstAmt;
  const result = db.prepare(`INSERT INTO sales_orders (order_number, date, customer_id, delivery_date, notes, terms, status, subtotal, gst_amount, total_amount) VALUES (?,?,?,?,?,?, 'draft',?,?,?)`).run(orderNum, date, customer_id, delivery_date || null, notes || '', terms || '', subtotal, gstAmt, total);
  const soId = result.lastInsertRowid;
  (items || []).forEach(it => {
    db.prepare(`INSERT INTO sales_order_items (order_id, product_id, quantity, rate, gst_rate, discount_percent, amount, color, size, style) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(soId, it.product_id, it.quantity, it.rate, it.gst_rate || 0, it.discount_percent || 0, it.amount || 0, it.color || '', it.size || '', it.style || '');
  });
  const so = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(soId);
  res.status(201).json({ ...so, items: db.prepare('SELECT * FROM sales_order_items WHERE order_id = ?').all(soId) });
});

app.put('/api/v1/sales-orders/:id', (req, res) => {
  const { id } = req.params;
  const { customer_id, date, delivery_date, notes, terms, items } = req.body;
  db.prepare(`UPDATE sales_orders SET customer_id=?, date=?, delivery_date=?, notes=?, terms=?, updated_at=datetime('now') WHERE id=?`).run(customer_id, date, delivery_date || null, notes || '', terms || '', id);
  if (items) {
    db.prepare('DELETE FROM sales_order_items WHERE order_id = ?').run(id);
    items.forEach(it => {
      db.prepare(`INSERT INTO sales_order_items (order_id, product_id, quantity, rate, gst_rate, discount_percent, amount, color, size, style) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, it.product_id, it.quantity, it.rate, it.gst_rate || 0, it.discount_percent || 0, it.amount || 0, it.color || '', it.size || '', it.style || '');
    });
  }
  res.json(db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(id));
});

app.patch('/api/v1/sales-orders/:id/submit', (req, res) => {
  db.prepare(`UPDATE sales_orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Order confirmed' });
});

app.patch('/api/v1/sales-orders/:id/cancel', (req, res) => {
  db.prepare(`UPDATE sales_orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Order cancelled' });
});

app.delete('/api/v1/sales-orders/:id', (req, res) => {
  db.prepare(`UPDATE sales_orders SET is_deleted = 1 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ============================================================
// PRODUCTION, BOM, QUALITY, JOB WORK, PAYROLL, ACCOUNTING, REPORTS
// ============================================================
// Production Orders
app.get('/api/v1/production-orders', (req, res) => {
  const { search = '', page = 1, per_page = 20, status } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'po.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (po.order_number LIKE ? OR p.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status && status !== 'all') { where += ' AND po.status = ?'; params.push(status); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM production_orders po LEFT JOIN products p ON p.id = po.product_id WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT po.*, p.name as product_name FROM production_orders po LEFT JOIN products p ON p.id = po.product_id WHERE ${where} ORDER BY po.id DESC LIMIT ? OFFSET ?`).all(...params, Number(per_page), offset);
  res.json({ data: rows, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/production-orders', (req, res) => {
  const { product_id, planned_quantity, date, sales_order_id, priority, remarks, start_date, end_date } = req.body;
  const num = `PROD-2025-${String(db.prepare('SELECT COUNT(*) as c FROM production_orders').get().c + 1).padStart(4, '0')}`;
  const result = db.prepare(`INSERT INTO production_orders (order_number, date, product_id, planned_quantity, sales_order_id, priority, remarks, start_date, end_date, status) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(num, date || new Date().toISOString().split('T')[0], product_id, planned_quantity, sales_order_id || null, priority || 'normal', remarks || '', start_date || null, end_date || null, 'planned');
  res.status(201).json(db.prepare('SELECT * FROM production_orders WHERE id = ?').get(result.lastInsertRowid));
});

app.patch('/api/v1/production-orders/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare(`UPDATE production_orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
  res.json({ message: 'Status updated' });
});

app.delete('/api/v1/production-orders/:id', (req, res) => {
  db.prepare(`UPDATE production_orders SET is_deleted = 1 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Deleted' });
});

// BOM
app.get('/api/v1/boms', (req, res) => {
  const { search = '', page = 1, per_page = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'b.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (b.bom_number LIKE ? OR p.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM boms b LEFT JOIN products p ON p.id = b.product_id WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT b.*, p.name as product_name FROM boms b LEFT JOIN products p ON p.id = b.product_id WHERE ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`).all(...params, Number(per_page), offset);
  res.json({ data: rows, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/boms', (req, res) => {
  const { product_id, items, remarks } = req.body;
  const num = `BOM-2025-${String(db.prepare('SELECT COUNT(*) as c FROM boms').get().c + 1).padStart(4, '0')}`;
  const result = db.prepare(`INSERT INTO boms (bom_number, product_id, status, remarks) VALUES (?,?,?,?)`).run(num, product_id, 'draft', remarks || '');
  const bomId = result.lastInsertRowid;
  (items || []).forEach(it => {
    db.prepare(`INSERT INTO bom_items (bom_id, product_id, quantity, wastage_percent, unit_cost) VALUES (?,?,?,?,?)`).run(bomId, it.product_id, it.quantity, it.wastage_percent || 0, it.unit_cost || 0);
  });
  res.status(201).json(db.prepare('SELECT * FROM boms WHERE id = ?').get(bomId));
});

app.delete('/api/v1/boms/:id', (req, res) => {
  db.prepare(`UPDATE boms SET is_deleted = 1 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Quality Checks
app.get('/api/v1/quality-checks', (req, res) => {
  const { search = '', page = 1, per_page = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'qc.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (qc.check_number LIKE ? OR p.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM quality_checks qc LEFT JOIN products p ON p.id = qc.product_id WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT qc.*, p.name as product_name, e.full_name as inspector_name FROM quality_checks qc LEFT JOIN products p ON p.id = qc.product_id LEFT JOIN employees e ON e.id = qc.inspector_id WHERE ${where} ORDER BY qc.id DESC LIMIT ? OFFSET ?`).all(...params, Number(per_page), offset);
  res.json({ data: rows, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/quality-checks', (req, res) => {
  const num = `QC-2025-${String(db.prepare('SELECT COUNT(*) as c FROM quality_checks').get().c + 1).padStart(4, '0')}`;
  const { date, product_id, production_order_id, inspector_id, sample_size, passed_qty, failed_qty, status, remarks } = req.body;
  const result = db.prepare(`INSERT INTO quality_checks (check_number, date, product_id, production_order_id, inspector_id, sample_size, passed_qty, failed_qty, status, remarks) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(num, date, product_id || null, production_order_id || null, inspector_id || null, sample_size, passed_qty || 0, failed_qty || 0, status || 'pending', remarks || '');
  res.status(201).json(db.prepare('SELECT * FROM quality_checks WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/v1/quality-checks/:id', (req, res) => {
  db.prepare(`UPDATE quality_checks SET is_deleted = 1 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Job Work
app.get('/api/v1/job-work-orders', (req, res) => {
  const { search = '', page = 1, per_page = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'jw.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (jw.order_number LIKE ? OR jw.party_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM job_work_orders jw WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM job_work_orders jw WHERE ${where} ORDER BY jw.id DESC LIMIT ? OFFSET ?`).all(...params, Number(per_page), offset);
  res.json({ data: rows, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/job-work-orders', (req, res) => {
  const num = `JW-2025-${String(db.prepare('SELECT COUNT(*) as c FROM job_work_orders').get().c + 1).padStart(4, '0')}`;
  const { date, party_name, job_type, notes } = req.body;
  const result = db.prepare(`INSERT INTO job_work_orders (order_number, date, party_name, job_type, notes, status) VALUES (?,?,?,?,?,'draft')`).run(num, date, party_name, job_type || '', notes || '');
  res.status(201).json(db.prepare('SELECT * FROM job_work_orders WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/v1/job-work-orders/:id', (req, res) => {
  db.prepare(`UPDATE job_work_orders SET is_deleted = 1 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Attendance
app.get('/api/v1/attendance', (req, res) => {
  const { search = '', page = 1, per_page = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'a.is_active = 1';
  const params = [];
  if (search) { where += ' AND (e.full_name LIKE ? OR e.code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM attendances a LEFT JOIN employees e ON e.id = a.employee_id WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT a.*, e.full_name as employee_name, e.code as employee_code FROM attendances a LEFT JOIN employees e ON e.id = a.employee_id WHERE ${where} ORDER BY a.date DESC, a.id DESC LIMIT ? OFFSET ?`).all(...params, Number(per_page), offset);
  res.json({ data: rows, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/attendance', (req, res) => {
  const { employee_id, date, status, check_in, check_out, overtime_hours, remarks } = req.body;
  const result = db.prepare(`INSERT INTO attendances (employee_id, date, status, check_in, check_out, overtime_hours, remarks) VALUES (?,?,?,?,?,?,?)`).run(employee_id, date, status, check_in || null, check_out || null, overtime_hours || 0, remarks || '');
  res.status(201).json(db.prepare('SELECT * FROM attendances WHERE id = ?').get(result.lastInsertRowid));
});

// Salary Slips
app.get('/api/v1/salary-slips', (req, res) => {
  const { search = '', page = 1, per_page = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'ss.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (ss.slip_number LIKE ? OR e.full_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM salary_slips ss LEFT JOIN employees e ON e.id = ss.employee_id WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT ss.*, e.full_name as employee_name, e.code as employee_code FROM salary_slips ss LEFT JOIN employees e ON e.id = ss.employee_id WHERE ${where} ORDER BY ss.id DESC LIMIT ? OFFSET ?`).all(...params, Number(per_page), offset);
  res.json({ data: rows, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/salary-slips', (req, res) => {
  const num = `SLIP-${req.body.month}-${String(db.prepare('SELECT COUNT(*) as c FROM salary_slips').get().c + 1).padStart(3, '0')}`;
  const { employee_id, month, year, basic_salary, hra, allowances, gross_salary, pf_deduction, esi_deduction, tds_deduction, other_deductions, net_salary, status } = req.body;
  const result = db.prepare(`INSERT INTO salary_slips (slip_number, employee_id, month, year, basic_salary, hra, allowances, gross_salary, pf_deduction, esi_deduction, tds_deduction, other_deductions, net_salary, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(num, employee_id, month, year, basic_salary || 0, hra || 0, allowances || 0, gross_salary || 0, pf_deduction || 0, esi_deduction || 0, tds_deduction || 0, other_deductions || 0, net_salary || 0, status || 'draft');
  res.status(201).json(db.prepare('SELECT * FROM salary_slips WHERE id = ?').get(result.lastInsertRowid));
});

// Accounts
app.get('/api/v1/accounts', (req, res) => {
  const { search = '' } = req.query;
  let where = 'is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const rows = db.prepare(`SELECT * FROM accounts WHERE ${where} ORDER BY code`).all(...params);
  res.json({ data: rows, total: rows.length, page: 1, per_page: 100, total_pages: 1 });
});

app.post('/api/v1/accounts', (req, res) => genericCreate(req, res, 'accounts'));
app.put('/api/v1/accounts/:id', (req, res) => genericUpdate(req, res, 'accounts'));
app.delete('/api/v1/accounts/:id', (req, res) => genericDelete(req, res, 'accounts'));

// Journal Entries
app.get('/api/v1/journal-entries', (req, res) => {
  const { search = '', page = 1, per_page = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(per_page);
  let where = 'je.is_deleted = 0';
  const params = [];
  if (search) { where += ' AND (je.entry_number LIKE ? OR je.narration LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM journal_entries je WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM journal_entries je WHERE ${where} ORDER BY je.id DESC LIMIT ? OFFSET ?`).all(...params, Number(per_page), offset);
  const data = rows.map(r => ({
    ...r,
    lines: db.prepare('SELECT jel.*, a.name as account_name FROM journal_entry_lines jel LEFT JOIN accounts a ON a.id = jel.account_id WHERE jel.entry_id = ?').all(r.id),
  }));
  res.json({ data, total, page: Number(page), per_page: Number(per_page), total_pages: Math.ceil(total / Number(per_page)) });
});

app.post('/api/v1/journal-entries', (req, res) => {
  const num = `JRN-${String(db.prepare('SELECT COUNT(*) as c FROM journal_entries').get().c + 1).padStart(4, '0')}`;
  const { date, narration, lines } = req.body;
  let totalDebit = 0, totalCredit = 0;
  (lines || []).forEach(l => { totalDebit += Number(l.debit || 0); totalCredit += Number(l.credit || 0); });
  const result = db.prepare(`INSERT INTO journal_entries (entry_number, date, narration, status, total_debit, total_credit) VALUES (?,?,?,?,?,?)`).run(num, date, narration || '', 'draft', totalDebit, totalCredit);
  const jeId = result.lastInsertRowid;
  (lines || []).forEach(l => {
    db.prepare(`INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES (?,?,?,?,?)`).run(jeId, l.account_id, l.debit || 0, l.credit || 0, l.description || '');
  });
  res.status(201).json(db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(jeId));
});

app.delete('/api/v1/journal-entries/:id', (req, res) => {
  db.prepare(`UPDATE journal_entries SET is_deleted = 1 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Quotations
app.get('/api/v1/quotations', (req, res) => genericList(req, res, 'quotations', ['quotation_number']));
app.post('/api/v1/quotations', (req, res) => genericCreate(req, res, 'quotations', { quotation_number: `QT-${Date.now()}` }));

// Delivery Challans
app.get('/api/v1/delivery-challans', (req, res) => genericList(req, res, 'delivery_challans', ['challan_number']));
app.post('/api/v1/delivery-challans', (req, res) => genericCreate(req, res, 'delivery_challans', { challan_number: `DC-${Date.now()}` }));

// GRN
app.get('/api/v1/grns', (req, res) => genericList(req, res, 'grns', ['grn_number']));
app.post('/api/v1/grns', (req, res) => genericCreate(req, res, 'grns', { grn_number: `GRN-${Date.now()}` }));

// Production Tracking (bundles)
app.get('/api/v1/bundles', (req, res) => {
  res.json({ data: [], total: 0, page: 1, per_page: 20, total_pages: 0 });
});

// Notifications
app.get('/api/v1/notifications', (req, res) => {
  res.json({ data: [], total: 0, page: 1, per_page: 20, total_pages: 0 });
});

// Search
app.get('/api/v1/search', (req, res) => {
  const { q = '' } = req.query;
  const results = [];
  if (q) {
    const products = db.prepare(`SELECT id, name, sku as code, 'product' as type FROM products WHERE (name LIKE ? OR sku LIKE ?) AND is_deleted = 0 LIMIT 5`).all(`%${q}%`, `%${q}%`);
    const customers = db.prepare(`SELECT id, name, code, 'customer' as type FROM customers WHERE (name LIKE ? OR code LIKE ?) AND is_deleted = 0 LIMIT 5`).all(`%${q}%`, `%${q}%`);
    results.push(...products, ...customers);
  }
  res.json(results);
});

// Settings
app.get('/api/v1/company', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE is_deleted = 0 LIMIT 1').get();
  res.json(company || {});
});

app.put('/api/v1/company', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE is_deleted = 0 LIMIT 1').get();
  if (company) {
    const fields = req.body;
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE companies SET ${sets} WHERE id = ?`).run(...Object.values(fields), company.id);
    res.json(db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id));
  } else {
    res.status(404).json({ detail: 'Company not found' });
  }
});

app.get('/api/v1/users', (req, res) => {
  const rows = db.prepare(`SELECT id, email, username, full_name, phone, role, is_active, created_at FROM users ORDER BY id`).all();
  res.json({ data: rows, total: rows.length, page: 1, per_page: 100, total_pages: 1 });
});

// Reports (return basic data)
app.get('/api/v1/reports/:type', (req, res) => {
  res.json({ data: [], total: 0, page: 1, per_page: 20, total_pages: 0, summary: {} });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', version: '1.0.0' });
});

// ============================================================
// SERVE FRONTEND (SPA fallback)
// ============================================================
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ detail: 'Not found' });
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

initDatabase();
seedData();

const server = app.listen(PORT, () => {
  console.log(`MicroERP server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('SERVER ERROR:', err);
});
