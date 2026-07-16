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
  X,
  FileText,
  CheckCircle,
  Layers,
  ArrowLeftRight,
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
import { cn, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import type {
  BOM,
  BOMItem,
  Product,
  PaginatedResponse,
} from '@/types';

const bomItemSchema = z.object({
  product_id: z.string().min(1, 'Raw material is required'),
  quantity: z.coerce.number().min(0.01, 'Qty must be > 0'),
  wastage_percent: z.coerce.number().min(0).max(100),
  unit_cost: z.coerce.number().min(0, 'Cost must be >= 0'),
});

const bomSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  style_id: z.string(),
  quantity: z.coerce.number().min(1, 'Quantity must be >= 1'),
  remarks: z.string(),
  items: z.array(bomItemSchema).min(1, 'At least one BOM item is required'),
});

type BOMFormData = z.infer<typeof bomSchema>;

interface BOMRow extends BOM {
  product_name?: string;
  style_name?: string;
  total_cost?: number;
  items_count?: number;
}

interface BOMDetail extends BOM {
  product_name?: string;
  style_name?: string;
  total_cost?: number;
  items: (BOMItem & { product_name?: string; unit_cost?: number; total_cost?: number })[];
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'active': return 'success' as const;
    case 'inactive': return 'outline' as const;
    default: return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'active': return 'Active';
    case 'inactive': return 'Inactive';
    default: return status;
  }
};

const STATUSES = ['all', 'draft', 'active', 'inactive'] as const;

