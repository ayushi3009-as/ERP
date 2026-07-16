export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  full_name?: string;
  username?: string;
  phone?: string;
  company_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  credit_limit?: number;
  payment_terms_days?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  payment_terms_days?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  employee_code: string;
  name: string;
  email?: string;
  phone?: string;
  designation?: string;
  department?: string;
  date_of_joining?: string;
  basic_salary?: number;
  bank_name?: string;
  bank_account?: string;
  ifsc_code?: string;
  pan?: string;
  aadhaar?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Style {
  id: string;
  name: string;
  description?: string;
  category_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Design {
  id: string;
  name: string;
  description?: string;
  style_id?: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Season {
  id: string;
  name: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Fabric {
  id: string;
  name: string;
  composition?: string;
  gsm?: number;
  width?: number;
  unit_id?: string;
  cost_per_unit?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Color {
  id: string;
  name: string;
  hex_code?: string;
  pantone_ref?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Size {
  id: string;
  name: string;
  sort_order?: number;
  size_group?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: string;
  name: string;
  abbreviation: string;
  unit_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category_id?: string;
  brand_id?: string;
  style_id?: string;
  design_id?: string;
  color_id?: string;
  size_id?: string;
  unit_id?: string;
  cost_price?: number;
  selling_price?: number;
  mrp?: number;
  gst_rate?: number;
  hsn_code?: string;
  min_stock_level?: number;
  max_stock_level?: number;
  reorder_level?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Machine {
  id: string;
  name: string;
  machine_type?: string;
  model?: string;
  serial_number?: string;
  capacity?: string;
  status: 'idle' | 'running' | 'maintenance' | 'broken';
  warehouse_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: 'in' | 'out' | 'transfer' | 'adjustment';
  quantity: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_at: string;
}

export interface StockLedgerEntry {
  id: string;
  product_id: string;
  warehouse_id: string;
  date: string;
  opening_qty: number;
  in_qty: number;
  out_qty: number;
  closing_qty: number;
  rate: number;
  value: number;
  reference_type?: string;
  reference_id?: string;
}

export interface PurchaseIndent {
  id: string;
  indent_number: string;
  date: string;
  requested_by?: string;
  department?: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'converted';
  remarks?: string;
  items: PurchaseIndentItem[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseIndentItem {
  id: string;
  indent_id: string;
  product_id: string;
  quantity: number;
  unit_id?: string;
  remarks?: string;
}

export interface PurchaseOrder {
  id: string;
  order_number: string;
  date: string;
  vendor_id: string;
  status: 'draft' | 'confirmed' | 'partial' | 'received' | 'cancelled';
  payment_terms?: string;
  delivery_date?: string;
  notes?: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  indent_id?: string;
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  rate: number;
  gst_rate?: number;
  amount: number;
  received_qty: number;
  remarks?: string;
}

export interface GRN {
  id: string;
  grn_number: string;
  date: string;
  purchase_order_id: string;
  vendor_id: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  remarks?: string;
  items: GRNItem[];
  created_at: string;
  updated_at: string;
}

export interface GRNItem {
  id: string;
  grn_id: string;
  product_id: string;
  ordered_qty: number;
  received_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  warehouse_id?: string;
  remarks?: string;
}

export interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  date: string;
  vendor_id: string;
  purchase_order_id?: string;
  grn_id?: string;
  status: 'draft' | 'posted' | 'paid' | 'partial' | 'cancelled';
  due_date?: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  paid_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SalesQuotation {
  id: string;
  quotation_number: string;
  date: string;
  customer_id: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted' | 'expired';
  valid_until?: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  notes?: string;
  items: SalesQuotationItem[];
  created_at: string;
  updated_at: string;
}

export interface SalesQuotationItem {
  id: string;
  quotation_id: string;
  product_id: string;
  quantity: number;
  rate: number;
  gst_rate?: number;
  amount: number;
  remarks?: string;
}

export interface SalesOrder {
  id: string;
  order_number: string;
  date: string;
  customer_id: string;
  quotation_id?: string;
  status: 'draft' | 'confirmed' | 'in_production' | 'shipped' | 'delivered' | 'cancelled';
  delivery_date?: string;
  payment_terms?: string;
  notes?: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  items: SalesOrderItem[];
  created_at: string;
  updated_at: string;
}

export interface SalesOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  rate: number;
  gst_rate?: number;
  amount: number;
  delivered_qty: number;
  remarks?: string;
}

export interface DeliveryChallan {
  id: string;
  challan_number: string;
  date: string;
  customer_id: string;
  sales_order_id?: string;
  status: 'draft' | 'dispatched' | 'delivered' | 'cancelled';
  vehicle_number?: string;
  notes?: string;
  items: DeliveryChallanItem[];
  created_at: string;
  updated_at: string;
}

export interface DeliveryChallanItem {
  id: string;
  challan_id: string;
  product_id: string;
  quantity: number;
  remarks?: string;
}

export interface SalesInvoice {
  id: string;
  invoice_number: string;
  date: string;
  customer_id: string;
  sales_order_id?: string;
  challan_id?: string;
  status: 'draft' | 'posted' | 'paid' | 'partial' | 'cancelled';
  due_date?: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  paid_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrder {
  id: string;
  order_number: string;
  date: string;
  sales_order_id?: string;
  product_id: string;
  planned_quantity: number;
  produced_quantity: number;
  rejected_quantity: number;
  status: 'planned' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
  start_date?: string;
  end_date?: string;
  bom_id?: string;
  remarks?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductionTracking {
  id: string;
  production_order_id: string;
  date: string;
  operation: string;
  planned_qty: number;
  completed_qty: number;
  rejected_qty: number;
  machine_id?: string;
  operator_id?: string;
  remarks?: string;
  created_at: string;
}

export interface Bundle {
  id: string;
  bundle_number: string;
  production_order_id: string;
  product_id: string;
  size_id?: string;
  color_id?: string;
  quantity: number;
  status: 'created' | 'cutting' | 'stitching' | 'finishing' | 'completed';
  current_stage?: string;
  created_at: string;
  updated_at: string;
}

export interface BOM {
  id: string;
  bom_number: string;
  product_id: string;
  version: number;
  status: 'draft' | 'active' | 'inactive';
  remarks?: string;
  items: BOMItem[];
  operations: BOMOperation[];
  created_at: string;
  updated_at: string;
}

export interface BOMItem {
  id: string;
  bom_id: string;
  product_id: string;
  quantity: number;
  unit_id?: string;
  wastage_percent?: number;
  remarks?: string;
}

export interface BOMOperation {
  id: string;
  bom_id: string;
  operation_name: string;
  sequence: number;
  machine_type?: string;
  time_in_minutes?: number;
  remarks?: string;
}

export interface QualityCheck {
  id: string;
  check_number: string;
  date: string;
  production_order_id?: string;
  grn_id?: string;
  product_id: string;
  inspector_id?: string;
  sample_size: number;
  passed_qty: number;
  failed_qty: number;
  status: 'pending' | 'passed' | 'failed' | 'partial';
  remarks?: string;
  parameters: QualityCheckParameter[];
  created_at: string;
}

export interface QualityCheckParameter {
  id: string;
  check_id: string;
  parameter_name: string;
  standard_value?: string;
  actual_value?: string;
  status: 'pass' | 'fail' | 'na';
  remarks?: string;
}

export interface JobWorkOrder {
  id: string;
  order_number: string;
  date: string;
  party_name: string;
  job_type: string;
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
  received_items: JobWorkItem[];
  sent_items: JobWorkItem[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface JobWorkItem {
  id: string;
  job_work_order_id: string;
  product_id: string;
  quantity: number;
  rate?: number;
  remarks?: string;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  status: 'present' | 'absent' | 'half_day' | 'leave' | 'holiday';
  check_in?: string;
  check_out?: string;
  overtime_hours?: number;
  remarks?: string;
}

export interface SalarySlip {
  id: string;
  slip_number: string;
  employee_id: string;
  month: number;
  year: number;
  basic_salary: number;
  hra: number;
  allowances: number;
  gross_salary: number;
  pf_deduction: number;
  esi_deduction: number;
  tds_deduction: number;
  other_deductions: number;
  net_salary: number;
  status: 'draft' | 'approved' | 'paid';
  paid_date?: string;
  remarks?: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  parent_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  narration?: string;
  reference_type?: string;
  reference_id?: string;
  status: 'draft' | 'posted' | 'cancelled';
  lines: JournalEntryLine[];
  created_at: string;
  updated_at: string;
}

export interface JournalEntryLine {
  id: string;
  entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface Payment {
  id: string;
  payment_number: string;
  date: string;
  vendor_id?: string;
  account_id: string;
  amount: number;
  payment_mode: 'cash' | 'bank' | 'cheque' | 'upi' | 'neft' | 'rtgs';
  reference_number?: string;
  invoice_id?: string;
  status: 'draft' | 'posted' | 'cancelled';
  notes?: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  date: string;
  customer_id?: string;
  account_id: string;
  amount: number;
  payment_mode: 'cash' | 'bank' | 'cheque' | 'upi' | 'neft' | 'rtgs';
  reference_number?: string;
  invoice_id?: string;
  status: 'draft' | 'posted' | 'cancelled';
  notes?: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
  status_code: number;
}
