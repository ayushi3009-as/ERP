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
import api from '@/lib/api';
import type { Vendor, PaginatedResponse } from '@/types';

const vendorSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  contact_person: z.string(),
  phone: z.string(),
  email: z.string().email('Invalid email').or(z.literal('')),
  gst_number: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  payment_terms: z.coerce.number().min(0),
  category: z.string(),
});

type VendorFormData = z.infer<typeof vendorSchema>;

interface VendorRow extends Vendor {
  code?: string;
  contact_person?: string;
  gst_number?: string;
  category?: string;
  payment_terms?: number;
}

const VENDOR_CATEGORIES = ['Raw Material', 'Accessories', 'Packaging', 'Services', 'Others'];

export default function VendorsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingVendor, setDeletingVendor] = useState<VendorRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vendors', { search, page, categoryFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<VendorRow>>('/v1/vendors', {
        params: {
          search,
          page,
          per_page: 20,
          ...(categoryFilter !== 'all' && { category: categoryFilter }),
        },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: VendorFormData) => {
      const { data } = await api.post('/v1/vendors', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: VendorFormData & { id: string }) => {
      const { data } = await api.put(`/v1/vendors/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/vendors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setDeleteDialogOpen(false);
      setDeletingVendor(null);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      code: '',
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      gst_number: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      payment_terms: 0,
      category: '',
    },
  });

  function resetForm() {
    reset();
    setEditingVendor(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(vendor: VendorRow) {
    setEditingVendor(vendor);
    reset({
      code: vendor.code || '',
      name: vendor.name,
      contact_person: vendor.contact_person || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      gst_number: vendor.gst_number || vendor.gstin || '',
      address: vendor.address || '',
      city: vendor.city || '',
      state: vendor.state || '',
      pincode: vendor.pincode || '',
      payment_terms: vendor.payment_terms || vendor.payment_terms_days || 0,
      category: vendor.category || '',
    });
    setDialogOpen(true);
  }

  function openDelete(vendor: VendorRow) {
    setDeletingVendor(vendor);
    setDeleteDialogOpen(true);
  }

  function onSubmit(values: VendorFormData) {
    if (editingVendor) {
      updateMutation.mutate({ ...values, id: editingVendor.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<VendorRow, unknown>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('code') || '—'}</span>
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
      accessorKey: 'contact_person',
      header: 'Contact Person',
      cell: ({ row }) => <span>{row.getValue('contact_person') || '—'}</span>,
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('phone') || '—'}</span>,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <span className="text-xs">{row.getValue('email') || '—'}</span>,
    },
    {
      accessorKey: 'gst_number',
      header: 'GST Number',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.getValue('gst_number') || row.original.gstin || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => {
        const cat = row.getValue('category') as string;
        return cat ? <Badge variant="outline">{cat}</Badge> : <span>—</span>;
      },
    },
    {
      accessorKey: 'payment_terms',
      header: 'Payment Terms',
      cell: ({ row }) => {
        const days = (row.getValue('payment_terms') as number) || row.original.payment_terms_days;
        return <span>{days ? `${days} days` : '—'}</span>;
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
          <h2 className="text-2xl font-bold text-foreground">Vendors</h2>
          <p className="text-sm text-muted-foreground">Manage your vendor master data</p>
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
                  placeholder="Search vendors..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {VENDOR_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} vendor{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load vendors</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
              loading={isLoading}
              emptyMessage="No vendors found. Add your first vendor to get started."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Code"
                placeholder="VND-001"
                {...register('code')}
                error={errors.code?.message}
              />
              <Input
                label="Name"
                placeholder="Vendor name"
                {...register('name')}
                error={errors.name?.message}
              />
              <Input
                label="Contact Person"
                placeholder="Contact person name"
                {...register('contact_person')}
                error={errors.contact_person?.message}
              />
              <Input
                label="Phone"
                placeholder="+91 XXXXX XXXXX"
                {...register('phone')}
                error={errors.phone?.message}
              />
              <Input
                label="Email"
                placeholder="email@example.com"
                type="email"
                {...register('email')}
                error={errors.email?.message}
              />
              <Input
                label="GST Number"
                placeholder="22AAAAA0000A1Z5"
                {...register('gst_number')}
                error={errors.gst_number?.message}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Address"
                  placeholder="Full address"
                  {...register('address')}
                  error={errors.address?.message}
                />
              </div>
              <Input
                label="City"
                placeholder="City"
                {...register('city')}
                error={errors.city?.message}
              />
              <Input
                label="State"
                placeholder="State"
                {...register('state')}
                error={errors.state?.message}
              />
              <Input
                label="Pincode"
                placeholder="Pincode"
                {...register('pincode')}
                error={errors.pincode?.message}
              />
              <Input
                label="Payment Terms (Days)"
                type="number"
                placeholder="30"
                {...register('payment_terms')}
                error={errors.payment_terms?.message}
              />
              <div>
                <label className="text-sm font-medium text-foreground">Category</label>
                <Select
                  value={editingVendor?.category || ''}
                  onValueChange={(v) => reset({ category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
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
                {editingVendor ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{deletingVendor?.name}</span>?
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
              onClick={() => deletingVendor && deleteMutation.mutate(deletingVendor.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
