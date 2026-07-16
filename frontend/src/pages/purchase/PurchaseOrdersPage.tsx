import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  AlertCircle,
  Eye,
  Send,
  X,
  FileText,
  Package,
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
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  Vendor,
  Product,
  PaginatedResponse,
} from '@/types';

const lineItemSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(0.01, 'Qty must be > 0'),
  rate: z.coerce.number().min(0, 'Rate must be >= 0'),
  discount_percent: z.coerce.number().min(0).max(100),
  gst_rate: z.coerce.number().min(0).max(100),
  amount: z.coerce.number().min(0),
});

const poSchema = z.object({
  vendor_id: z.string().min(1, 'Vendor is required'),
  date: z.string().min(1, 'Date is required'),
  delivery_date: z.string(),
  notes: z.string(),
  terms: z.string(),
  items: z.array(lineItemSchema).min(1, 'At least one item is required'),
});

type POFormData = z.infer<typeof poSchema>;

interface POLineItem {
  product_id: string;
  quantity: number;
  rate: number;
  discount_percent: number;
  gst_rate: number;
  amount: number;
}

interface PORow extends PurchaseOrder {
  vendor_name?: string;
  items_count?: number;
  payment_status?: string;
}

const PO_STATUSES = ['all', 'draft', 'confirmed', 'partial', 'received', 'cancelled'] as const;

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'confirmed': return 'default' as const;
    case 'partial': return 'warning' as const;
    case 'received': return 'success' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'confirmed': return 'Confirmed';
    case 'partial': return 'Partial';
    case 'received': return 'Received';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

const paymentStatusVariant = (status: string | undefined) => {
  switch (status) {
    case 'paid': return 'success' as const;
    case 'partial': return 'warning' as const;
    case 'unpaid': return 'destructive' as const;
    default: return 'secondary' as const;
  }
};

const GST_RATES = [0, 5, 12, 18, 28];

