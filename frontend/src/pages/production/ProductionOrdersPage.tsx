import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  AlertCircle,
  Eye,
  X,
  Factory,
  ChevronRight,
  CheckCircle2,
  Circle,
  ArrowRight,
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
import { cn, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type {
  ProductionOrder,
  Product,
  PaginatedResponse,
} from '@/types';

const STAGES = [
  'Planning',
  'Cutting',
  'Bundle',
  'Printing',
  'Embroidery',
  'Stitching',
  'Checking',
  'Ironing',
  'Packing',
  'Finished',
  'Dispatch',
] as const;

type Stage = (typeof STAGES)[number];

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const STATUSES = ['all', 'planned', 'in_progress', 'completed', 'on_hold', 'cancelled'] as const;

const poSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  style: z.string(),
  bom_id: z.string(),
  planned_quantity: z.coerce.number().min(1, 'Quantity must be >= 1'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string(),
  priority: z.enum(PRIORITIES),
  sales_order_id: z.string(),
  remarks: z.string(),
});

type POFormData = z.infer<typeof poSchema>;

interface PORow extends ProductionOrder {
  product_name?: string;
  style_name?: string;
  current_stage?: string;
  priority?: string;
  completed_qty?: number;
  stage_details?: StageDetail[];
}

interface StageDetail {
  stage: string;
  input_qty: number;
  output_qty: number;
  rejected_qty: number;
  operator_name?: string;
  machine_name?: string;
  started_at?: string;
  completed_at?: string;
}

const stageVariant = (stage: string | undefined) => {
  switch (stage) {
    case 'Planning': return 'secondary' as const;
    case 'Cutting': return 'outline' as const;
    case 'Bundle': return 'outline' as const;
    case 'Printing': return 'default' as const;
    case 'Embroidery': return 'default' as const;
    case 'Stitching': return 'warning' as const;
    case 'Checking': return 'warning' as const;
    case 'Ironing': return 'secondary' as const;
    case 'Packing': return 'success' as const;
    case 'Finished': return 'success' as const;
    case 'Dispatch': return 'success' as const;
    default: return 'outline' as const;
  }
};

