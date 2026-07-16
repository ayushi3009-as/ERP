import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Search,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Package,
  AlertTriangle,
  Warehouse,
} from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
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
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

interface StockRow {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  warehouse_id: string;
  warehouse_name: string;
  batch?: string;
  color?: string;
  size?: string;
  quantity: number;
  reserved: number;
  available: number;
  avg_cost: number;
  value: number;
  min_stock_level?: number;
}

const stockInSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  rate: z.coerce.number().min(0, 'Rate must be 0 or more'),
  batch: z.string(),
  notes: z.string(),
});

const stockOutSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  notes: z.string(),
});

const transferSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  from_warehouse_id: z.string().min(1, 'Source warehouse is required'),
  to_warehouse_id: z.string().min(1, 'Destination warehouse is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  notes: z.string(),
});

type StockInData = z.infer<typeof stockInSchema>;
type StockOutData = z.infer<typeof stockOutSchema>;
type TransferData = z.infer<typeof transferSchema>;

type MovementDialog = 'stock_in' | 'stock_out' | 'transfer' | null;

export default function StockPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [activeDialog, setActiveDialog] = useState<MovementDialog>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stock', { search, warehouseFilter, lowStockOnly }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<StockRow>>('/v1/inventory/stock', {
        params: {
          search,
          per_page: 50,
          ...(warehouseFilter !== 'all' && { warehouse_id: warehouseFilter }),
          ...(lowStockOnly && { low_stock: true }),
        },
      });
      return data;
    },
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; name: string }>>('/v1/warehouses', {
        params: { per_page: 200 },
      });
      return data.data;
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; name: string; sku: string }>>('/v1/products', {
        params: { per_page: 500 },
      });
      return data.data;
    },
  });

  const stockInMutation = useMutation({
    mutationFn: async (values: StockInData) => {
      const { data } = await api.post('/v1/inventory/stock-in', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setActiveDialog(null);
    },
  });

  const stockOutMutation = useMutation({
    mutationFn: async (values: StockOutData) => {
      const { data } = await api.post('/v1/inventory/stock-out', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setActiveDialog(null);
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (values: TransferData) => {
      const { data } = await api.post('/v1/inventory/transfer', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setActiveDialog(null);
    },
  });

  const stockInForm = useForm<StockInData>({
    resolver: zodResolver(stockInSchema),
    defaultValues: { product_id: '', warehouse_id: '', quantity: 0, rate: 0, batch: '', notes: '' },
  });

  const stockOutForm = useForm<StockOutData>({
    resolver: zodResolver(stockOutSchema),
    defaultValues: { product_id: '', warehouse_id: '', quantity: 0, notes: '' },
  });

  const transferForm = useForm<TransferData>({
    resolver: zodResolver(transferSchema),
    defaultValues: { product_id: '', from_warehouse_id: '', to_warehouse_id: '', quantity: 0, notes: '' },
  });

  const columns: ColumnDef<StockRow, unknown>[] = [
    {
      accessorKey: 'product_name',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">{row.original.product_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.original.sku}</p>
        </div>
      ),
    },
    {
      accessorKey: 'warehouse_name',
      header: 'Warehouse',
      cell: ({ row }) => <span>{row.getValue('warehouse_name')}</span>,
    },
    {
      accessorKey: 'batch',
      header: 'Batch',
      cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('batch') || '—'}</span>,
    },
    {
      accessorKey: 'color',
      header: 'Color',
      cell: ({ row }) => <span>{row.getValue('color') || '—'}</span>,
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ row }) => <span>{row.getValue('size') || '—'}</span>,
    },
    {
      accessorKey: 'quantity',
      header: 'Qty',
      cell: ({ row }) => <span className="font-medium">{formatNumber(row.getValue('quantity') as number)}</span>,
    },
    {
      accessorKey: 'reserved',
      header: 'Reserved',
      cell: ({ row }) => {
        const reserved = row.getValue('reserved') as number;
        return <span className={cn(reserved > 0 && 'text-amber-600 font-medium')}>{formatNumber(reserved)}</span>;
      },
    },
    {
      accessorKey: 'available',
      header: 'Available',
      cell: ({ row }) => {
        const available = row.getValue('available') as number;
        const minStock = row.original.min_stock_level || 0;
        const isLow = minStock > 0 && available <= minStock;
        return (
          <span className={cn('font-medium', isLow && 'text-destructive')}>
            {formatNumber(available)}
            {isLow && <AlertTriangle className="ml-1 inline h-3 w-3" />}
          </span>
        );
      },
    },
    {
      accessorKey: 'avg_cost',
      header: 'Avg Cost',
      cell: ({ row }) => <span>{formatCurrency(row.getValue('avg_cost') as number)}</span>,
    },
    {
      accessorKey: 'value',
      header: 'Value',
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('value') as number)}</span>,
    },
  ];

  const totalValue = (data?.data || []).reduce((sum, row) => sum + row.value, 0);
  const lowStockCount = (data?.data || []).filter((r) => {
    const min = r.min_stock_level || 0;
    return min > 0 && r.available <= min;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Stock Overview</h2>
          <p className="text-sm text-muted-foreground">Current inventory levels across warehouses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setActiveDialog('stock_in')}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Stock In
          </Button>
          <Button variant="outline" onClick={() => setActiveDialog('stock_out')}>
            <ArrowUpFromLine className="mr-2 h-4 w-4" />
            Stock Out
          </Button>
          <Button variant="outline" onClick={() => setActiveDialog('transfer')}>
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Transfer
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-primary/10 p-3">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Items</p>
              <p className="text-xl font-bold text-foreground">{data?.total || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-emerald-100 p-3 dark:bg-emerald-900">
              <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(totalValue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-amber-100 p-3 dark:bg-amber-900">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Low Stock Items</p>
              <p className={cn('text-xl font-bold', lowStockCount > 0 ? 'text-destructive' : 'text-foreground')}>
                {lowStockCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {(warehousesData || []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={lowStockOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLowStockOnly(!lowStockOnly)}
              >
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                Low Stock
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load stock data</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No stock records found."
              pageSize={50}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={activeDialog === 'stock_in'} onOpenChange={(open) => { if (!open) setActiveDialog(null); stockInForm.reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-emerald-500" />
              Stock In
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={stockInForm.handleSubmit((v) => stockInMutation.mutate(v))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Product</label>
                <Select
                  value={stockInForm.watch('product_id')}
                  onValueChange={(v) => stockInForm.setValue('product_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productsData || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {stockInForm.formState.errors.product_id && (
                  <p className="mt-1 text-xs text-destructive">{stockInForm.formState.errors.product_id.message}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Warehouse</label>
                <Select
                  value={stockInForm.watch('warehouse_id')}
                  onValueChange={(v) => stockInForm.setValue('warehouse_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehousesData || []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {stockInForm.formState.errors.warehouse_id && (
                  <p className="mt-1 text-xs text-destructive">{stockInForm.formState.errors.warehouse_id.message}</p>
                )}
              </div>
              <Input
                label="Batch"
                placeholder="Batch number"
                {...stockInForm.register('batch')}
              />
              <Input
                label="Quantity"
                type="number"
                placeholder="0"
                {...stockInForm.register('quantity')}
                error={stockInForm.formState.errors.quantity?.message}
              />
              <Input
                label="Rate"
                type="number"
                placeholder="0.00"
                {...stockInForm.register('rate')}
                error={stockInForm.formState.errors.rate?.message}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Notes"
                  placeholder="Optional notes"
                  {...stockInForm.register('notes')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button>
              <Button type="submit" loading={stockInMutation.isPending}>Receive Stock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={activeDialog === 'stock_out'} onOpenChange={(open) => { if (!open) setActiveDialog(null); stockOutForm.reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-5 w-5 text-red-500" />
              Stock Out
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={stockOutForm.handleSubmit((v) => stockOutMutation.mutate(v))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Product</label>
                <Select
                  value={stockOutForm.watch('product_id')}
                  onValueChange={(v) => stockOutForm.setValue('product_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productsData || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {stockOutForm.formState.errors.product_id && (
                  <p className="mt-1 text-xs text-destructive">{stockOutForm.formState.errors.product_id.message}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Warehouse</label>
                <Select
                  value={stockOutForm.watch('warehouse_id')}
                  onValueChange={(v) => stockOutForm.setValue('warehouse_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehousesData || []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {stockOutForm.formState.errors.warehouse_id && (
                  <p className="mt-1 text-xs text-destructive">{stockOutForm.formState.errors.warehouse_id.message}</p>
                )}
              </div>
              <Input
                label="Quantity"
                type="number"
                placeholder="0"
                {...stockOutForm.register('quantity')}
                error={stockOutForm.formState.errors.quantity?.message}
              />
              <div>
                <Input
                  label="Notes"
                  placeholder="Optional notes"
                  {...stockOutForm.register('notes')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button>
              <Button type="submit" variant="destructive" loading={stockOutMutation.isPending}>Issue Stock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={activeDialog === 'transfer'} onOpenChange={(open) => { if (!open) setActiveDialog(null); transferForm.reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-blue-500" />
              Stock Transfer
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={transferForm.handleSubmit((v) => transferMutation.mutate(v))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Product</label>
                <Select
                  value={transferForm.watch('product_id')}
                  onValueChange={(v) => transferForm.setValue('product_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productsData || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {transferForm.formState.errors.product_id && (
                  <p className="mt-1 text-xs text-destructive">{transferForm.formState.errors.product_id.message}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">From Warehouse</label>
                <Select
                  value={transferForm.watch('from_warehouse_id')}
                  onValueChange={(v) => transferForm.setValue('from_warehouse_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Source warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehousesData || []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {transferForm.formState.errors.from_warehouse_id && (
                  <p className="mt-1 text-xs text-destructive">{transferForm.formState.errors.from_warehouse_id.message}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">To Warehouse</label>
                <Select
                  value={transferForm.watch('to_warehouse_id')}
                  onValueChange={(v) => transferForm.setValue('to_warehouse_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Destination warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehousesData || []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {transferForm.formState.errors.to_warehouse_id && (
                  <p className="mt-1 text-xs text-destructive">{transferForm.formState.errors.to_warehouse_id.message}</p>
                )}
              </div>
              <Input
                label="Quantity"
                type="number"
                placeholder="0"
                {...transferForm.register('quantity')}
                error={transferForm.formState.errors.quantity?.message}
              />
              <div>
                <Input
                  label="Notes"
                  placeholder="Optional notes"
                  {...transferForm.register('notes')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button>
              <Button type="submit" loading={transferMutation.isPending}>Transfer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
