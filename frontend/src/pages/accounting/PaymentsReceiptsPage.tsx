import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  AlertCircle,
  Eye,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  FileText,
} from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type { Payment, Receipt, Account, Vendor, Customer, PaginatedResponse } from '@/types';

const paymentSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  vendor_id: z.string(),
  account_id: z.string().min(1, 'Account is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be > 0'),
  payment_mode: z.enum(['cash', 'bank', 'cheque', 'upi', 'neft', 'rtgs']),
  reference_number: z.string(),
  invoice_id: z.string(),
  notes: z.string(),
});

const receiptSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  customer_id: z.string(),
  account_id: z.string().min(1, 'Account is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be > 0'),
  payment_mode: z.enum(['cash', 'bank', 'cheque', 'upi', 'neft', 'rtgs']),
  reference_number: z.string(),
  invoice_id: z.string(),
  notes: z.string(),
});

const contraSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  from_account_id: z.string().min(1, 'From account is required'),
  to_account_id: z.string().min(1, 'To account is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be > 0'),
  notes: z.string(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;
type ReceiptFormData = z.infer<typeof receiptSchema>;
type ContraFormData = z.infer<typeof contraSchema>;

interface PaymentRow extends Payment {
  vendor_name?: string;
  account_name?: string;
}

interface ReceiptRow extends Receipt {
  customer_name?: string;
  account_name?: string;
}

const TABS = ['payments', 'receipts', 'contra'] as const;
type Tab = (typeof TABS)[number];

const PAYMENT_MODES = ['cash', 'bank', 'cheque', 'upi', 'neft', 'rtgs'] as const;
const STATUSES = ['all', 'draft', 'posted', 'cancelled'] as const;

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'posted': return 'success' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'posted': return 'Posted';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

const modeLabel = (mode: string) => mode.charAt(0).toUpperCase() + mode.slice(1).toUpperCase();

export default function PaymentsReceiptsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('payments');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [contraDialogOpen, setContraDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<PaymentRow | ReceiptRow | null>(null);

  const { data: paymentsData, isLoading: paymentsLoading, isError: paymentsError } = useQuery({
    queryKey: ['payments', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PaymentRow>>('/v1/payments', {
        params: { search, page, per_page: 20, ...(statusFilter !== 'all' && { status: statusFilter }) },
      });
      return data;
    },
    enabled: activeTab === 'payments',
  });

  const { data: receiptsData, isLoading: receiptsLoading, isError: receiptsError } = useQuery({
    queryKey: ['receipts', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ReceiptRow>>('/v1/receipts', {
        params: { search, page, per_page: 20, ...(statusFilter !== 'all' && { status: statusFilter }) },
      });
      return data;
    },
    enabled: activeTab === 'receipts',
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Account>>('/v1/accounts', { params: { per_page: 500 } });
      return data.data;
    },
  });

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Vendor>>('/v1/vendors', { params: { per_page: 200 } });
      return data.data;
    },
    enabled: paymentDialogOpen,
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Customer>>('/v1/customers', { params: { per_page: 200 } });
      return data.data;
    },
    enabled: receiptDialogOpen,
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (values: PaymentFormData) => {
      const { data } = await api.post('/v1/payments', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setPaymentDialogOpen(false);
      resetPayment();
    },
  });

  const createReceiptMutation = useMutation({
    mutationFn: async (values: ReceiptFormData) => {
      const { data } = await api.post('/v1/receipts', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setReceiptDialogOpen(false);
      resetReceipt();
    },
  });

  const createContraMutation = useMutation({
    mutationFn: async (values: ContraFormData) => {
      const { data } = await api.post('/v1/contra-entries', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', 'receipts'] });
      setContraDialogOpen(false);
    },
  });

  const {
    register: regPayment,
    handleSubmit: handleSubmitPayment,
    reset: resetPayment,
    watch: watchPayment,
    setValue: setPaymentValue,
    formState: { errors: paymentErrors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0], vendor_id: '', account_id: '', amount: 0, payment_mode: 'bank', reference_number: '', invoice_id: '', notes: '' },
  });

  const {
    register: regReceipt,
    handleSubmit: handleSubmitReceipt,
    reset: resetReceipt,
    watch: watchReceipt,
    setValue: setReceiptValue,
    formState: { errors: receiptErrors },
  } = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0], customer_id: '', account_id: '', amount: 0, payment_mode: 'bank', reference_number: '', invoice_id: '', notes: '' },
  });

  const {
    register: regContra,
    handleSubmit: handleSubmitContra,
    reset: resetContra,
    watch: watchContra,
    setValue: setContraValue,
    formState: { errors: contraErrors },
  } = useForm<ContraFormData>({
    resolver: zodResolver(contraSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0], from_account_id: '', to_account_id: '', amount: 0, notes: '' },
  });

  const accounts = accountsData || [];
  const vendors = vendorsData || [];
  const customers = customersData || [];

  const paymentColumns: ColumnDef<PaymentRow, unknown>[] = [
    { accessorKey: 'payment_number', header: 'Payment #', cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.getValue('payment_number')}</span> },
    { accessorKey: 'date', header: 'Date', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span> },
    { accessorKey: 'vendor_name', header: 'Vendor', cell: ({ row }) => <span className="font-medium">{row.getValue('vendor_name') || '\u2014'}</span> },
    { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('amount') as number)}</span> },
    { accessorKey: 'payment_mode', header: 'Mode', cell: ({ row }) => <Badge variant="outline">{modeLabel(row.getValue('payment_mode') as string)}</Badge> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={statusVariant(row.getValue('status') as string)}>{statusLabel(row.getValue('status') as string)}</Badge> },
    { id: 'actions', header: '', cell: ({ row }) => (
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setViewingItem(row.original); setViewDialogOpen(true); }}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
    )},
  ];

  const receiptColumns: ColumnDef<ReceiptRow, unknown>[] = [
    { accessorKey: 'receipt_number', header: 'Receipt #', cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.getValue('receipt_number')}</span> },
    { accessorKey: 'date', header: 'Date', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span> },
    { accessorKey: 'customer_name', header: 'Customer', cell: ({ row }) => <span className="font-medium">{row.getValue('customer_name') || '\u2014'}</span> },
    { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('amount') as number)}</span> },
    { accessorKey: 'payment_mode', header: 'Mode', cell: ({ row }) => <Badge variant="outline">{modeLabel(row.getValue('payment_mode') as string)}</Badge> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={statusVariant(row.getValue('status') as string)}>{statusLabel(row.getValue('status') as string)}</Badge> },
    { id: 'actions', header: '', cell: ({ row }) => (
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setViewingItem(row.original); setViewDialogOpen(true); }}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Payments & Receipts</h2>
          <p className="text-sm text-muted-foreground">Manage payments, receipts, and contra entries</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'payments' && (
            <Button onClick={() => setPaymentDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />New Payment</Button>
          )}
          {activeTab === 'receipts' && (
            <Button onClick={() => setReceiptDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />New Receipt</Button>
          )}
          <Button variant="outline" onClick={() => setContraDialogOpen(true)}><RefreshCw className="mr-2 h-4 w-4" />Contra</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant={activeTab === 'payments' ? 'default' : 'outline'} size="sm" onClick={() => { setActiveTab('payments'); setPage(1); }}>
          <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />Payments
        </Button>
        <Button variant={activeTab === 'receipts' ? 'default' : 'outline'} size="sm" onClick={() => { setActiveTab('receipts'); setPage(1); }}>
          <ArrowDownLeft className="mr-1.5 h-3.5 w-3.5" />Receipts
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder={`Search ${activeTab}...`} className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : statusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === 'payments' && (
            paymentsError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium text-foreground">Failed to load payments</p>
              </div>
            ) : (
              <DataTable columns={paymentColumns} data={paymentsData?.data || []} loading={paymentsLoading} emptyMessage="No payments found." pageSize={20} />
            )
          )}
          {activeTab === 'receipts' && (
            receiptsError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium text-foreground">Failed to load receipts</p>
              </div>
            ) : (
              <DataTable columns={receiptColumns} data={receiptsData?.data || []} loading={receiptsLoading} emptyMessage="No receipts found." pageSize={20} />
            )
          )}
        </CardContent>
      </Card>

      <Dialog open={paymentDialogOpen} onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) resetPayment(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitPayment((v) => createPaymentMutation.mutate(v))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Date" type="date" {...regPayment('date')} error={paymentErrors.date?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">Vendor</label>
                <Select value={watchPayment('vendor_id') || ''} onValueChange={(v) => setPaymentValue('vendor_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Account *</label>
                <Select value={watchPayment('account_id') || ''} onValueChange={(v) => setPaymentValue('account_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                </Select>
                {paymentErrors.account_id && <p className="mt-1 text-xs text-destructive">{paymentErrors.account_id.message}</p>}
              </div>
              <Input label="Amount" type="number" {...regPayment('amount')} error={paymentErrors.amount?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">Mode</label>
                <Select value={watchPayment('payment_mode')} onValueChange={(v) => setPaymentValue('payment_mode', v as PaymentFormData['payment_mode'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input label="Reference #" {...regPayment('reference_number')} />
            </div>
            <Input label="Notes" {...regPayment('notes')} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createPaymentMutation.isPending}>Create Payment</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptDialogOpen} onOpenChange={(open) => { setReceiptDialogOpen(open); if (!open) resetReceipt(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Receipt</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitReceipt((v) => createReceiptMutation.mutate(v))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Date" type="date" {...regReceipt('date')} error={receiptErrors.date?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">Customer</label>
                <Select value={watchReceipt('customer_id') || ''} onValueChange={(v) => setReceiptValue('customer_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Account *</label>
                <Select value={watchReceipt('account_id') || ''} onValueChange={(v) => setReceiptValue('account_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                </Select>
                {receiptErrors.account_id && <p className="mt-1 text-xs text-destructive">{receiptErrors.account_id.message}</p>}
              </div>
              <Input label="Amount" type="number" {...regReceipt('amount')} error={receiptErrors.amount?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">Mode</label>
                <Select value={watchReceipt('payment_mode')} onValueChange={(v) => setReceiptValue('payment_mode', v as ReceiptFormData['payment_mode'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input label="Reference #" {...regReceipt('reference_number')} />
            </div>
            <Input label="Notes" {...regReceipt('notes')} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReceiptDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createReceiptMutation.isPending}>Create Receipt</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={contraDialogOpen} onOpenChange={(open) => { setContraDialogOpen(open); if (!open) resetContra(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Contra Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitContra((v) => createContraMutation.mutate(v))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Date" type="date" {...regContra('date')} error={contraErrors.date?.message} />
              <Input label="Amount" type="number" {...regContra('amount')} error={contraErrors.amount?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">From Account *</label>
                <Select value={watchContra('from_account_id') || ''} onValueChange={(v) => setContraValue('from_account_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                </Select>
                {contraErrors.from_account_id && <p className="mt-1 text-xs text-destructive">{contraErrors.from_account_id.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">To Account *</label>
                <Select value={watchContra('to_account_id') || ''} onValueChange={(v) => setContraValue('to_account_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                </Select>
                {contraErrors.to_account_id && <p className="mt-1 text-xs text-destructive">{contraErrors.to_account_id.message}</p>}
              </div>
            </div>
            <Input label="Notes" {...regContra('notes')} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContraDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createContraMutation.isPending}>Create Contra</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {'payment_number' in (viewingItem || {}) ? 'Payment' : 'Receipt'}: {'payment_number' in (viewingItem || {}) ? (viewingItem as PaymentRow)?.payment_number : (viewingItem as ReceiptRow)?.receipt_number}
            </DialogTitle>
          </DialogHeader>
          {viewingItem && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingItem.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-medium">{formatCurrency(viewingItem.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mode</p>
                  <Badge variant="outline">{viewingItem.payment_mode.toUpperCase()}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={statusVariant(viewingItem.status)}>{statusLabel(viewingItem.status)}</Badge>
                </div>
                {'vendor_name' in viewingItem && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    <p className="font-medium">{(viewingItem as PaymentRow).vendor_name || '\u2014'}</p>
                  </div>
                )}
                {'customer_name' in viewingItem && (
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium">{(viewingItem as ReceiptRow).customer_name || '\u2014'}</p>
                  </div>
                )}
                {viewingItem.reference_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <p className="font-medium">{viewingItem.reference_number}</p>
                  </div>
                )}
              </div>
              {viewingItem.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{viewingItem.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
