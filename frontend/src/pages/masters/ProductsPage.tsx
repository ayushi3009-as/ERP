import { useState } from 'react';
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
  Filter,
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
import { cn, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import type { Product, PaginatedResponse } from '@/types';

const productSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
  category: z.string(),
  brand: z.string(),
  product_type: z.string(),
  hsn_code: z.string(),
  gst_rate: z.coerce.number().min(0).max(100),
  cost_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
  mrp: z.coerce.number().min(0),
  unit: z.string(),
  min_stock_level: z.coerce.number().min(0),
  max_stock_level: z.coerce.number().min(0),
  reorder_level: z.coerce.number().min(0),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductRow extends Product {
  category_name?: string;
  brand_name?: string;
  product_type?: string;
  stock?: number;
}

const PRODUCT_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'finished', label: 'Finished' },
  { value: 'semi_finished', label: 'Semi Finished' },
  { value: 'accessories', label: 'Accessories' },
];

const GST_RATES = [0, 5, 12, 18, 28];

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<ProductRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['products', { search, page, typeFilter, categoryFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ProductRow>>('/v1/products', {
        params: {
          search,
          page,
          per_page: 20,
          ...(typeFilter !== 'all' && { product_type: typeFilter }),
          ...(categoryFilter !== 'all' && { category: categoryFilter }),
        },
      });
      return data;
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; name: string }>>('/v1/categories', {
        params: { per_page: 200 },
      });
      return data.data;
    },
  });

  const { data: brandsData } = useQuery({
    queryKey: ['brands', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; name: string }>>('/v1/brands', {
        params: { per_page: 200 },
      });
      return data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: ProductFormData) => {
      const { data } = await api.post('/v1/products', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: ProductFormData & { id: string }) => {
      const { data } = await api.put(`/v1/products/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteDialogOpen(false);
      setDeletingProduct(null);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: '',
      name: '',
      description: '',
      category: '',
      brand: '',
      product_type: 'finished',
      hsn_code: '',
      gst_rate: 18,
      cost_price: 0,
      selling_price: 0,
      mrp: 0,
      unit: '',
      min_stock_level: 0,
      max_stock_level: 0,
      reorder_level: 0,
    },
  });

  function resetForm() {
    reset();
    setEditingProduct(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(product: ProductRow) {
    setEditingProduct(product);
    reset({
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      category: product.category_name || '',
      brand: product.brand_name || '',
      product_type: product.product_type || 'finished',
      hsn_code: product.hsn_code || '',
      gst_rate: product.gst_rate || 18,
      cost_price: product.cost_price || 0,
      selling_price: product.selling_price || 0,
      mrp: product.mrp || 0,
      unit: '',
      min_stock_level: product.min_stock_level || 0,
      max_stock_level: product.max_stock_level || 0,
      reorder_level: product.reorder_level || 0,
    });
    setDialogOpen(true);
  }

  function openDelete(product: ProductRow) {
    setDeletingProduct(product);
    setDeleteDialogOpen(true);
  }

  function onSubmit(values: ProductFormData) {
    if (editingProduct) {
      updateMutation.mutate({ ...values, id: editingProduct.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const typeBadgeVariant = (type: string) => {
    switch (type) {
      case 'raw_material': return 'secondary' as const;
      case 'finished': return 'default' as const;
      case 'semi_finished': return 'outline' as const;
      case 'accessories': return 'warning' as const;
      default: return 'secondary' as const;
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'raw_material': return 'Raw Material';
      case 'finished': return 'Finished';
      case 'semi_finished': return 'Semi Finished';
      case 'accessories': return 'Accessories';
      default: return type || '—';
    }
  };

  const columns: ColumnDef<ProductRow, unknown>[] = [
    {
      accessorKey: 'sku',
      header: 'SKU',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('sku')}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{row.getValue('name')}</span>
          {!row.original.is_active && (
            <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'category_name',
      header: 'Category',
      cell: ({ row }) => <span>{row.getValue('category_name') || '—'}</span>,
    },
    {
      accessorKey: 'brand_name',
      header: 'Brand',
      cell: ({ row }) => <span>{row.getValue('brand_name') || '—'}</span>,
    },
    {
      accessorKey: 'product_type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('product_type') as string;
        return <Badge variant={typeBadgeVariant(type)}>{typeLabel(type)}</Badge>;
      },
    },
    {
      accessorKey: 'hsn_code',
      header: 'HSN',
      cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('hsn_code') || '—'}</span>,
    },
    {
      accessorKey: 'gst_rate',
      header: 'GST %',
      cell: ({ row }) => <span>{row.getValue('gst_rate') || 0}%</span>,
    },
    {
      accessorKey: 'cost_price',
      header: 'Cost Price',
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency((row.getValue('cost_price') as number) || 0)}</span>
      ),
    },
    {
      accessorKey: 'selling_price',
      header: 'Selling Price',
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency((row.getValue('selling_price') as number) || 0)}</span>
      ),
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      cell: ({ row }) => {
        const stock = (row.getValue('stock') as number) || 0;
        const minStock = row.original.min_stock_level || 0;
        const isLow = minStock > 0 && stock <= minStock;
        return (
          <span className={cn('font-medium', isLow && 'text-destructive')}>
            {stock}
            {isLow && <Badge variant="destructive" className="ml-1.5 text-[10px]">Low</Badge>}
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
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row.original);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              openDelete(row.original);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Products</h2>
          <p className="text-sm text-muted-foreground">Manage your product catalog</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add New
        </Button>
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
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(categoriesData || []).map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} product{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {PRODUCT_TYPES.map((t) => (
              <Button
                key={t.value}
                variant={typeFilter === t.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setTypeFilter(t.value); setPage(1); }}
                className="shrink-0"
              >
                {t.label}
              </Button>
            ))}
          </div>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load products</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No products found. Add your first product to get started."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="SKU"
                placeholder="PRD-001"
                {...register('sku')}
                error={errors.sku?.message}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Name"
                  placeholder="Product name"
                  {...register('name')}
                  error={errors.name?.message}
                />
              </div>
              <div className="sm:col-span-3">
                <Input
                  label="Description"
                  placeholder="Product description"
                  {...register('description')}
                  error={errors.description?.message}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Product Type</label>
                <Select
                  defaultValue={editingProduct?.product_type || 'finished'}
                  onValueChange={(v) => reset({ product_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.filter((t) => t.value !== 'all').map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Category</label>
                <Select
                  defaultValue={editingProduct?.category_name || ''}
                  onValueChange={(v) => reset({ category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categoriesData || []).map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Brand</label>
                <Select
                  defaultValue={editingProduct?.brand_name || ''}
                  onValueChange={(v) => reset({ brand: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {(brandsData || []).map((b) => (
                      <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                label="HSN Code"
                placeholder="HSN code"
                {...register('hsn_code')}
                error={errors.hsn_code?.message}
              />
              <div>
                <label className="text-sm font-medium text-foreground">GST Rate (%)</label>
                <Select
                  defaultValue={String(editingProduct?.gst_rate || 18)}
                  onValueChange={(v) => reset({ gst_rate: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select GST rate" />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATES.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                label="Unit"
                placeholder="Pcs, Kg, Mtr..."
                {...register('unit')}
                error={errors.unit?.message}
              />
              <Input
                label="Cost Price"
                type="number"
                placeholder="0.00"
                {...register('cost_price')}
                error={errors.cost_price?.message}
              />
              <Input
                label="Selling Price"
                type="number"
                placeholder="0.00"
                {...register('selling_price')}
                error={errors.selling_price?.message}
              />
              <Input
                label="MRP"
                type="number"
                placeholder="0.00"
                {...register('mrp')}
                error={errors.mrp?.message}
              />
              <Input
                label="Min Stock Level"
                type="number"
                placeholder="0"
                {...register('min_stock_level')}
                error={errors.min_stock_level?.message}
              />
              <Input
                label="Max Stock Level"
                type="number"
                placeholder="0"
                {...register('max_stock_level')}
                error={errors.max_stock_level?.message}
              />
              <Input
                label="Reorder Level"
                type="number"
                placeholder="0"
                {...register('reorder_level')}
                error={errors.reorder_level?.message}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                {editingProduct ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{deletingProduct?.name}</span>
              <span className="text-xs"> ({deletingProduct?.sku})</span>?
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deletingProduct && deleteMutation.mutate(deletingProduct.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
