import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Pencil, Trash2, AlertCircle } from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
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
} from '@/components/ui';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

const productSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  category_name: z.string().optional(),
  fabric_name: z.string().optional(),
  available_sizes_string: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface Product {
  id: number;
  code: string;
  name: string;
  category_name?: string;
  fabric_name?: string;
  available_sizes: string[];
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['products', { search, page }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Product>>('/v1/products', {
        params: { search, page, per_page: 20 },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: ProductFormData) => {
      const sizes = values.available_sizes_string 
        ? values.available_sizes_string.split(',').map(s => s.trim()).filter(Boolean) 
        : [];
      const payload = {
        code: values.code,
        name: values.name,
        category_name: values.category_name || null,
        fabric_name: values.fabric_name || null,
        available_sizes: sizes
      };
      const { data } = await api.post('/v1/products', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: ProductFormData & { id: number }) => {
      const sizes = values.available_sizes_string 
        ? values.available_sizes_string.split(',').map(s => s.trim()).filter(Boolean) 
        : [];
      const payload = {
        code: values.code,
        name: values.name,
        category_name: values.category_name || null,
        fabric_name: values.fabric_name || null,
        available_sizes: sizes
      };
      const { data } = await api.put(`/v1/products/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
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
      code: '',
      name: '',
      category_name: '',
      fabric_name: '',
      available_sizes_string: '',
    },
  });

  function resetForm() {
    reset({ code: '', name: '', available_sizes_string: '', category_name: '', fabric_name: '' });
    setEditingProduct(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditingProduct(product);
    reset({
      code: product.code,
      name: product.name,
      category_name: product.category_name || '',
      fabric_name: product.fabric_name || '',
      available_sizes_string: product.available_sizes ? product.available_sizes.join(', ') : '',
    });
    setDialogOpen(true);
  }

  function openDelete(product: Product) {
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

  const columns: ColumnDef<Product, unknown>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.getValue('code')}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.getValue('name')}</span>,
    },
    {
      accessorKey: 'category_name',
      header: 'Category',
      cell: ({ row }) => <span>{row.getValue('category_name') || '—'}</span>,
    },
    {
      accessorKey: 'fabric_name',
      header: 'Fabric',
      cell: ({ row }) => <span>{row.getValue('fabric_name') || '—'}</span>,
    },
    {
      accessorKey: 'available_sizes',
      header: 'Sizes',
      cell: ({ row }) => {
        const sizes = row.getValue('available_sizes') as string[];
        return <span className="text-xs text-muted-foreground">{sizes?.join(', ') || '—'}</span>;
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
          Add Product
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
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
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load products</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <Input
              label="Product Code"
              placeholder="e.g. PRD-001"
              {...register('code')}
              error={errors.code?.message}
            />
            <Input
              label="Name"
              placeholder="e.g. Graphic T-Shirt"
              {...register('name')}
              error={errors.name?.message}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Input
                placeholder="e.g. T-Shirts"
                {...register('category_name')}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Fabric</label>
              <Input
                placeholder="e.g. Cotton"
                {...register('fabric_name')}
              />
            </div>
            <Input
              label="Available Sizes (Comma separated)"
              placeholder="S, M, L, XL"
              {...register('available_sizes_string')}
            />
            {(createMutation.isError || updateMutation.isError) && (
              <div className="text-sm font-medium text-destructive">
                Failed to save product. Please try again.
              </div>
            )}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isPending}>{editingProduct ? 'Update' : 'Create'}</Button>
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
              Are you sure you want to delete <span className="font-medium text-foreground">{deletingProduct?.name}</span>?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" loading={deleteMutation.isPending} onClick={() => deletingProduct && deleteMutation.mutate(deletingProduct.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
