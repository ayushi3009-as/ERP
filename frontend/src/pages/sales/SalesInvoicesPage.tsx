import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  Eye,
  AlertCircle,
  FileText,
  CreditCard,
  IndianRupee,
  Printer,
  Download,
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
import { formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type {
  SalesInvoice,
  SalesOrder,
  Customer,
  PaginatedResponse,
} from '@/types';

const invoiceItemSchema = z.object({
  product_id: z.string().min(1),
  quantity: z.coerce.number().min(0.01),
  rate: z.coerce.number().min(0),
  gst_rate: z.coerce.number().min(0).max(100),
  amount: z.coerce.number().min(0),
});

const invoiceSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  invoice_number: z.string().min(1, 'Invoice number is required'),
  date: z.string().min(1, 'Date is required'),
  due_date: z.string(),
  sales_order_id: z.string(),
  notes: z.string(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceRow extends SalesInvoice {
  customer_name?: string;
  order_number?: string;
}

const INV_STATUSES = ['all', 'draft', 'posted', 'paid', 'partial', 'cancelled'] as const;

const invStatusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'posted': return 'default' as const;
    case 'paid': return 'success' as const;
    case 'partial': return 'warning' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

const invStatusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'posted': return 'Posted';
    case 'paid': return 'Paid';
    case 'partial': return 'Partial';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

const GST_RATES = [0, 5, 12, 18, 28];

export default function SalesInvoicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceRow | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<InvoiceRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-invoices', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InvoiceRow>>('/v1/sales-invoices', {
        params: {
          search,
          page,
          per_page: 20,
          ...(statusFilter !== 'all' && { status: statusFilter }),
        },
      });
      return data;
    },
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Customer>>('/v1/customers', {
        params: { per_page: 200 },
      });
      return data.data;
    },
  });

  const { data: salesOrdersData } = useQuery({
    queryKey: ['sales-orders', 'for-invoice'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<SalesOrder>>('/v1/sales-orders', {
        params: { per_page: 200 },
      });
      return data.data;
    },
    enabled: createDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (values: InvoiceFormData) => {
      const { data } = await api.post('/v1/sales-invoices', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async ({ invoiceId, amount }: { invoiceId: string; amount: number }) => {
      const { data } = await api.post(`/v1/sales-invoices/${invoiceId}/payment`, { amount });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      setPaymentDialogOpen(false);
      setPayingInvoice(null);
      setPaymentAmount('');
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customer_id: '',
      invoice_number: '',
      date: new Date().toISOString().split('T')[0],
      due_date: '',
      sales_order_id: '',
      notes: '',
      items: [{ product_id: '', quantity: 1, rate: 0, gst_rate: 18, amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  const totals = (() => {
    let subtotal = 0;
    let totalGST = 0;
    watchedItems?.forEach((item) => {
      const amt = item?.amount || 0;
      const gstPct = item?.gst_rate || 0;
      subtotal += amt;
      totalGST += (amt * gstPct) / 100;
    });
    return { subtotal, totalGST, grandTotal: subtotal + totalGST };
  })();

  function resetForm() {
    reset({
      customer_id: '',
      invoice_number: '',
      date: new Date().toISOString().split('T')[0],
      due_date: '',
      sales_order_id: '',
      notes: '',
      items: [{ product_id: '', quantity: 1, rate: 0, gst_rate: 18, amount: 0 }],
    });
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openView(invoice: InvoiceRow) {
    setViewingInvoice(invoice);
    setViewDialogOpen(true);
  }

  function openPayment(invoice: InvoiceRow) {
    setPayingInvoice(invoice);
    const remaining = invoice.total_amount - invoice.paid_amount;
    setPaymentAmount(String(remaining));
    setPaymentDialogOpen(true);
  }

  function handlePrint(invoice: InvoiceRow) {
    window.open(`/api/v1/sales-invoices/${invoice.id}/print`, '_blank');
  }

  function handleDownload(invoice: InvoiceRow) {
    window.open(`/api/v1/sales-invoices/${invoice.id}/download`, '_blank');
  }

  function onSubmit(values: InvoiceFormData) {
    createMutation.mutate(values);
  }

  function handlePayment() {
    if (!payingInvoice || !paymentAmount) return;
    paymentMutation.mutate({
      invoiceId: payingInvoice.id,
      amount: Number(paymentAmount),
    });
  }

  const columns: ColumnDef<InvoiceRow, unknown>[] = [
    {
      accessorKey: 'invoice_number',
      header: 'Invoice #',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('invoice_number')}</span>
      ),
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-xs">{formatDate(row.getValue('date') as string)}</span>
      ),
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
      cell: ({ row }) => <span className="font-medium">{row.getValue('customer_name') || '—'}</span>,
    },
    {
      accessorKey: 'order_number',
      header: 'Order #',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.getValue('order_number') || '—'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return <Badge variant={invStatusVariant(status)}>{invStatusLabel(status)}</Badge>;
      },
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency((row.getValue('total_amount') as number) || 0)}</span>
      ),
    },
    {
      accessorKey: 'paid_amount',
      header: 'Paid',
      cell: ({ row }) => (
        <span className="font-medium text-emerald-600">
          {formatCurrency((row.getValue('paid_amount') as number) || 0)}
        </span>
      ),
    },
    {
      id: 'balance',
      header: 'Balance',
      cell: ({ row }) => {
        const total = row.original.total_amount || 0;
        const paid = row.original.paid_amount || 0;
        const balance = total - paid;
        return (
          <span className={balance > 0 ? 'font-medium text-destructive' : 'font-medium text-emerald-600'}>
            {formatCurrency(balance)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); openView(row.original); }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {(row.original.status === 'posted' || row.original.status === 'partial') && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
              onClick={(e) => { e.stopPropagation(); openPayment(row.original); }}
            >
              <IndianRupee className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); handlePrint(row.original); }}
            title="Print"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); handleDownload(row.original); }}
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const customers = customersData || [];
  const salesOrders = salesOrdersData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sales Invoices</h2>
          <p className="text-sm text-muted-foreground">Manage customer invoices and payment collection</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Invoice
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {INV_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : invStatusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} invoice{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load invoices</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No sales invoices found. Create your first invoice to get started."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Create Sales Invoice
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-foreground">Customer *</label>
                <Select
                  value={watch('customer_id') || ''}
                  onValueChange={(v) => setValue('customer_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.customer_id && (
                  <p className="mt-1 text-xs text-destructive">{errors.customer_id.message}</p>
                )}
              </div>
              <Input
                label="Invoice Number *"
                placeholder="SINV-001"
                {...register('invoice_number')}
                error={errors.invoice_number?.message}
              />
              <Input label="Invoice Date" type="date" {...register('date')} error={errors.date?.message} />
              <Input label="Due Date" type="date" {...register('due_date')} />
              <div>
                <label className="text-sm font-medium text-foreground">Linked Sales Order</label>
                <Select
                  value={watch('sales_order_id') || ''}
                  onValueChange={(v) => setValue('sales_order_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select order (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesOrders.map((so) => (
                      <SelectItem key={so.id} value={so.id}>{so.order_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Line Items</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ product_id: '', quantity: 1, rate: 0, gst_rate: 18, amount: 0 })}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>
              {errors.items?.message && (
                <p className="mb-2 text-xs text-destructive">{errors.items.message as string}</p>
              )}
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product ID</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rate</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">GST %</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <Input
                            className="min-w-[150px]"
                            {...register(`items.${index}.product_id`)}
                            placeholder="Product ID"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            className="w-20"
                            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                            onChange={(e) => {
                              register(`items.${index}.quantity`).onChange(e);
                              const qty = Number(e.target.value) || 0;
                              const rate = watch(`items.${index}.rate`) || 0;
                              setValue(`items.${index}.amount`, qty * rate);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            className="w-24"
                            {...register(`items.${index}.rate`, { valueAsNumber: true })}
                            onChange={(e) => {
                              register(`items.${index}.rate`).onChange(e);
                              const qty = watch(`items.${index}.quantity`) || 0;
                              const rate = Number(e.target.value) || 0;
                              setValue(`items.${index}.amount`, qty * rate);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={String(watch(`items.${index}.gst_rate`) || 18)}
                            onValueChange={(v) => setValue(`items.${index}.gst_rate`, Number(v))}
                          >
                            <SelectTrigger className="w-16">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {GST_RATES.map((r) => (
                                <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatCurrency(watch(`items.${index}.amount`) || 0)}
                        </td>
                        <td className="px-3 py-2">
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => remove(index)}
                            >
                              <span className="text-xs">X</span>
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-72 space-y-2 rounded-md border border-border p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST</span>
                  <span className="font-medium">{formatCurrency(totals.totalGST)}</span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Grand Total</span>
                    <span>{formatCurrency(totals.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            <Input label="Notes" placeholder="Notes..." {...register('notes')} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice: {viewingInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {viewingInvoice && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{viewingInvoice.customer_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingInvoice.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={invStatusVariant(viewingInvoice.status)}>{invStatusLabel(viewingInvoice.status)}</Badge>
                </div>
                {viewingInvoice.due_date && (
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="font-medium">{formatDate(viewingInvoice.due_date)}</p>
                  </div>
                )}
                {viewingInvoice.order_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Sales Order</p>
                    <p className="font-medium">{viewingInvoice.order_number}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <div className="w-72 space-y-2 rounded-md border border-border p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(viewingInvoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST</span>
                    <span>{formatCurrency(viewingInvoice.gst_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold">{formatCurrency(viewingInvoice.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-medium text-emerald-600">{formatCurrency(viewingInvoice.paid_amount)}</span>
                  </div>
                  <div className="border-t border-border pt-2">
                    <div className="flex justify-between text-sm font-bold">
                      <span>Balance</span>
                      <span className={viewingInvoice.total_amount - viewingInvoice.paid_amount > 0 ? 'text-destructive' : 'text-emerald-600'}>
                        {formatCurrency(viewingInvoice.total_amount - viewingInvoice.paid_amount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePrint(viewingInvoice)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownload(viewingInvoice)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>

              {viewingInvoice.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{viewingInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Record Payment
            </DialogTitle>
          </DialogHeader>
          {payingInvoice && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm">
                  Invoice: <span className="font-medium">{payingInvoice.invoice_number}</span>
                </p>
                <p className="text-sm">
                  Total: <span className="font-medium">{formatCurrency(payingInvoice.total_amount)}</span>
                </p>
                <p className="text-sm">
                  Already Paid: <span className="font-medium text-emerald-600">{formatCurrency(payingInvoice.paid_amount)}</span>
                </p>
                <p className="text-sm">
                  Balance: <span className="font-medium text-destructive">
                    {formatCurrency(payingInvoice.total_amount - payingInvoice.paid_amount)}
                  </span>
                </p>
              </div>
              <Input
                label="Payment Amount"
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
                <Button loading={paymentMutation.isPending} onClick={handlePayment}>
                  Record Payment
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
