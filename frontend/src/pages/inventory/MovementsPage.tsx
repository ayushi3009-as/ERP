import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Settings,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

type TabType = 'stock_in' | 'stock_out' | 'transfer' | 'adjustment';

const stockInSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  rate: z.coerce.number().min(0),
  batch: z.string(),
  color: z.string(),
  size: z.string(),
  notes: z.string(),
});

const stockOutSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  batch: z.string(),
  notes: z.string(),
});

const transferSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  from_warehouse_id: z.string().min(1, 'Source warehouse is required'),
  to_warehouse_id: z.string().min(1, 'Destination warehouse is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  notes: z.string(),
});

const adjustmentSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  adjustment_type: z.string().min(1, 'Adjustment type is required'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string(),
});

type StockInData = z.infer<typeof stockInSchema>;
type StockOutData = z.infer<typeof stockOutSchema>;
type TransferData = z.infer<typeof transferSchema>;
type AdjustmentData = z.infer<typeof adjustmentSchema>;

const TABS: { key: TabType; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { key: 'stock_in', label: 'Stock In', icon: ArrowDownToLine, color: 'text-emerald-500' },
  { key: 'stock_out', label: 'Stock Out', icon: ArrowUpFromLine, color: 'text-red-500' },
  { key: 'transfer', label: 'Transfer', icon: ArrowLeftRight, color: 'text-blue-500' },
  { key: 'adjustment', label: 'Adjustment', icon: Settings, color: 'text-amber-500' },
];