const statusVariant = (status: string) => {
  switch (status) {
    case 'planned': return 'secondary' as const;
    case 'in_progress': return 'warning' as const;
    case 'completed': return 'success' as const;
    case 'on_hold': return 'outline' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'planned': return 'Planned';
    case 'in_progress': return 'In Progress';
    case 'completed': return 'Completed';
    case 'on_hold': return 'On Hold';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

const priorityVariant = (priority: string | undefined) => {
  switch (priority) {
    case 'urgent': return 'destructive' as const;
    case 'high': return 'warning' as const;
    case 'medium': return 'default' as const;
    case 'low': return 'secondary' as const;
    default: return 'outline' as const;
  }
};

const advanceStageSchema = z.object({
  stage: z.string().min(1, 'Stage is required'),
  input_qty: z.coerce.number().min(0, 'Input qty must be >= 0'),
  output_qty: z.coerce.number().min(0, 'Output qty must be >= 0'),
  rejected_qty: z.coerce.number().min(0, 'Rejected qty must be >= 0'),
  operator_id: z.string(),
  machine_id: z.string(),
  remarks: z.string(),
});

type AdvanceStageFormData = z.infer<typeof advanceStageSchema>;

export default function ProductionOrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PORow | null>(null);
  const [viewingPO, setViewingPO] = useState<PORow | null>(null);
  const [deletingPO, setDeletingPO] = useState<PORow | null>(null);
  const [advancingPO, setAdvancingPO] = useState<PORow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['production-orders', { search, page, statusFilter, stageFilter, priorityFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PORow>>('/v1/production-orders', {
        params: {
          search,
          page,
          per_page: 20,
          ...(statusFilter !== 'all' && { status: statusFilter }),
          ...(stageFilter !== 'all' && { current_stage: stageFilter }),
          ...(priorityFilter !== 'all' && { priority: priorityFilter }),
        },
      });
      return data;
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

  const { data: bomsData } = useQuery({
    queryKey: ['boms', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; bom_number: string; product_id: string }>>('/v1/boms', {
        params: { per_page: 200, status: 'active' },
      });
      return data.data;
    },
    enabled: createDialogOpen,
  });

  const { data: salesOrdersData } = useQuery({
    queryKey: ['sales-orders', 'linkable'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; order_number: string }>>('/v1/sales-orders', {
        params: { per_page: 200, status: 'confirmed' },
      });
      return data.data;
    },
    enabled: createDialogOpen,
  });

  const { data: operatorsData } = useQuery({
    queryKey: ['employees', 'operators'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; name: string }>>('/v1/employees', {
        params: { per_page: 200 },
      });
      return data.data;
    },
    enabled: advanceDialogOpen,
  });

  const { data: machinesData } = useQuery({
    queryKey: ['machines', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; name: string }>>('/v1/machines', {
        params: { per_page: 200 },
      });
      return data.data;
    },
    enabled: advanceDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (values: POFormData) => {
      const { data } = await api.post('/v1/production-orders', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: POFormData & { id: string }) => {
      const { data } = await api.put(`/v1/production-orders/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/production-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      setDeleteDialogOpen(false);
      setDeletingPO(null);
    },
  });

  const advanceStageMutation = useMutation({
    mutationFn: async ({ id, ...values }: AdvanceStageFormData & { id: string }) => {
      const { data } = await api.post(`/v1/production-orders/${id}/advance-stage`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      queryClient.invalidateQueries({ queryKey: ['production-order-detail'] });
      setAdvanceDialogOpen(false);
      setAdvancingPO(null);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<POFormData>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      product_id: '',
      style: '',
      bom_id: '',
      planned_quantity: 1,
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      priority: 'medium',
      sales_order_id: '',
      remarks: '',
    },
  });

  const {
    register: registerAdvance,
    handleSubmit: handleSubmitAdvance,
    reset: resetAdvance,
    setValue: setValueAdvance,
    watch: watchAdvance,
    formState: { errors: advanceErrors },
  } = useForm<AdvanceStageFormData>({
    resolver: zodResolver(advanceStageSchema),
    defaultValues: {
      stage: '',
      input_qty: 0,
      output_qty: 0,
      rejected_qty: 0,
      operator_id: '',
      machine_id: '',
      remarks: '',
    },
  });

  function resetForm() {
    reset({
      product_id: '',
      style: '',
      bom_id: '',
      planned_quantity: 1,
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      priority: 'medium',
      sales_order_id: '',
      remarks: '',
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
      product_id: po.product_id,
      style: po.style_name || '',
      bom_id: po.bom_id || '',
      planned_quantity: po.planned_quantity,
      start_date: po.start_date || po.date,
      end_date: po.end_date || '',
      priority: (po.priority as POFormData['priority']) || 'medium',
      sales_order_id: po.sales_order_id || '',
      remarks: po.remarks || '',
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

  function openAdvanceStage(po: PORow) {
    setAdvancingPO(po);
    const currentIdx = STAGES.indexOf((po.current_stage || 'Planning') as Stage);
    const nextStage = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : STAGES[currentIdx];
    resetAdvance({
      stage: nextStage,
      input_qty: po.completed_qty || po.produced_quantity || 0,
      output_qty: 0,
      rejected_qty: 0,
      operator_id: '',
      machine_id: '',
      remarks: '',
    });
    setAdvanceDialogOpen(true);
  }

  function onSubmit(values: POFormData) {
    if (editingPO) {
      updateMutation.mutate({ ...values, id: editingPO.id });
    } else {
      createMutation.mutate(values);
    }
  }

  function onAdvanceSubmit(values: AdvanceStageFormData) {
    if (advancingPO) {
      advanceStageMutation.mutate({ ...values, id: advancingPO.id });
    }
  }

  const getOverallProgress = (po: PORow): number => {
    const currentIdx = STAGES.indexOf((po.current_stage || 'Planning') as Stage);
    if (currentIdx === -1) return 0;
    if (po.status === 'completed') return 100;
    return Math.round((currentIdx / (STAGES.length - 1)) * 100);
  };

  const columns: ColumnDef<PORow, unknown>[] = [
    {
      accessorKey: 'order_number',
      header: 'Production #',
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
      accessorKey: 'product_name',
      header: 'Product',
      cell: ({ row }) => <span className="font-medium">{row.getValue('product_name') || row.original.product_id}</span>,
    },
    {
      accessorKey: 'style_name',
      header: 'Style',
      cell: ({ row }) => <span>{row.getValue('style_name') || '—'}</span>,
    },
    {
      accessorKey: 'planned_quantity',
      header: 'Planned Qty',
      cell: ({ row }) => <span className="font-medium">{row.getValue('planned_quantity')}</span>,
    },
    {
      accessorKey: 'completed_qty',
      header: 'Completed Qty',
      cell: ({ row }) => {
        const completed = (row.getValue('completed_qty') as number) || row.original.produced_quantity || 0;
        return <span>{completed}</span>;
      },
    },
    {
      accessorKey: 'current_stage',
      header: 'Current Stage',
      cell: ({ row }) => {
        const stage = (row.getValue('current_stage') as string) || 'Planning';
        return <Badge variant={stageVariant(stage)}>{stage}</Badge>;
      },
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
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => {
        const priority = row.original.priority || 'medium';
        return <Badge variant={priorityVariant(priority)}>{priority}</Badge>;
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
          {(row.original.status === 'planned' || row.original.status === 'in_progress') && (
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
                onClick={(e) => { e.stopPropagation(); openAdvanceStage(row.original); }}
                title="Advance Stage"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); openDelete(row.original); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const isPending = createMutation.isPending || updateMutation.isPending;
  const products = productsData || [];
  const boms = bomsData || [];
  const salesOrders = salesOrdersData || [];
  const operators = operatorsData || [];
  const machines = machinesData || [];

  const filteredBoms = useMemo(() => {
    const productId = watch('product_id');
    if (!productId) return boms;
    return boms.filter((b) => b.product_id === productId);
  }, [boms, watch('product_id')]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Production Orders</h2>
          <p className="text-sm text-muted-foreground">Manage production orders and track manufacturing stages</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Order
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
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
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load production orders</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No production orders found. Create your first order to get started."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingPO ? 'Edit Production Order' : 'Create Production Order'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Product *</label>
                <Select
                  value={watch('product_id') || ''}
                  onValueChange={(v) => setValue('product_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.product_id && (
                  <p className="mt-1 text-xs text-destructive">{errors.product_id.message}</p>
                )}
              </div>
              <Input label="Style" {...register('style')} placeholder="Style reference" />
              <div>
                <label className="text-sm font-medium text-foreground">BOM</label>
                <Select
                  value={watch('bom_id') || ''}
                  onValueChange={(v) => setValue('bom_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select BOM" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBoms.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.bom_number} (v{b.id.slice(0, 6)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                label="Planned Quantity *"
                type="number"
                {...register('planned_quantity', { valueAsNumber: true })}
                error={errors.planned_quantity?.message}
              />
              <Input
                label="Planned Start Date *"
                type="date"
                {...register('start_date')}
                error={errors.start_date?.message}
              />
              <Input label="Planned End Date" type="date" {...register('end_date')} />
              <div>
                <label className="text-sm font-medium text-foreground">Priority</label>
                <Select
                  value={watch('priority') || 'medium'}
                  onValueChange={(v) => setValue('priority', v as POFormData['priority'])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Link to Sales Order</label>
                <Select
                  value={watch('sales_order_id') || ''}
                  onValueChange={(v) => setValue('sales_order_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sales order (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesOrders.map((so) => (
                      <SelectItem key={so.id} value={so.id}>{so.order_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Input label="Remarks" {...register('remarks')} placeholder="Additional notes..." />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                {editingPO ? 'Update Order' : 'Create Order'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Production Order: {viewingPO?.order_number}
            </DialogTitle>
          </DialogHeader>
          {viewingPO && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Product</p>
                    <p className="font-medium">{viewingPO.product_name || viewingPO.product_id}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={statusVariant(viewingPO.status)}>{statusLabel(viewingPO.status)}</Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Planned Qty</p>
                    <p className="text-lg font-bold">{viewingPO.planned_quantity}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Completed Qty</p>
                    <p className="text-lg font-bold">{viewingPO.completed_qty || viewingPO.produced_quantity || 0}</p>
                  </CardContent>
                </Card>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Stage Pipeline</h4>
                  <span className="text-sm text-muted-foreground">{getOverallProgress(viewingPO)}% complete</span>
                </div>
                <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${getOverallProgress(viewingPO)}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {STAGES.map((stage, idx) => {
                    const currentIdx = STAGES.indexOf((viewingPO.current_stage || 'Planning') as Stage);
                    const isCompleted = idx < currentIdx || viewingPO.status === 'completed';
                    const isCurrent = idx === currentIdx && viewingPO.status !== 'completed';
                    const stageDetail = viewingPO.stage_details?.find((d) => d.stage === stage);

                    return (
                      <div key={stage} className="flex items-center">
                        <div
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs',
                            isCompleted && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                            isCurrent && 'border-primary bg-primary/10 text-primary font-semibold',
                            !isCompleted && !isCurrent && 'border-border text-muted-foreground',
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : isCurrent ? (
                            <Circle className="h-3.5 w-3.5 fill-current" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 opacity-40" />
                          )}
                          {stage}
                        </div>
                        {idx < STAGES.length - 1 && (
                          <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {viewingPO.stage_details && viewingPO.stage_details.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Stage Details</h4>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Input Qty</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Output Qty</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rejected</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Operator</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Machine</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingPO.stage_details.map((detail, idx) => (
                          <tr key={idx} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-medium">{detail.stage}</td>
                            <td className="px-3 py-2 text-right">{detail.input_qty}</td>
                            <td className="px-3 py-2 text-right">{detail.output_qty}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={detail.rejected_qty > 0 ? 'text-destructive' : ''}>
                                {detail.rejected_qty}
                              </span>
                            </td>
                            <td className="px-3 py-2">{detail.operator_name || '—'}</td>
                            <td className="px-3 py-2">{detail.machine_name || '—'}</td>
                            <td className="px-3 py-2 text-xs">
                              {detail.started_at ? formatDate(detail.started_at, 'dd MMM HH:mm') : '—'}
                              {detail.completed_at && ` → ${formatDate(detail.completed_at, 'dd MMM HH:mm')}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingPO.date)}</p>
                </div>
                {viewingPO.start_date && (
                  <div>
                    <p className="text-xs text-muted-foreground">Start Date</p>
                    <p className="font-medium">{formatDate(viewingPO.start_date)}</p>
                  </div>
                )}
                {viewingPO.end_date && (
                  <div>
                    <p className="text-xs text-muted-foreground">End Date</p>
                    <p className="font-medium">{formatDate(viewingPO.end_date)}</p>
                  </div>
                )}
                {viewingPO.priority && (
                  <div>
                    <p className="text-xs text-muted-foreground">Priority</p>
                    <Badge variant={priorityVariant(viewingPO.priority)}>{viewingPO.priority}</Badge>
                  </div>
                )}
              </div>

              {viewingPO.remarks && (
                <div>
                  <p className="text-xs text-muted-foreground">Remarks</p>
                  <p className="text-sm">{viewingPO.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={advanceDialogOpen} onOpenChange={(open) => {
        setAdvanceDialogOpen(open);
        if (!open) setAdvancingPO(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Advance Stage — {advancingPO?.order_number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitAdvance(onAdvanceSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Next Stage *</label>
              <Select
                value={watchAdvance('stage') || ''}
                onValueChange={(v) => setValueAdvance('stage', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {advanceErrors.stage && (
                <p className="mt-1 text-xs text-destructive">{advanceErrors.stage.message}</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Input Qty"
                type="number"
                {...registerAdvance('input_qty', { valueAsNumber: true })}
                error={advanceErrors.input_qty?.message}
              />
              <Input
                label="Output Qty"
                type="number"
                {...registerAdvance('output_qty', { valueAsNumber: true })}
                error={advanceErrors.output_qty?.message}
              />
              <Input
                label="Rejected Qty"
                type="number"
                {...registerAdvance('rejected_qty', { valueAsNumber: true })}
                error={advanceErrors.rejected_qty?.message}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Operator</label>
                <Select
                  value={watchAdvance('operator_id') || ''}
                  onValueChange={(v) => setValueAdvance('operator_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Machine</label>
                <Select
                  value={watchAdvance('machine_id') || ''}
                  onValueChange={(v) => setValueAdvance('machine_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {machines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Input label="Remarks" {...registerAdvance('remarks')} placeholder="Stage notes..." />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdvanceDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={advanceStageMutation.isPending}>
                Advance Stage
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Production Order</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete order{' '}
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
