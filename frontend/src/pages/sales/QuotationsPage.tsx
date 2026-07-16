import { useState, useCallback, useMemo } from 'react';
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
  ArrowRight,
  X,
  Send,
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
  SalesQuotation,
  SalesQuotationItem,
  Customer,
  Product,
  PaginatedResponse,
} from '@/types';

const lineItemSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(0.01),
  rate: z.coerce.number().min(0),
  gst_rate: z.coerce.number().min(0).max(100),
  amount: z.coerce.number().min(0),
  remarks: z.string(),
});

const quotationSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  date: z.string().min(1, 'Date is required'),
  valid_until: z.string(),
  notes: z.string(),
  items: z.array(lineItemSchema).min(1, 'At least one item is required'),
});

type QuotationFormData = z.infer<typeof quotationSchema>;

interface QuotationRow extends SalesQuotation {
  customer_name?: string;
  items_count?: number;
}

const QUOT_STATUSES = ['all', 'draft', 'sent', 'accepted', 'rejected', 'converted', 'expired'] as const;

const quotStatusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'sent': return 'default' as const;
    case 'accepted': return 'success' as const;
    case 'rejected': return 'destructive' as const;
    case 'converted': return 'outline' as const;
    case 'expired': return 'warning' as const;
    default: return 'outline' as const;
  }
};

const quotStatusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'sent': return 'Sent';
    case 'accepted': return 'Accepted';
    case 'rejected': return 'Rejected';
    case 'converted': return 'Converted';
    case 'expired': return 'Expired';
    default: return status;
  }
};

const GST_RATES = [0, 5, 12, 18, 28];

export default function QuotationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingQuotation, setViewingQuotation] = useState<QuotationRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['quotations', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<QuotationRow>>('/v1/quotations', {
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

  const { data: productsData } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Product>>('/v1/products', {
        params: { per_page: 500 },
      });
      return data.data;
    },
    enabled: createDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (values: QuotationFormData) => {
      const { data } = await api.post('/v1/quotations', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/v1/quotations/${id}/convert-to-order`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
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
  } = useForm<QuotationFormData>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      customer_id: '',
      date: new Date().toISOString().split('T')[0],
      valid_until: '',
      notes: '',
      items: [{ product_id: '', quantity: 1, rate: 0, gst_rate: 18, amount: 0, remarks: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  const totals = useMemo(() => {
    let subtotal = 0;
    let totalGST = 0;
    watchedItems?.forEach((item) => {
      const amt = item?.amount || 0;
      const gstPct = item?.gst_rate || 0;
      subtotal += amt;
      totalGST += (amt * gstPct) / 100;
    });
    return { subtotal, totalGST, grandTotal: subtotal + totalGST };
  }, [watchedItems]);

  const recalcAmount = useCallback(
    (index: number) => {
      const qty = watch(`items.${index}.quantity`) || 0;
      const rate = watch(`items.${index}.rate`) || 0;
      setValue(`items.${index}.amount`, qty * rate);
    },
    [watch, setValue],
  );

  function resetForm() {
    reset({
      customer_id: '',
      date: new Date().toISOString().split('T')[0],
      valid_until: '',
      notes: '',
      items: [{ product_id: '', quantity: 1, rate: 0, gst_rate: 18, amount: 0, remarks: '' }],
    });
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openView(quotation: QuotationRow) {
    setViewingQuotation(quotation);
    setViewDialogOpen(true);
  }

  function onSubmit(values: QuotationFormData) {
    createMutation.mutate(values);
  }

  const columns: ColumnDef<QuotationRow, unknown>[] = [
    {
      accessorKey: 'quotation_number',
      header: 'Quotation #',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('quotation_number')}</span>
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
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return <Badge variant={quotStatusVariant(status)}>{quotStatusLabel(status)}</Badge>;
      },
    },
    {
      accessorKey: 'items_count',
      header: 'Items',
      cell: ({ row }) => {
        const count = (row.getValue('items_count') as number) || row.original.items?.length || 0;
        return <span>{count}</span>;
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
      accessorKey: 'valid_until',
      header: 'Valid Until',
      cell: ({ row }) => {
        const validUntil = row.original.valid_until;
        return validUntil ? <span className="text-xs">{formatDate(validUntil)}</span> : <span>—</span>;
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
          {row.original.status === 'accepted' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
              onClick={(e) => { e.stopPropagation(); convertMutation.mutate(row.original.id); }}
              disabled={convertMutation.isPending}
              title="Convert to Sales Order"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const customers = customersData || [];
  const products = productsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Quotations</h2>
          <p className="text-sm text-muted-foreground">Create and manage sales quotations</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Quotation
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search quotations..."
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
                  {QUOT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : quotStatusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} quotation{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load quotations</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No quotations found. Create your first quotation to get started."
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
              Create Quotation
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
              <Input label="Quotation Date" type="date" {...register('date')} error={errors.date?.message} />
              <Input label="Valid Until" type="date" {...register('valid_until')} />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Line Items</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ product_id: '', quantity: 1, rate: 0, gst_rate: 18, amount: 0, remarks: '' })}
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
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rate</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">GST %</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remarks</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <Select
                            value={watch(`items.${index}.product_id`) || ''}
                            onValueChange={(v) => {
                              setValue(`items.${index}.product_id`, v);
                              const prod = products.find((p) => p.id === v);
                              if (prod) {
                                setValue(`items.${index}.rate`, prod.selling_price || 0);
                                setValue(`items.${index}.gst_rate`, prod.gst_rate || 18);
                                recalcAmount(index);
                              }
                            }}
                          >
                            <SelectTrigger className="min-w-[150px]">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            className="w-20"
                            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                            onChange={(e) => {
                              register(`items.${index}.quantity`).onChange(e);
                              setTimeout(() => recalcAmount(index), 0);
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
                              setTimeout(() => recalcAmount(index), 0);
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
                          <Input className="w-24" {...register(`items.${index}.remarks`)} placeholder="Notes" />
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
                              <X className="h-3.5 w-3.5" />
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

            <Input label="Notes" placeholder="Quotation notes..." {...register('notes')} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create Quotation
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
              Quotation: {viewingQuotation?.quotation_number}
            </DialogTitle>
          </DialogHeader>
          {viewingQuotation && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{viewingQuotation.customer_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingQuotation.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={quotStatusVariant(viewingQuotation.status)}>{quotStatusLabel(viewingQuotation.status)}</Badge>
                </div>
                {viewingQuotation.valid_until && (
                  <div>
                    <p className="text-xs text-muted-foreground">Valid Until</p>
                    <p className="font-medium">{formatDate(viewingQuotation.valid_until)}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Items</h4>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">GST %</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingQuotation.items || []).map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">{item.product_id}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.rate)}</td>
                          <td className="px-3 py-2 text-right">{item.gst_rate || 0}%</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.amount)}</td>
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
                    <span>{formatCurrency(viewingQuotation.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST</span>
                    <span>{formatCurrency(viewingQuotation.gst_amount)}</span>
                  </div>
                  <div className="border-t border-border pt-2">
                    <div className="flex justify-between text-sm font-bold">
                      <span>Total</span>
                      <span>{formatCurrency(viewingQuotation.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {viewingQuotation.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{viewingQuotation.notes}</p>
                </div>
              )}

              {viewingQuotation.status === 'accepted' && (
                <div className="flex justify-end">
                  <Button
                    onClick={() => convertMutation.mutate(viewingQuotation.id)}
                    disabled={convertMutation.isPending}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Convert to Sales Order
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
