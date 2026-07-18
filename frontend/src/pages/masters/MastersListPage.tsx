import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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
  Package,
  Tag,
  Palette,
  Ruler,
  Warehouse,
  Cog,
  Layers,
  Shirt,
  PenTool,
  Sun,
  Scale,
  Wrench,
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
import { cn, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

interface MasterConfig {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  apiPath: string;
  columns: { key: string; label: string; type?: string }[];
  formFields: { key: string; label: string; type?: string; placeholder?: string; required?: boolean; options?: string[] }[];
}

const MASTER_CONFIGS: Record<string, MasterConfig> = {
  categories: {
    title: 'Categories',
    icon: Layers,
    apiPath: '/v1/categories',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Category name', required: true },
      { key: 'description', label: 'Description', placeholder: 'Description' },
    ],
  },
  fabrics: {
    title: 'Fabrics',
    icon: Package,
    apiPath: '/v1/fabrics',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'fabric_type', label: 'Fabric Type' },
      { key: 'gsm', label: 'GSM' },
      { key: 'composition', label: 'Composition' },
      { key: 'color', label: 'Color' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Fabric name (e.g., Summer Cotton)', required: true },
      { key: 'fabric_type', label: 'Fabric Type', placeholder: 'e.g., Single Jersey' },
      { key: 'gsm', label: 'GSM', placeholder: 'GSM' },
      { key: 'composition', label: 'Composition', placeholder: 'e.g., 100% Cotton' },
      { key: 'color', label: 'Color', placeholder: 'e.g., Navy Blue' },
    ],
  },
  services: {
    title: 'Services',
    icon: Wrench,
    apiPath: '/v1/services',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'process', label: 'Process' },
      { key: 'rate', label: 'Rate (₹)' },
      { key: 'remarks', label: 'Remarks' },
    ],
    formFields: [
      { key: 'name', label: 'Service Name', placeholder: 'e.g. Embroidery', required: true },
      { key: 'process', label: 'Process', placeholder: 'e.g. Stitching', required: true },
      { key: 'rate', label: 'Rate (₹)', type: 'number', placeholder: '0.00' },
      { key: 'remarks', label: 'Remarks', placeholder: 'Any remarks' },
    ],
  },
};

export default function MastersListPage() {
  const location = useLocation();
  const type = location.pathname.split('/').filter(Boolean).pop() || '';
  const config = type ? MASTER_CONFIGS[type] : null;

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">Unknown Master Type</h2>
          <p className="text-sm text-muted-foreground">The master type "{type}" is not recognized.</p>
        </div>
      </div>
    );
  }

  return <MasterListContent config={config} type={type!} />;
}