export default function MovementsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('stock_in');
  const [successMessage, setSuccessMessage] = useState('');

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
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      stockInForm.reset();
      showSuccess('Stock received successfully');
    },
  });

  const stockOutMutation = useMutation({
    mutationFn: async (values: StockOutData) => {
      const { data } = await api.post('/v1/inventory/stock-out', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      stockOutForm.reset();
      showSuccess('Stock issued successfully');
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (values: TransferData) => {
      const { data } = await api.post('/v1/inventory/transfer', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      transferForm.reset();
      showSuccess('Stock transferred successfully');
    },
  });

  const adjustmentMutation = useMutation({
    mutationFn: async (values: AdjustmentData) => {
      const { data } = await api.post('/v1/inventory/adjustment', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      adjustmentForm.reset();
      showSuccess('Stock adjusted successfully');
    },
  });

  function showSuccess(msg: string) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  }

  const stockInForm = useForm<StockInData>({
    resolver: zodResolver(stockInSchema),
    defaultValues: { product_id: '', warehouse_id: '', quantity: 0, rate: 0, batch: '', color: '', size: '', notes: '' },
  });

  const stockOutForm = useForm<StockOutData>({
    resolver: zodResolver(stockOutSchema),
    defaultValues: { product_id: '', warehouse_id: '', quantity: 0, batch: '', notes: '' },
  });

  const transferForm = useForm<TransferData>({
    resolver: zodResolver(transferSchema),
    defaultValues: { product_id: '', from_warehouse_id: '', to_warehouse_id: '', quantity: 0, notes: '' },
  });

  const adjustmentForm = useForm<AdjustmentData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { product_id: '', warehouse_id: '', quantity: 0, adjustment_type: '', reason: '', notes: '' },
  });

  const productOptions = (productsData || []).map((p) => ({
    id: p.id,
    label: `${p.name} (${p.sku})`,
  }));

  const warehouseOptions = (warehousesData || []).map((w) => ({
    id: w.id,
    label: w.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Stock Movements</h2>
        <p className="text-sm text-muted-foreground">Record stock movements and adjustments</p>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', activeTab === tab.key && tab.color)} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'stock_in' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowDownToLine className="h-5 w-5 text-emerald-500" />
              Stock In
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={stockInForm.handleSubmit((v) => stockInMutation.mutate(v))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="text-sm font-medium text-foreground">Product *</label>
                  <Select
                    value={stockInForm.watch('product_id')}
                    onValueChange={(v) => stockInForm.setValue('product_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {stockInForm.formState.errors.product_id && (
                    <p className="mt-1 text-xs text-destructive">{stockInForm.formState.errors.product_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Warehouse *</label>
                  <Select
                    value={stockInForm.watch('warehouse_id')}
                    onValueChange={(v) => stockInForm.setValue('warehouse_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseOptions.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {stockInForm.formState.errors.warehouse_id && (
                    <p className="mt-1 text-xs text-destructive">{stockInForm.formState.errors.warehouse_id.message}</p>
                  )}
                </div>
                <Input
                  label="Batch No."
                  placeholder="Batch number"
                  {...stockInForm.register('batch')}
                />
                <Input
                  label="Color"
                  placeholder="Color"
                  {...stockInForm.register('color')}
                />
                <Input
                  label="Size"
                  placeholder="Size"
                  {...stockInForm.register('size')}
                />
                <Input
                  label="Quantity *"
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
                <div className="sm:col-span-2 lg:col-span-3">
                  <Input
                    label="Notes"
                    placeholder="Optional notes"
                    {...stockInForm.register('notes')}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={stockInMutation.isPending}>
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Receive Stock
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === 'stock_out' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowUpFromLine className="h-5 w-5 text-red-500" />
              Stock Out
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={stockOutForm.handleSubmit((v) => stockOutMutation.mutate(v))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="text-sm font-medium text-foreground">Product *</label>
                  <Select
                    value={stockOutForm.watch('product_id')}
                    onValueChange={(v) => stockOutForm.setValue('product_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {stockOutForm.formState.errors.product_id && (
                    <p className="mt-1 text-xs text-destructive">{stockOutForm.formState.errors.product_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Warehouse *</label>
                  <Select
                    value={stockOutForm.watch('warehouse_id')}
                    onValueChange={(v) => stockOutForm.setValue('warehouse_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseOptions.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {stockOutForm.formState.errors.warehouse_id && (
                    <p className="mt-1 text-xs text-destructive">{stockOutForm.formState.errors.warehouse_id.message}</p>
                  )}
                </div>
                <Input
                  label="Batch No."
                  placeholder="Batch number"
                  {...stockOutForm.register('batch')}
                />
                <Input
                  label="Quantity *"
                  type="number"
                  placeholder="0"
                  {...stockOutForm.register('quantity')}
                  error={stockOutForm.formState.errors.quantity?.message}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Notes"
                    placeholder="Optional notes"
                    {...stockOutForm.register('notes')}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="destructive" loading={stockOutMutation.isPending}>
                  <ArrowUpFromLine className="mr-2 h-4 w-4" />
                  Issue Stock
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === 'transfer' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowLeftRight className="h-5 w-5 text-blue-500" />
              Stock Transfer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={transferForm.handleSubmit((v) => transferMutation.mutate(v))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="text-sm font-medium text-foreground">Product *</label>
                  <Select
                    value={transferForm.watch('product_id')}
                    onValueChange={(v) => transferForm.setValue('product_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {transferForm.formState.errors.product_id && (
                    <p className="mt-1 text-xs text-destructive">{transferForm.formState.errors.product_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">From Warehouse *</label>
                  <Select
                    value={transferForm.watch('from_warehouse_id')}
                    onValueChange={(v) => transferForm.setValue('from_warehouse_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Source warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseOptions.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {transferForm.formState.errors.from_warehouse_id && (
                    <p className="mt-1 text-xs text-destructive">{transferForm.formState.errors.from_warehouse_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">To Warehouse *</label>
                  <Select
                    value={transferForm.watch('to_warehouse_id')}
                    onValueChange={(v) => transferForm.setValue('to_warehouse_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Destination warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseOptions.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {transferForm.formState.errors.to_warehouse_id && (
                    <p className="mt-1 text-xs text-destructive">{transferForm.formState.errors.to_warehouse_id.message}</p>
                  )}
                </div>
                <Input
                  label="Quantity *"
                  type="number"
                  placeholder="0"
                  {...transferForm.register('quantity')}
                  error={transferForm.formState.errors.quantity?.message}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Notes"
                    placeholder="Optional notes"
                    {...transferForm.register('notes')}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={transferMutation.isPending}>
                  <ArrowLeftRight className="mr-2 h-4 w-4" />
                  Transfer Stock
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === 'adjustment' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-amber-500" />
              Stock Adjustment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={adjustmentForm.handleSubmit((v) => adjustmentMutation.mutate(v))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="text-sm font-medium text-foreground">Product *</label>
                  <Select
                    value={adjustmentForm.watch('product_id')}
                    onValueChange={(v) => adjustmentForm.setValue('product_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {adjustmentForm.formState.errors.product_id && (
                    <p className="mt-1 text-xs text-destructive">{adjustmentForm.formState.errors.product_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Warehouse *</label>
                  <Select
                    value={adjustmentForm.watch('warehouse_id')}
                    onValueChange={(v) => adjustmentForm.setValue('warehouse_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseOptions.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {adjustmentForm.formState.errors.warehouse_id && (
                    <p className="mt-1 text-xs text-destructive">{adjustmentForm.formState.errors.warehouse_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Adjustment Type *</label>
                  <Select
                    value={adjustmentForm.watch('adjustment_type')}
                    onValueChange={(v) => adjustmentForm.setValue('adjustment_type', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="damage">Damage</SelectItem>
                      <SelectItem value="shrinkage">Shrinkage</SelectItem>
                      <SelectItem value="correction">Correction</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                      <SelectItem value="found">Found</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {adjustmentForm.formState.errors.adjustment_type && (
                    <p className="mt-1 text-xs text-destructive">{adjustmentForm.formState.errors.adjustment_type.message}</p>
                  )}
                </div>
                <Input
                  label="Quantity *"
                  type="number"
                  placeholder="0"
                  {...adjustmentForm.register('quantity')}
                  error={adjustmentForm.formState.errors.quantity?.message}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Reason *"
                    placeholder="Reason for adjustment"
                    {...adjustmentForm.register('reason')}
                    error={adjustmentForm.formState.errors.reason?.message}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Input
                    label="Notes"
                    placeholder="Optional notes"
                    {...adjustmentForm.register('notes')}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={adjustmentMutation.isPending}>
                  <Settings className="mr-2 h-4 w-4" />
                  Adjust Stock
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
