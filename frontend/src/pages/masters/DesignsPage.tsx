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
  SelectValue,
} from '@/components/ui';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

import { Badge } from '@/components/ui';

const designSchema = z.object({
  design_number: z.string().min(1, 'Design Number is required'),
  name: z.string().min(1, 'Name is required'),
  product_name: z.string().min(1, 'Product is required'),
  category_name: z.string().min(1, 'Category is required'),
  fabric_name: z.string().min(1, 'Fabric is required'),
  version: z.string().optional(),
  is_active: z.boolean().optional(),
});

type DesignFormData = z.infer<typeof designSchema>;

interface Design {
  id: number;
  design_number: string;
  name: string;
  product_id: number;
  product_name?: string;
  category_id: number;
  category_name?: string;
  fabric_id: number;
  fabric_name?: string;
  version: string;
  is_active: boolean;
}

export default function DesignsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDesign, setEditingDesign] = useState<Design | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDesign, setDeletingDesign] = useState<Design | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['designs', { search, page }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Design>>('/v1/designs', {
        params: { search, page, per_page: 20 },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: DesignFormData) => {
      const payload = {
        design_number: values.design_number,
        name: values.name,
        product_name: values.product_name,
        category_name: values.category_name,
        fabric_name: values.fabric_name,
        version: values.version || 'v1.0',
        is_active: values.is_active ?? true
      };
      const { data } = await api.post('/v1/designs', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designs'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: DesignFormData & { id: number }) => {
      const payload = {
        design_number: values.design_number,
        name: values.name,
        product_name: values.product_name,
        category_name: values.category_name,
        fabric_name: values.fabric_name,
        version: values.version,
        is_active: values.is_active ?? true
      };
      const { data } = await api.put(`/v1/designs/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designs'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/v1/designs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designs'] });
      setDialogOpen(false);
      setDeletingDesign(null);
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || "Failed to delete design.");
      setDialogOpen(false);
      setDeletingDesign(null);
    }
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DesignFormData>({
    resolver: zodResolver(designSchema),
    defaultValues: {
      design_number: '',
      name: '',
      product_name: '',
      category_name: '',
      fabric_name: '',
      version: 'v1.0',
      is_active: true,
    },
  });

  function resetForm() {
    reset({ design_number: '', name: '', product_name: '', category_name: '', fabric_name: '', version: 'v1.0', is_active: true });
    setEditingDesign(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(design: Design) {
    setEditingDesign(design);
    reset({
      design_number: design.design_number,
      name: design.name,
      product_name: design.product_name || '',
      category_name: design.category_name || '',
      fabric_name: design.fabric_name || '',
      version: design.version,
      is_active: design.is_active,
    });
    setDialogOpen(true);
  }

  function openDelete(design: Design) {
    setDeletingDesign(design);
    setDeleteDialogOpen(true);
  }

  function onSubmit(values: DesignFormData) {
    if (editingDesign) {
      updateMutation.mutate({ ...values, id: editingDesign.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<Design, unknown>[] = [
    {
      accessorKey: 'design_number',
      header: 'Design No.',
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.getValue('design_number')}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.getValue('name')}</span>,
    },
    {
      accessorKey: 'product_name',
      header: 'Product',
      cell: ({ row }) => <span>{row.original.product_name || '—'}</span>,
    },
    {
      accessorKey: 'category_name',
      header: 'Category',
      cell: ({ row }) => <span>{row.original.category_name || '—'}</span>,
    },
    {
      accessorKey: 'fabric_name',
      header: 'Fabric',
      cell: ({ row }) => <span>{row.original.fabric_name || '—'}</span>,
    },
    {
      accessorKey: 'version',
      header: 'Version',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.getValue('version') || '—'}</span>,
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
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
          <h2 className="text-2xl font-bold text-foreground">Designs</h2>
          <p className="text-sm text-muted-foreground">Manage your product designs</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Design
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search designs..."
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
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load designs</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
              loading={isLoading}
              emptyMessage="No designs found. Add your first design to get started."
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
            <DialogTitle>{editingDesign ? 'Edit Design' : 'Add New Design'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <Input
              label="Design Number"
              placeholder="e.g. D-1001"
              {...register('design_number')}
              error={errors.design_number?.message}
            />
            <Input
              label="Name"
              placeholder="e.g. Vintage Logo Print"
              {...register('name')}
              error={errors.name?.message}
            />
            <Input
              label="Product"
              placeholder="e.g. Graphic T-Shirt"
              {...register('product_name')}
              error={errors.product_name?.message}
            />
            <Input
              label="Category"
              placeholder="e.g. T-Shirts"
              {...register('category_name')}
              error={errors.category_name?.message}
            />
            <Input
              label="Fabric"
              placeholder="e.g. Cotton Single Jersey"
              {...register('fabric_name')}
              error={errors.fabric_name?.message}
            />
            <Input
              label="Version"
              placeholder="v1.0"
              {...register('version')}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Status</label>
              <Select
                value={watch('is_active') === false ? 'inactive' : 'active'}
                onValueChange={(v) => setValue('is_active', v === 'active' ? true : false)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(createMutation.isError || updateMutation.isError) && (
              <div className="text-sm font-medium text-destructive">
                {(createMutation.error as any)?.response?.data?.detail || (updateMutation.error as any)?.response?.data?.detail || "Failed to save design. Please try again."}
              </div>
            )}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isPending}>{editingDesign ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Design</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">{deletingDesign?.name}</span>?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" loading={deleteMutation.isPending} onClick={() => deletingDesign && deleteMutation.mutate(deletingDesign.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
