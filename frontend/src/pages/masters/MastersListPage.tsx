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
  brands: {
    title: 'Brands',
    icon: Tag,
    apiPath: '/v1/brands',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Brand name', required: true },
      { key: 'description', label: 'Description', placeholder: 'Description' },
    ],
  },
  styles: {
    title: 'Styles',
    icon: Shirt,
    apiPath: '/v1/styles',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'category_name', label: 'Category' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Style name', required: true },
      { key: 'description', label: 'Description', placeholder: 'Description' },
    ],
  },
  designs: {
    title: 'Designs',
    icon: PenTool,
    apiPath: '/v1/designs',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'style_name', label: 'Style' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Design name', required: true },
      { key: 'description', label: 'Description', placeholder: 'Description' },
    ],
  },
  seasons: {
    title: 'Seasons',
    icon: Sun,
    apiPath: '/v1/seasons',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'start_date', label: 'Start Date', type: 'date' },
      { key: 'end_date', label: 'End Date', type: 'date' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Season name', required: true },
      { key: 'start_date', label: 'Start Date', type: 'date' },
      { key: 'end_date', label: 'End Date', type: 'date' },
    ],
  },
  fabrics: {
    title: 'Fabrics',
    icon: Package,
    apiPath: '/v1/fabrics',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'composition', label: 'Composition' },
      { key: 'gsm', label: 'GSM' },
      { key: 'width', label: 'Width' },
      { key: 'cost_per_unit', label: 'Cost/Unit', type: 'currency' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Fabric name', required: true },
      { key: 'composition', label: 'Composition', placeholder: 'e.g. 100% Cotton' },
      { key: 'gsm', label: 'GSM', type: 'number', placeholder: 'GSM' },
      { key: 'width', label: 'Width', type: 'number', placeholder: 'Width in inches' },
      { key: 'cost_per_unit', label: 'Cost Per Unit', type: 'number', placeholder: '0.00' },
    ],
  },
  colors: {
    title: 'Colors',
    icon: Palette,
    apiPath: '/v1/colors',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'hex_code', label: 'Hex Code', type: 'color_swatch' },
      { key: 'pantone_ref', label: 'Pantone Ref' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Color name', required: true },
      { key: 'hex_code', label: 'Hex Code', placeholder: '#FF0000' },
      { key: 'pantone_ref', label: 'Pantone Reference', placeholder: 'Pantone code' },
    ],
  },
  sizes: {
    title: 'Sizes',
    icon: Ruler,
    apiPath: '/v1/sizes',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'size_group', label: 'Size Group' },
      { key: 'sort_order', label: 'Sort Order' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Size name (e.g. S, M, L)', required: true },
      { key: 'size_group', label: 'Size Group', placeholder: 'e.g. Standard, Kids' },
      { key: 'sort_order', label: 'Sort Order', type: 'number', placeholder: '0' },
    ],
  },
  units: {
    title: 'Units',
    icon: Scale,
    apiPath: '/v1/units',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'abbreviation', label: 'Abbreviation' },
      { key: 'unit_type', label: 'Type' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Unit name', required: true },
      { key: 'abbreviation', label: 'Abbreviation', placeholder: 'e.g. Pcs, Kg, Mtr', required: true },
      {
        key: 'unit_type',
        label: 'Type',
        options: ['count', 'weight', 'length', 'area', 'volume'],
      },
    ],
  },
  warehouses: {
    title: 'Warehouses',
    icon: Warehouse,
    apiPath: '/v1/warehouses',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'address', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Warehouse name', required: true },
      { key: 'address', label: 'Address', placeholder: 'Full address' },
      { key: 'city', label: 'City', placeholder: 'City' },
      { key: 'state', label: 'State', placeholder: 'State' },
    ],
  },
  machines: {
    title: 'Machines',
    icon: Cog,
    apiPath: '/v1/machines',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'machine_type', label: 'Type' },
      { key: 'model', label: 'Model' },
      { key: 'serial_number', label: 'Serial No.' },
      { key: 'capacity', label: 'Capacity' },
      { key: 'status', label: 'Status', type: 'status_badge' },
    ],
    formFields: [
      { key: 'name', label: 'Name', placeholder: 'Machine name', required: true },
      { key: 'machine_type', label: 'Type', placeholder: 'e.g. Sewing, Cutting' },
      { key: 'model', label: 'Model', placeholder: 'Model number' },
      { key: 'serial_number', label: 'Serial Number', placeholder: 'Serial number' },
      { key: 'capacity', label: 'Capacity', placeholder: 'e.g. 500 pcs/day' },
      {
        key: 'status',
        label: 'Status',
        options: ['idle', 'running', 'maintenance', 'broken'],
      },
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

  const defaultValues: Record<string, unknown> = {};
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
    const values: Record<string, unknown> = {};
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
              data={data?.data || []}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit' : 'Add New'} {config.title.slice(0, -1) || config.title}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
