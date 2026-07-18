import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  AlertCircle,
  Eye,
  X,
  ArrowRightLeft,
  ArrowDownToLine,
  FileText,
  PackageCheck,
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
import type { JobWorkOrder, JobWorkItem, Vendor, Product, PaginatedResponse } from '@/types';

const itemSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(0.01, 'Qty must be > 0'),
  rate: z.coerce.number().min(0),
  remarks: z.string(),
});

const jobWorkSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  vendor_id: z.string().min(1, 'Vendor is required'),
  job_type: z.string().min(1, 'Job type is required'),
  direction: z.enum(['outward', 'inward']),
  notes: z.string(),
  sent_items: z.array(itemSchema).min(1, 'At least one item is required'),
});

const receiveSchema = z.object({
  received_items: z.array(z.object({
    product_id: z.string(),
    quantity: z.coerce.number().min(0.01),
    remarks: z.string(),
  })).min(1, 'At least one item is required'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string(),
});

type JobWorkFormData = z.infer<typeof jobWorkSchema>;
type ReceiveFormData = z.infer<typeof receiveSchema>;

interface JWRow extends JobWorkOrder {
  vendor_name?: string;
  direction?: string;
  total_qty?: number;
  received_qty?: number;
  rate?: number;
  amount?: number;
}

const JW_STATUSES = ['all', 'draft', 'in_progress', 'completed', 'cancelled'] as const;

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'in_progress': return 'warning' as const;
    case 'completed': return 'success' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'in_progress': return 'In Progress';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

export default function JobWorkPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [viewingJW, setViewingJW] = useState<JWRow | null>(null);
  const [receivingJW, setReceivingJW] = useState<JWRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['job-work-orders', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<JWRow>>('/v1/job-work-orders', {
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

  const { data: outstandingData } = useQuery({
    queryKey: ['job-work-orders', 'outstanding'],
    queryFn: async () => {
      const { data } = await api.get('/v1/job-work-orders/outstanding');
      return data as { total_outward: number; total_received: number; pending_qty: number; pending_amount: number };
    },
  });

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Vendor>>('/v1/vendors', { params: { per_page: 200 } });
      return data.data;
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Product>>('/v1/products', { params: { per_page: 500 } });
      return data.data;
    },
    enabled: createDialogOpen || receiveDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (values: JobWorkFormData) => {
      const { data } = await api.post('/v1/job-work-orders', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-work-orders'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async ({ id, ...values }: ReceiveFormData & { id: string }) => {
      const { data } = await api.post(`/v1/job-work-orders/${id}/receive`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-work-orders'] });
      setReceiveDialogOpen(false);
      setReceivingJW(null);
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
  } = useForm<JobWorkFormData>({
    resolver: zodResolver(jobWorkSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      vendor_id: '',
      job_type: '',
      direction: 'outward',
      notes: '',
      sent_items: [{ product_id: '', quantity: 1, rate: 0, remarks: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'sent_items' });
  const watchedItems = watch('sent_items');

  const totalAmount = useMemo(() => {
    return watchedItems?.reduce((sum, item) => sum + (item?.quantity || 0) * (item?.rate || 0), 0) || 0;
  }, [watchedItems]);

  const {
    register: regReceive,
    handleSubmit: handleSubmitReceive,
    reset: resetReceive,
    control: controlReceive,
    watch: watchReceive,
    setValue: setReceiveValue,
    formState: { errors: receiveErrors },
  } = useForm<ReceiveFormData>({
    resolver: zodResolver(receiveSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      notes: '',
      received_items: [{ product_id: '', quantity: 0, remarks: '' }],
    },
  });

  const { fields: receiveFields, append: appendReceive, remove: removeReceive } = useFieldArray({
    control: controlReceive,
    name: 'received_items',
  });

  function resetForm() {
    reset({
      date: new Date().toISOString().split('T')[0],
      vendor_id: '',
      job_type: '',
      direction: 'outward',
      notes: '',
      sent_items: [{ product_id: '', quantity: 1, rate: 0, remarks: '' }],
    });
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openView(jw: JWRow) {
    setViewingJW(jw);
    setViewDialogOpen(true);
  }

  function openReceive(jw: JWRow) {
    setReceivingJW(jw);
    resetReceive({
      date: new Date().toISOString().split('T')[0],
      notes: '',
      received_items: (jw.sent_items || []).map((item) => ({
        product_id: item.product_id,
        quantity: 0,
        remarks: '',
      })),
    });
    setReceiveDialogOpen(true);
  }

  function onSubmit(values: JobWorkFormData) {
    createMutation.mutate(values);
  }

  function onReceiveSubmit(values: ReceiveFormData) {
    if (receivingJW) {
      receiveMutation.mutate({ ...values, id: receivingJW.id });
    }
  }

  const columns: ColumnDef<JWRow, unknown>[] = [
    {
      accessorKey: 'order_number',
      header: 'Job #',
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.getValue('order_number')}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span>,
    },
    {
      accessorKey: 'vendor_name',
      header: 'Vendor',
      cell: ({ row }) => <span className="font-medium">{row.getValue('vendor_name') || row.original.party_name || '—'}</span>,
    },
    {
      accessorKey: 'job_type',
      header: 'Type',
      cell: ({ row }) => <span>{row.getValue('job_type') || '—'}</span>,
    },
    {
      accessorKey: 'direction',
      header: 'Direction',
      cell: ({ row }) => {
        const dir = row.original.direction || 'outward';
        return (
          <Badge variant={dir === 'outward' ? 'default' : 'outline'}>
            {dir === 'outward' ? 'Outward' : 'Inward'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'total_qty',
      header: 'Total Qty',
      cell: ({ row }) => <span>{row.original.total_qty || row.original.sent_items?.reduce((s, i) => s + i.quantity, 0) || 0}</span>,
    },
    {
      accessorKey: 'received_qty',
      header: 'Received',
      cell: ({ row }) => <span className="text-emerald-600">{row.original.received_qty || 0}</span>,
    },
    {
      accessorKey: 'rate',
      header: 'Rate',
      cell: ({ row }) => <span>{row.original.rate ? formatCurrency(row.original.rate) : '—'}</span>,
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.amount || totalAmount)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as string;
        return <Badge variant={statusVariant(s)}>{statusLabel(s)}</Badge>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openView(row.original); }}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {(row.original.status === 'in_progress' || row.original.status === 'draft') && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700" onClick={(e) => { e.stopPropagation(); openReceive(row.original); }} title="Receive (Inward)">
              <ArrowDownToLine className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const vendors = vendorsData || [];
  const products = productsData || [];
  const outstanding = outstandingData || { total_outward: 0, total_received: 0, pending_qty: 0, pending_amount: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Job Work</h2>
          <p className="text-sm text-muted-foreground">Manage job work orders and tracking</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Job Work
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Outward</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{outstanding.total_outward}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Received</CardTitle>
            <PackageCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{outstanding.total_received}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Qty</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{outstanding.pending_qty}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(outstanding.pending_amount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search job work..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JW_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && <p className="text-sm text-muted-foreground">{data.total} order{data.total !== 1 ? 's' : ''} total</p>}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load job work orders</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable columns={columns} data={data?.items || []} loading={isLoading} emptyMessage="No job work orders found. Create your first order to get started." pageSize={20} />
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Create Job Work Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Date" type="date" {...register('date')} error={errors.date?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">Vendor *</label>
                <Select value={watch('vendor_id') || ''} onValueChange={(v) => setValue('vendor_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.vendor_id && <p className="mt-1 text-xs text-destructive">{errors.vendor_id.message}</p>}
              </div>
              <Input label="Job Type" placeholder="e.g. Dyeing, Printing, Stitching" {...register('job_type')} error={errors.job_type?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">Direction</label>
                <Select value={watch('direction')} onValueChange={(v) => setValue('direction', v as 'outward' | 'inward')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outward">Outward (Sending)</SelectItem>
                    <SelectItem value="inward">Inward (Receiving)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Items</h4>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: '', quantity: 1, rate: 0, remarks: '' })}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Add Item
                </Button>
              </div>
              {errors.sent_items?.message && <p className="mb-2 text-xs text-destructive">{errors.sent_items.message as string}</p>}
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rate</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remarks</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <Select value={watch(`sent_items.${index}.product_id`) || ''} onValueChange={(v) => setValue(`sent_items.${index}.product_id`, v)}>
                            <SelectTrigger className="min-w-[150px]"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" className="w-20" {...register(`sent_items.${index}.quantity`, { valueAsNumber: true })} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" className="w-24" {...register(`sent_items.${index}.rate`, { valueAsNumber: true })} />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatCurrency((watch(`sent_items.${index}.quantity`) || 0) * (watch(`sent_items.${index}.rate`) || 0))}
                        </td>
                        <td className="px-3 py-2">
                          <Input className="w-28" {...register(`sent_items.${index}.remarks`)} placeholder="Remarks" />
                        </td>
                        <td className="px-3 py-2">
                          {fields.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(index)}>
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
              <div className="w-64 rounded-md border border-border p-4">
                <div className="flex justify-between text-sm font-bold">
                  <span>Total Amount</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>

            <Input label="Notes" placeholder="Notes..." {...register('notes')} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" loading={createMutation.isPending}>Create Order</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Receive Job Work (Inward) - {receivingJW?.order_number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitReceive(onReceiveSubmit)} className="space-y-6">
            <Input label="Receive Date" type="date" {...regReceive('date')} error={receiveErrors.date?.message} />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Received Items</h4>
                <Button type="button" variant="outline" size="sm" onClick={() => appendReceive({ product_id: '', quantity: 0, remarks: '' })}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Add Item
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remarks</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveFields.map((field, index) => (
                      <tr key={field.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <Select value={watchReceive(`received_items.${index}.product_id`) || ''} onValueChange={(v) => setReceiveValue(`received_items.${index}.product_id`, v)}>
                            <SelectTrigger className="min-w-[150px]"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" className="w-20" {...regReceive(`received_items.${index}.quantity`, { valueAsNumber: true })} />
                        </td>
                        <td className="px-3 py-2">
                          <Input className="w-28" {...regReceive(`received_items.${index}.remarks`)} placeholder="Remarks" />
                        </td>
                        <td className="px-3 py-2">
                          {receiveFields.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeReceive(index)}>
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

            <Input label="Notes" placeholder="Notes..." {...regReceive('notes')} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={receiveMutation.isPending}>Confirm Receive</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Job Work: {viewingJW?.order_number}
            </DialogTitle>
          </DialogHeader>
          {viewingJW && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingJW.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  <p className="font-medium">{viewingJW.vendor_name || viewingJW.party_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={statusVariant(viewingJW.status)}>{statusLabel(viewingJW.status)}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Job Type</p>
                  <p className="font-medium">{viewingJW.job_type || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Direction</p>
                  <Badge variant={viewingJW.direction === 'outward' ? 'default' : 'outline'}>
                    {viewingJW.direction === 'outward' ? 'Outward' : 'Inward'}
                  </Badge>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Sent Items</h4>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingJW.sent_items || []).map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">{item.product_id}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{item.rate ? formatCurrency(item.rate) : '—'}</td>
                          <td className="px-3 py-2">{item.remarks || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {viewingJW.received_items && viewingJW.received_items.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Received Items</h4>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingJW.received_items.map((item) => (
                          <tr key={item.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">{item.product_id}</td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2">{item.remarks || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewingJW.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{viewingJW.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