function MasterListContent({ config, type }: { config: MasterConfig; type: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<Record<string, unknown> | null>(null);

  const schemaObj: Record<string, z.ZodType> = {};
  config.formFields.forEach((f) => {
    if (f.required) {
      schemaObj[f.key] = z.string().min(1, `${f.label} is required`);
    } else if (f.type === 'number') {
      schemaObj[f.key] = z.coerce.number();
    } else {
      schemaObj[f.key] = z.string();
    }
  });
  schemaObj['is_active'] = z.boolean().optional();
  const formSchema = z.object(schemaObj);
  type FormData = z.infer<typeof formSchema>;

  const { data, isLoading, isError } = useQuery({
    queryKey: [type, { search, page }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Record<string, unknown>>>(config.apiPath, {
        params: { search, page, per_page: 20 },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormData) => {
      const { data } = await api.post(config.apiPath, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [type] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: FormData & { id: string }) => {
      const { data } = await api.put(`${config.apiPath}/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [type] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${config.apiPath}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [type] });
      setDeleteDialogOpen(false);
      setDeletingItem(null);
    },
  });

  const defaultValues: Record<string, unknown> = {
    is_active: true
  };
  config.formFields.forEach((f) => {
    if (f.type === 'number') defaultValues[f.key] = 0;
    else defaultValues[f.key] = '';
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues as FormData,
  });

  function resetForm() {
    reset(defaultValues as FormData);
    setEditingItem(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(item: Record<string, unknown>) {
    setEditingItem(item);
    const values: Record<string, unknown> = {
      is_active: item['is_active'] ?? true
    };
    config.formFields.forEach((f) => {
      values[f.key] = item[f.key] ?? (f.type === 'number' ? 0 : '');
    });
    reset(values as FormData);
    setDialogOpen(true);
  }

  function openDelete(item: Record<string, unknown>) {
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  }

  function onSubmit(values: FormData) {
    if (editingItem) {
      updateMutation.mutate({ ...values, id: editingItem.id as string });
    } else {
      createMutation.mutate(values);
    }
  }

  const Icon = config.icon;

  const statusColor = (status: string) => {
    switch (status) {
      case 'running': return 'success' as const;
      case 'idle': return 'warning' as const;
      case 'maintenance': return 'secondary' as const;
      case 'broken': return 'destructive' as const;
      default: return 'secondary' as const;
    }
  };

  const columns: ColumnDef<Record<string, unknown>, unknown>[] = useMemo(() => {
    const cols: ColumnDef<Record<string, unknown>, unknown>[] = config.columns.map((col) => ({
      accessorKey: col.key,
      header: col.label,
      cell: ({ row }: { row: { getValue: (k: string) => unknown; original: Record<string, unknown> } }) => {
        const val = row.getValue(col.key);
        if (col.type === 'date' && val) {
          return <span>{formatDate(val as string)}</span>;
        }
        if (col.type === 'currency' && val) {
          return <span className="font-medium">₹{Number(val).toLocaleString('en-IN')}</span>;
        }
        if (col.type === 'color_swatch' && val) {
          return (
            <div className="flex items-center gap-2">
              <div
                className="h-5 w-5 rounded border border-border"
                style={{ backgroundColor: val as string }}
              />
              <span className="font-mono text-xs">{val as string}</span>
            </div>
          );
        }
        if (col.type === 'status_badge' && val) {
          return <Badge variant={statusColor(val as string)}>{(val as string).toUpperCase()}</Badge>;
        }
        return <span>{(val as string) || '—'}</span>;
      },
    }));

    cols.push({
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    });

    cols.push({
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
    });

    return cols;
  }, [config]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{config.title}</h2>
            <p className="text-sm text-muted-foreground">Manage {config.title.toLowerCase()}</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add New
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={`Search ${config.title.toLowerCase()}...`}
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} {config.title.toLowerCase()} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load {config.title.toLowerCase()}</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
              loading={isLoading}
              emptyMessage={`No ${config.title.toLowerCase()} found. Add your first entry to get started.`}
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
            <DialogTitle>
              {editingItem ? 'Edit' : 'Add New'} {config.title.slice(0, -1) || config.title}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-4">
              {config.formFields.map((field) => {
                if (field.options) {
                  const currentVal = watch(field.key) as string;
                  return (
                    <div key={field.key}>
                      <label className="text-sm font-medium text-foreground">{field.label}</label>
                      <Select
                        value={currentVal || ''}
                        onValueChange={(v) => setValue(field.key, v as never)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt.charAt(0).toUpperCase() + opt.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors[field.key] && (
                        <p className="mt-1 text-xs text-destructive">{errors[field.key]?.message as string}</p>
                      )}
                    </div>
                  );
                }
                return (
                  <Input
                    key={field.key}
                    label={field.label}
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    placeholder={field.placeholder}
                    {...register(field.key as never)}
                    error={errors[field.key]?.message as string}
                  />
                );
              })}
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
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {config.title.slice(0, -1) || config.title}</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{deletingItem?.name as string}</span>?
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
              onClick={() => deletingItem && deleteMutation.mutate(deletingItem.id as string)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