export default function PurchaseOrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PORow | null>(null);
  const [viewingPO, setViewingPO] = useState<PORow | null>(null);
  const [deletingPO, setDeletingPO] = useState<PORow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-orders', { search, page, statusFilter, vendorFilter, dateFrom, dateTo }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PORow>>('/v1/purchase-orders', {
        params: {
          search,
          page,
          per_page: 20,
          ...(statusFilter !== 'all' && { status: statusFilter }),
          ...(vendorFilter !== 'all' && { vendor_id: vendorFilter }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
        },
      });
      return data;
    },
  });

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Vendor>>('/v1/vendors', {
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
    mutationFn: async (values: POFormData) => {
      const { data } = await api.post('/v1/purchase-orders', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: POFormData & { id: string }) => {
      const { data } = await api.put(`/v1/purchase-orders/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/v1/purchase-orders/${id}/submit`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/purchase-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setDeleteDialogOpen(false);
      setDeletingPO(null);
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
  } = useForm<POFormData>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      vendor_id: '',
      date: new Date().toISOString().split('T')[0],
      delivery_date: '',
      notes: '',
      terms: '',
      items: [{ product_id: '', quantity: 1, rate: 0, discount_percent: 0, gst_rate: 18, amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedItems = watch('items');

  const totals = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalCGST = 0;
    let totalSGST = 0;

    watchedItems?.forEach((item) => {
      const qty = item?.quantity || 0;
      const rate = item?.rate || 0;
      const discPct = item?.discount_percent || 0;
      const gstPct = item?.gst_rate || 0;

      const lineBase = qty * rate;
      const discAmount = (lineBase * discPct) / 100;
      const taxableAmount = lineBase - discAmount;
      const gstAmount = (taxableAmount * gstPct) / 100;

      subtotal += taxableAmount;
      totalDiscount += discAmount;
      totalCGST += gstAmount / 2;
      totalSGST += gstAmount / 2;
    });

    return {
      subtotal,
      totalDiscount,
      totalCGST,
      totalSGST,
      grandTotal: subtotal + totalCGST + totalSGST,
    };
  }, [watchedItems]);

  const recalcAmount = useCallback(
    (index: number) => {
      const item = watchedItems?.[index];
      if (!item) return;
      const qty = item.quantity || 0;
      const rate = item.rate || 0;
      const discPct = item.discount_percent || 0;
      const lineBase = qty * rate;
      const discAmount = (lineBase * discPct) / 100;
      setValue(`items.${index}.amount`, lineBase - discAmount);
    },
    [watchedItems, setValue],
  );

  function resetForm() {
    reset({
      vendor_id: '',
      date: new Date().toISOString().split('T')[0],
      delivery_date: '',
      notes: '',
      terms: '',
      items: [{ product_id: '', quantity: 1, rate: 0, discount_percent: 0, gst_rate: 18, amount: 0 }],
    });
    setEditingPO(null);
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openEdit(po: PORow) {
    setEditingPO(po);
    reset({
      vendor_id: po.vendor_id,
      date: po.date,
      delivery_date: po.delivery_date || '',
      notes: po.notes || '',
      terms: '',
      items: (po.items || []).map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        rate: item.rate,
        discount_percent: 0,
        gst_rate: item.gst_rate || 18,
        amount: item.amount,
      })),
    });
    setCreateDialogOpen(true);
  }

  function openView(po: PORow) {
    setViewingPO(po);
    setViewDialogOpen(true);
  }

  function openDelete(po: PORow) {
    setDeletingPO(po);
    setDeleteDialogOpen(true);
  }

  function onSubmit(values: POFormData) {
    if (editingPO) {
      updateMutation.mutate({ ...values, id: editingPO.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<PORow, unknown>[] = [
    {
      accessorKey: 'order_number',
      header: 'PO Number',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('order_number')}</span>
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
      accessorKey: 'vendor_name',
      header: 'Vendor',
      cell: ({ row }) => <span className="font-medium">{row.getValue('vendor_name') || '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>;
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
      header: 'Grand Total',
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency((row.getValue('total_amount') as number) || 0)}</span>
      ),
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        const ps = row.original.payment_status || 'unpaid';
        return <Badge variant={paymentStatusVariant(ps)}>{ps}</Badge>;
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
          {row.original.status === 'draft' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                onClick={(e) => { e.stopPropagation(); submitMutation.mutate(row.original.id); }}
                disabled={submitMutation.isPending}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {row.original.status === 'draft' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); openDelete(row.original); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const isPending = createMutation.isPending || updateMutation.isPending;
  const vendors = vendorsData || [];
  const products = productsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">Manage purchase orders and vendor procurement</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create PO
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search POs..."
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
                  {PO_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={vendorFilter} onValueChange={(v) => { setVendorFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vendors</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="w-full sm:w-[140px]"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                placeholder="From date"
              />
              <Input
                type="date"
                className="w-full sm:w-[140px]"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                placeholder="To date"
              />
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} order{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load purchase orders</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No purchase orders found. Create your first PO to get started."
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
            <DialogTitle>{editingPO ? 'Edit Purchase Order' : 'Create Purchase Order'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Vendor *</label>
                <Select
                  value={watch('vendor_id') || ''}
                  onValueChange={(v) => setValue('vendor_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.vendor_id && (
                  <p className="mt-1 text-xs text-destructive">{errors.vendor_id.message}</p>
                )}
              </div>
              <Input
                label="PO Date"
                type="date"
                {...register('date')}
                error={errors.date?.message}
              />
              <Input
                label="Expected Delivery Date"
                type="date"
                {...register('delivery_date')}
                error={errors.delivery_date?.message}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Line Items</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ product_id: '', quantity: 1, rate: 0, discount_percent: 0, gst_rate: 18, amount: 0 })}
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
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Disc %</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">GST %</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
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
                                setValue(`items.${index}.rate`, prod.cost_price || 0);
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
                                <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.items?.[index]?.product_id && (
                            <p className="mt-1 text-xs text-destructive">{errors.items[index].product_id?.message}</p>
                          )}
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
                          <Input
                            type="number"
                            className="w-16"
                            {...register(`items.${index}.discount_percent`, { valueAsNumber: true })}
                            onChange={(e) => {
                              register(`items.${index}.discount_percent`).onChange(e);
                              setTimeout(() => recalcAmount(index), 0);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={String(watch(`items.${index}.gst_rate`) || 18)}
                            onValueChange={(v) => {
                              setValue(`items.${index}.gst_rate`, Number(v));
                              recalcAmount(index);
                            }}
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
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-destructive">-{formatCurrency(totals.totalDiscount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">CGST</span>
                  <span className="font-medium">{formatCurrency(totals.totalCGST)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">SGST</span>
                  <span className="font-medium">{formatCurrency(totals.totalSGST)}</span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Grand Total</span>
                    <span>{formatCurrency(totals.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Notes" placeholder="Internal notes..." {...register('notes')} />
              <Input label="Terms & Conditions" placeholder="Payment terms..." {...register('terms')} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                {editingPO ? 'Update PO' : 'Create PO'}
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
              Purchase Order: {viewingPO?.order_number}
            </DialogTitle>
          </DialogHeader>
          {viewingPO && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  <p className="font-medium">{viewingPO.vendor_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingPO.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={statusVariant(viewingPO.status)}>{statusLabel(viewingPO.status)}</Badge>
                </div>
                {viewingPO.delivery_date && (
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Delivery</p>
                    <p className="font-medium">{formatDate(viewingPO.delivery_date)}</p>
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
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Received</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingPO.items || []).map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">{item.product_id}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.rate)}</td>
                          <td className="px-3 py-2 text-right">{item.gst_rate || 0}%</td>
                          <td className="px-3 py-2 text-right">{item.received_qty}</td>
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
                    <span>{formatCurrency(viewingPO.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST</span>
                    <span>{formatCurrency(viewingPO.gst_amount)}</span>
                  </div>
                  <div className="border-t border-border pt-2">
                    <div className="flex justify-between text-sm font-bold">
                      <span>Total</span>
                      <span>{formatCurrency(viewingPO.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {viewingPO.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{viewingPO.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete PO{' '}
              <span className="font-medium text-foreground">{deletingPO?.order_number}</span>?
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deletingPO && deleteMutation.mutate(deletingPO.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
