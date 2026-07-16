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
  Users,
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
import { cn, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import type { Customer, PaginatedResponse } from '@/types';

const customerSchema = z.object({
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
  credit_limit: z.coerce.number().min(0),
  credit_days: z.coerce.number().min(0),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerRow extends Customer {
  code?: string;
  contact_person?: string;
  gst_number?: string;
  credit_limit?: number;
  credit_days?: number;
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<CustomerRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customers', { search, page }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CustomerRow>>('/v1/customers', {
        params: { search, page, per_page: 20 },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: CustomerFormData) => {
      const { data } = await api.post('/v1/customers', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: CustomerFormData & { id: string }) => {
      const { data } = await api.put(`/v1/customers/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeleteDialogOpen(false);
      setDeletingCustomer(null);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
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
      credit_limit: 0,
      credit_days: 0,
    },
  });

  function resetForm() {
    reset();
    setEditingCustomer(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(customer: CustomerRow) {
    setEditingCustomer(customer);
    reset({
      code: customer.code || '',
      name: customer.name,
      contact_person: customer.contact_person || '',
      phone: customer.phone || '',
      email: customer.email || '',
      gst_number: customer.gst_number || customer.gstin || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      credit_limit: customer.credit_limit || 0,
      credit_days: customer.credit_days || customer.payment_terms_days || 0,
    });
    setDialogOpen(true);
  }

  function openDelete(customer: CustomerRow) {
    setDeletingCustomer(customer);
    setDeleteDialogOpen(true);
  }

  function onSubmit(values: CustomerFormData) {
    if (editingCustomer) {
      updateMutation.mutate({ ...values, id: editingCustomer.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<CustomerRow, unknown>[] = [
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
      accessorKey: 'city',
      header: 'City',
      cell: ({ row }) => <span>{row.getValue('city') || '—'}</span>,
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
      accessorKey: 'credit_limit',
      header: 'Credit Limit',
      cell: ({ row }) => (
        <span className="font-medium">
          {formatCurrency((row.getValue('credit_limit') as number) || 0)}
        </span>
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
          <h2 className="text-2xl font-bold text-foreground">Customers</h2>
          <p className="text-sm text-muted-foreground">Manage your customer master data</p>
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
                placeholder="Search customers..."
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
                {data.total} customer{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load customers</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No customers found. Add your first customer to get started."
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
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Code"
                placeholder="CUST-001"
                {...register('code')}
                error={errors.code?.message}
              />
              <Input
                label="Name"
                placeholder="Customer name"
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
                label="Credit Limit"
                type="number"
                placeholder="0.00"
                {...register('credit_limit')}
                error={errors.credit_limit?.message}
              />
              <Input
                label="Credit Days"
                type="number"
                placeholder="30"
                {...register('credit_days')}
                error={errors.credit_days?.message}
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
                {editingCustomer ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{deletingCustomer?.name}</span>?
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
              onClick={() => deletingCustomer && deleteMutation.mutate(deletingCustomer.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
