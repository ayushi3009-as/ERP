import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  Eye,
  AlertCircle,
  Send,
  Package,
  ClipboardCheck,
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
  GRN,
  GRNItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Vendor,
  PaginatedResponse,
} from '@/types';

const grnItemSchema = z.object({
  product_id: z.string(),
  ordered_qty: z.coerce.number().min(0),
  received_qty: z.coerce.number().min(0),
  accepted_qty: z.coerce.number().min(0),
  rejected_qty: z.coerce.number().min(0),
  batch_number: z.string(),
  lot_number: z.string(),
  roll_number: z.string(),
  remarks: z.string(),
});

const grnSchema = z.object({
  purchase_order_id: z.string().min(1, 'Purchase Order is required'),
  date: z.string().min(1, 'Date is required'),
  remarks: z.string(),
  items: z.array(grnItemSchema).min(1, 'At least one item is required'),
});

type GRNFormData = z.infer<typeof grnSchema>;

interface GRNRow extends GRN {
  vendor_name?: string;
  po_number?: string;
}

const GRN_STATUSES = ['all', 'draft', 'confirmed', 'cancelled'] as const;

const grnStatusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'confirmed': return 'success' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

const grnStatusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'confirmed': return 'Confirmed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

export default function GRNPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingGRN, setViewingGRN] = useState<GRNRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['grns', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<GRNRow>>('/v1/grns', {
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

  const { data: purchaseOrdersData } = useQuery({
    queryKey: ['purchase-orders', 'selectable'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PurchaseOrder>>('/v1/purchase-orders', {
        params: { status: 'confirmed', per_page: 200 },
      });
      return data.data;
    },
    enabled: createDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (values: GRNFormData) => {
      const { data } = await api.post('/v1/grns', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grns'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/v1/grns/${id}/submit`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grns'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
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
  } = useForm<GRNFormData>({
    resolver: zodResolver(grnSchema),
    defaultValues: {
      purchase_order_id: '',
      date: new Date().toISOString().split('T')[0],
      remarks: '',
      items: [],
    },
  });

  const { fields } = useFieldArray({ control, name: 'items' });
  const watchedPOId = watch('purchase_order_id');

  const { data: poDetailData, isLoading: poDetailLoading } = useQuery({
    queryKey: ['purchase-order-detail', watchedPOId],
    queryFn: async () => {
      if (!watchedPOId) return null;
      const { data } = await api.get<PurchaseOrder>(`/v1/purchase-orders/${watchedPOId}`);
      return data;
    },
    enabled: !!watchedPOId && createDialogOpen,
  });

  const handlePOSelect = useCallback(
    (poId: string) => {
      setValue('purchase_order_id', poId);
    },
    [setValue],
  );

  const poItems = poDetailData?.items || [];

  const populateItemsFromPO = useCallback(() => {
    if (!poDetailData) return;
    const items = poDetailData.items.map((item) => ({
      product_id: item.product_id,
      ordered_qty: item.quantity,
      received_qty: 0,
      accepted_qty: 0,
      rejected_qty: 0,
      batch_number: '',
      lot_number: '',
      roll_number: '',
      remarks: '',
    }));
    reset({
      purchase_order_id: poDetailData.id,
      date: new Date().toISOString().split('T')[0],
      remarks: '',
      items,
    });
  }, [poDetailData, reset]);

  function resetForm() {
    reset({
      purchase_order_id: '',
      date: new Date().toISOString().split('T')[0],
      remarks: '',
      items: [],
    });
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openView(grn: GRNRow) {
    setViewingGRN(grn);
    setViewDialogOpen(true);
  }

  function onSubmit(values: GRNFormData) {
    createMutation.mutate(values);
  }

  const columns: ColumnDef<GRNRow, unknown>[] = [
    {
      accessorKey: 'grn_number',
      header: 'GRN Number',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('grn_number')}</span>
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
      accessorKey: 'po_number',
      header: 'PO Number',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.getValue('po_number') || '—'}</span>
      ),
    },
    {
      accessorKey: 'vendor_name',
      header: 'Vendor',
      cell: ({ row }) => <span>{row.getValue('vendor_name') || '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return <Badge variant={grnStatusVariant(status)}>{grnStatusLabel(status)}</Badge>;
      },
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
          {row.original.status === 'draft' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
              onClick={(e) => { e.stopPropagation(); submitMutation.mutate(row.original.id); }}
              disabled={submitMutation.isPending}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const purchaseOrders = purchaseOrdersData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Goods Received Notes</h2>
          <p className="text-sm text-muted-foreground">Record and manage incoming goods against purchase orders</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create GRN
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search GRNs..."
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
                  {GRN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : grnStatusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} GRN{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load GRNs</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No GRNs found. Create your first GRN to get started."
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
              <ClipboardCheck className="h-5 w-5" />
              Create GRN
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Purchase Order *</label>
                <Select
                  value={watch('purchase_order_id') || ''}
                  onValueChange={(v) => handlePOSelect(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select PO" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map((po) => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.order_number} — {formatDate(po.date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.purchase_order_id && (
                  <p className="mt-1 text-xs text-destructive">{errors.purchase_order_id.message}</p>
                )}
              </div>
              <Input label="GRN Date" type="date" {...register('date')} error={errors.date?.message} />
            </div>

            {watchedPOId && poDetailData && (
              <div className="rounded-md border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      PO: {poDetailData.order_number} | Vendor: {poDetailData.vendor_id}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={populateItemsFromPO}
                  >
                    Populate Items
                  </Button>
                </div>
              </div>
            )}

            {fields.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold">Received Items</h4>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ordered</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Received</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Accepted</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rejected</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Batch/Lot</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Roll #</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, index) => (
                        <tr key={field.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <input type="hidden" {...register(`items.${index}.product_id`)} />
                            <input type="hidden" {...register(`items.${index}.ordered_qty`)} />
                            <span className="text-xs">{field.product_id}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {watch(`items.${index}.ordered_qty`) || 0}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              className="w-20"
                              {...register(`items.${index}.received_qty`, { valueAsNumber: true })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              className="w-20"
                              {...register(`items.${index}.accepted_qty`, { valueAsNumber: true })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              className="w-20"
                              {...register(`items.${index}.rejected_qty`, { valueAsNumber: true })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <Input
                                placeholder="Batch"
                                className="w-20"
                                {...register(`items.${index}.batch_number`)}
                              />
                              <Input
                                placeholder="Lot"
                                className="w-20"
                                {...register(`items.${index}.lot_number`)}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              placeholder="Roll #"
                              className="w-20"
                              {...register(`items.${index}.roll_number`)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Input label="Remarks" placeholder="Any remarks..." {...register('remarks')} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create GRN
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              GRN: {viewingGRN?.grn_number}
            </DialogTitle>
          </DialogHeader>
          {viewingGRN && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">PO Number</p>
                  <p className="font-medium">{viewingGRN.po_number || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  <p className="font-medium">{viewingGRN.vendor_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingGRN.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={grnStatusVariant(viewingGRN.status)}>{grnStatusLabel(viewingGRN.status)}</Badge>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Items</h4>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ordered</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Received</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Accepted</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rejected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingGRN.items || []).map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">{item.product_id}</td>
                          <td className="px-3 py-2 text-right">{item.ordered_qty}</td>
                          <td className="px-3 py-2 text-right">{item.received_qty}</td>
                          <td className="px-3 py-2 text-right">{item.accepted_qty}</td>
                          <td className="px-3 py-2 text-right">{item.rejected_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {viewingGRN.remarks && (
                <div>
                  <p className="text-xs text-muted-foreground">Remarks</p>
                  <p className="text-sm">{viewingGRN.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