export default function BOMPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [editingBOM, setEditingBOM] = useState<BOMRow | null>(null);
  const [viewingBOM, setViewingBOM] = useState<BOMDetail | null>(null);
  const [deletingBOM, setDeletingBOM] = useState<BOMRow | null>(null);
  const [comparingBOM, setComparingBOM] = useState<BOMRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['boms', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<BOMRow>>('/v1/boms', {
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

  const { data: compareVersionsData } = useQuery({
    queryKey: ['boms', 'versions', comparingBOM?.product_id],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<BOMRow>>('/v1/boms', {
        params: {
          product_id: comparingBOM?.product_id,
          per_page: 50,
        },
      });
      return data.data;
    },
    enabled: !!comparingBOM?.product_id && compareDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (values: BOMFormData) => {
      const { data } = await api.post('/v1/boms', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: BOMFormData & { id: string }) => {
      const { data } = await api.put(`/v1/boms/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/v1/boms/${id}/approve`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/boms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
      setDeleteDialogOpen(false);
      setDeletingBOM(null);
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
  } = useForm<BOMFormData>({
    resolver: zodResolver(bomSchema),
    defaultValues: {
      product_id: '',
      style_id: '',
      quantity: 1,
      remarks: '',
      items: [{ product_id: '', quantity: 1, wastage_percent: 0, unit_cost: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  const totalCost = useMemo(() => {
    return watchedItems?.reduce((sum, item) => {
      if (!item) return sum;
      const qty = item.quantity || 0;
      const wastage = item.wastage_percent || 0;
      const unitCost = item.unit_cost || 0;
      const effectiveQty = qty * (1 + wastage / 100);
      return sum + effectiveQty * unitCost;
    }, 0) || 0;
  }, [watchedItems]);

  const recalcItemTotal = useCallback(
    (index: number) => {
      const item = watchedItems?.[index];
      if (!item) return;
      const qty = item.quantity || 0;
      const wastage = item.wastage_percent || 0;
      const unitCost = item.unit_cost || 0;
      const effectiveQty = qty * (1 + wastage / 100);
      return effectiveQty * unitCost;
    },
    [watchedItems],
  );

  function resetForm() {
    reset({
      product_id: '',
      style_id: '',
      quantity: 1,
      remarks: '',
      items: [{ product_id: '', quantity: 1, wastage_percent: 0, unit_cost: 0 }],
    });
    setEditingBOM(null);
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openEdit(bom: BOMRow) {
    setEditingBOM(bom);
    reset({
      product_id: bom.product_id,
      style_id: bom.style_name || '',
      quantity: 1,
      remarks: bom.remarks || '',
      items: (bom.items || []).map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        wastage_percent: item.wastage_percent || 0,
        unit_cost: 0,
      })),
    });
    setCreateDialogOpen(true);
  }

  function openView(bom: BOMRow) {
    setViewingBOM(bom as unknown as BOMDetail);
    setViewDialogOpen(true);
  }

  function openDelete(bom: BOMRow) {
    setDeletingBOM(bom);
    setDeleteDialogOpen(true);
  }

  function openCompare(bom: BOMRow) {
    setComparingBOM(bom);
    setCompareDialogOpen(true);
  }

  function onSubmit(values: BOMFormData) {
    if (editingBOM) {
      updateMutation.mutate({ ...values, id: editingBOM.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<BOMRow, unknown>[] = [
    {
      accessorKey: 'bom_number',
      header: 'BOM #',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('bom_number')}</span>
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
      accessorKey: 'version',
      header: 'Version',
      cell: ({ row }) => <span className="font-mono text-xs">v{row.getValue('version')}</span>,
    },
    {
      accessorKey: 'total_cost',
      header: 'Total Cost',
      cell: ({ row }) => {
        const cost = (row.getValue('total_cost') as number) || 0;
        return <span className="font-medium">{formatCurrency(cost)}</span>;
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
                onClick={(e) => { e.stopPropagation(); approveMutation.mutate(row.original.id); }}
                disabled={approveMutation.isPending}
                title="Approve BOM"
              >
                <CheckCircle className="h-3.5 w-3.5" />
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-600 hover:text-blue-700"
            onClick={(e) => { e.stopPropagation(); openCompare(row.original); }}
            title="Compare Versions"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const isPending = createMutation.isPending || updateMutation.isPending;
  const products = productsData || [];
  const compareVersions = compareVersionsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Bill of Materials</h2>
          <p className="text-sm text-muted-foreground">Manage BOMs and track material costs</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create BOM
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search BOMs..."
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
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} BOM{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load BOMs</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No BOMs found. Create your first BOM to get started."
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
            <DialogTitle>{editingBOM ? 'Edit BOM' : 'Create BOM'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
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
              <Input label="Style" {...register('style_id')} placeholder="Style reference" />
              <Input
                label="Quantity *"
                type="number"
                {...register('quantity', { valueAsNumber: true })}
                error={errors.quantity?.message}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">BOM Items (Raw Materials)</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ product_id: '', quantity: 1, wastage_percent: 0, unit_cost: 0 })}
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
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Raw Material</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Quantity</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Wastage %</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Unit Cost</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total Cost</th>
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
                              if (prod?.cost_price) {
                                setValue(`items.${index}.unit_cost`, prod.cost_price);
                              }
                            }}
                          >
                            <SelectTrigger className="min-w-[160px]">
                              <SelectValue placeholder="Select material" />
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
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            className="w-16"
                            {...register(`items.${index}.wastage_percent`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            className="w-24"
                            {...register(`items.${index}.unit_cost`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatCurrency(recalcItemTotal(index) || 0)}
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
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold">
                        Total BOM Cost
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold">
                        {formatCurrency(totalCost)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <Input label="Remarks" {...register('remarks')} placeholder="Additional notes..." />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                {editingBOM ? 'Update BOM' : 'Create BOM'}
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
              BOM: {viewingBOM?.bom_number}
            </DialogTitle>
          </DialogHeader>
          {viewingBOM && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Product</p>
                    <p className="font-medium">{viewingBOM.product_name || viewingBOM.product_id}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Version</p>
                    <p className="font-mono text-lg font-bold">v{viewingBOM.version}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={statusVariant(viewingBOM.status)}>{statusLabel(viewingBOM.status)}</Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="text-lg font-bold">{formatCurrency(viewingBOM.total_cost || 0)}</p>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">BOM Items</h4>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Material</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Quantity</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Wastage %</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Unit Cost</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingBOM.items || []).map((item, idx) => {
                        const effectiveQty = item.quantity * (1 + (item.wastage_percent || 0) / 100);
                        const itemTotal = effectiveQty * (item.unit_cost || 0);
                        return (
                          <tr key={item.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium">{item.product_name || item.product_id}</td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2 text-right">{item.wastage_percent || 0}%</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(item.unit_cost || 0)}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatCurrency(itemTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30">
                        <td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold">Total</td>
                        <td className="px-3 py-2 text-right text-sm font-bold">
                          {formatCurrency(viewingBOM.total_cost || 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {viewingBOM.operations && viewingBOM.operations.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Operations</h4>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Seq</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Operation</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Machine Type</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Time (min)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingBOM.operations.map((op) => (
                          <tr key={op.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">{op.sequence}</td>
                            <td className="px-3 py-2 font-medium">{op.operation_name}</td>
                            <td className="px-3 py-2">{op.machine_type || '—'}</td>
                            <td className="px-3 py-2 text-right">{op.time_in_minutes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewingBOM.remarks && (
                <div>
                  <p className="text-xs text-muted-foreground">Remarks</p>
                  <p className="text-sm">{viewingBOM.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              Compare BOM Versions
            </DialogTitle>
          </DialogHeader>
          {comparingBOM && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                All BOM versions for product: <span className="font-medium text-foreground">{comparingBOM.product_name || comparingBOM.product_id}</span>
              </p>
              {compareVersions.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">BOM #</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Version</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total Cost</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareVersions.map((v) => (
                        <tr
                          key={v.id}
                          className={cn(
                            'border-b border-border last:border-0',
                            v.id === comparingBOM.id && 'bg-primary/5',
                          )}
                        >
                          <td className="px-3 py-2 font-mono text-xs">{v.bom_number}</td>
                          <td className="px-3 py-2 font-mono">v{v.version}</td>
                          <td className="px-3 py-2">
                            <Badge variant={statusVariant(v.status)}>{statusLabel(v.status)}</Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatCurrency(v.total_cost || 0)}
                          </td>
                          <td className="px-3 py-2 text-right">{v.items_count || v.items?.length || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <Layers className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">No other versions found for this product</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete BOM</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete BOM{' '}
              <span className="font-medium text-foreground">{deletingBOM?.bom_number}</span>?
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deletingBOM && deleteMutation.mutate(deletingBOM.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
