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
  Printer,
  Truck,
  X,
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
  DeliveryChallan,
  DeliveryChallanItem,
  SalesOrder,
  Customer,
  Product,
  PaginatedResponse,
} from '@/types';

const challanItemSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(0.01, 'Qty must be > 0'),
  remarks: z.string(),
});

const challanSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  date: z.string().min(1, 'Date is required'),
  sales_order_id: z.string(),
  vehicle_number: z.string(),
  notes: z.string(),
  items: z.array(challanItemSchema).min(1, 'At least one item is required'),
});

type ChallanFormData = z.infer<typeof challanSchema>;

interface ChallanRow extends DeliveryChallan {
  customer_name?: string;
  order_number?: string;
}

const CHALLAN_STATUSES = ['all', 'draft', 'dispatched', 'delivered', 'cancelled'] as const;

const challanStatusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'dispatched': return 'default' as const;
    case 'delivered': return 'success' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

const challanStatusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'dispatched': return 'Dispatched';
    case 'delivered': return 'Delivered';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

export default function DeliveryChallansPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingChallan, setViewingChallan] = useState<ChallanRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['delivery-challans', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ChallanRow>>('/v1/delivery-challans', {
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
    queryKey: ['sales-orders', 'for-challan'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<SalesOrder>>('/v1/sales-orders', {
        params: { per_page: 200 },
      });
      return data.data;
    },
    enabled: createDialogOpen,
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
    mutationFn: async (values: ChallanFormData) => {
      const { data } = await api.post('/v1/delivery-challans', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/v1/delivery-challans/${id}/dispatch`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/v1/delivery-challans/${id}/deliver`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
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
  } = useForm<ChallanFormData>({
    resolver: zodResolver(challanSchema),
    defaultValues: {
      customer_id: '',
      date: new Date().toISOString().split('T')[0],
      sales_order_id: '',
      vehicle_number: '',
      notes: '',
      items: [{ product_id: '', quantity: 1, remarks: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  function resetForm() {
    reset({
      customer_id: '',
      date: new Date().toISOString().split('T')[0],
      sales_order_id: '',
      vehicle_number: '',
      notes: '',
      items: [{ product_id: '', quantity: 1, remarks: '' }],
    });
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openView(challan: ChallanRow) {
    setViewingChallan(challan);
    setViewDialogOpen(true);
  }

  function handlePrint(challan: ChallanRow) {
    window.open(`/api/v1/delivery-challans/${challan.id}/print`, '_blank');
  }

  function onSubmit(values: ChallanFormData) {
    createMutation.mutate(values);
  }

  const columns: ColumnDef<ChallanRow, unknown>[] = [
    {
      accessorKey: 'challan_number',
      header: 'Challan #',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('challan_number')}</span>
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
        return <Badge variant={challanStatusVariant(status)}>{challanStatusLabel(status)}</Badge>;
      },
    },
    {
      accessorKey: 'vehicle_number',
      header: 'Vehicle',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.vehicle_number || '—'}</span>
      ),
    },
    {
      accessorKey: 'items',
      header: 'Items',
      cell: ({ row }) => <span>{row.original.items?.length || 0}</span>,
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); handlePrint(row.original); }}
            title="Print Challan"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          {row.original.status === 'draft' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-blue-600 hover:text-blue-700"
              onClick={(e) => { e.stopPropagation(); dispatchMutation.mutate(row.original.id); }}
              disabled={dispatchMutation.isPending}
              title="Mark as Dispatched"
            >
              <Truck className="h-3.5 w-3.5" />
            </Button>
          )}
          {row.original.status === 'dispatched' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
              onClick={(e) => { e.stopPropagation(); deliverMutation.mutate(row.original.id); }}
              disabled={deliverMutation.isPending}
              title="Mark as Delivered"
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const customers = customersData || [];
  const salesOrders = salesOrdersData || [];
  const products = productsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Delivery Challans</h2>
          <p className="text-sm text-muted-foreground">Manage delivery challans and shipment tracking</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Challan
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search challans..."
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
                  {CHALLAN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : challanStatusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} challan{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load delivery challans</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No delivery challans found. Create your first challan to get started."
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
              <Truck className="h-5 w-5" />
              Create Delivery Challan
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Input label="Challan Date" type="date" {...register('date')} error={errors.date?.message} />
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
              <Input
                label="Vehicle Number"
                placeholder="MH 01 AB 1234"
                {...register('vehicle_number')}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Items</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ product_id: '', quantity: 1, remarks: '' })}
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
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Quantity</th>
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
                            onValueChange={(v) => setValue(`items.${index}.product_id`, v)}
                          >
                            <SelectTrigger className="min-w-[200px]">
                              <SelectValue placeholder="Select product" />
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
                            className="w-24"
                            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            className="w-40"
                            {...register(`items.${index}.remarks`)}
                            placeholder="Remarks"
                          />
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

            <Input label="Notes" placeholder="Delivery notes..." {...register('notes')} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create Challan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Challan: {viewingChallan?.challan_number}
            </DialogTitle>
          </DialogHeader>
          {viewingChallan && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{viewingChallan.customer_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingChallan.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={challanStatusVariant(viewingChallan.status)}>{challanStatusLabel(viewingChallan.status)}</Badge>
                </div>
                {viewingChallan.order_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Sales Order</p>
                    <p className="font-medium">{viewingChallan.order_number}</p>
                  </div>
                )}
                {viewingChallan.vehicle_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vehicle</p>
                    <p className="font-mono font-medium">{viewingChallan.vehicle_number}</p>
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
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Quantity</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingChallan.items || []).map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">{item.product_id}</td>
                          <td className="px-3 py-2 text-right font-medium">{item.quantity}</td>
                          <td className="px-3 py-2">{item.remarks || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePrint(viewingChallan)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Challan
                </Button>
              </div>

              {viewingChallan.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{viewingChallan.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
