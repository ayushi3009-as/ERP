import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  Pencil,
  AlertCircle,
  UserCog,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserX,
  UserCheck,
  Trash2,
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
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { User, PaginatedResponse } from '@/types';

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.string().min(1, 'Role is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const editUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.string().min(1, 'Role is required'),
  password: z.string(),
});

type UserFormData = z.infer<typeof userSchema>;

const ROLES = [
  'company_admin',
  'factory_manager',
  'production_manager',
  'purchase_manager',
  'sales_manager',
  'store_manager',
  'hr',
  'accountant',
  'quality',
  'operator',
  'worker'
] as const;

const PERMISSIONS: Record<string, string[]> = {
  company_admin: ['all'],
  factory_manager: ['sales', 'purchase', 'inventory', 'production', 'reports', 'masters'],
  production_manager: ['production_orders', 'bundles', 'bom', 'quality_checks', 'reports'],
  purchase_manager: ['purchase_orders', 'grn', 'purchase_invoices', 'vendors'],
  sales_manager: ['sales_orders', 'quotations', 'invoices', 'delivery_challans', 'customers'],
  store_manager: ['inventory', 'stock_movements', 'warehouses'],
  hr: ['employees', 'attendance', 'payroll'],
  accountant: ['accounts', 'payments', 'receipts', 'reports', 'gst'],
  quality: ['quality_checks', 'reports'],
  operator: ['production_scanning'],
  worker: ['basic_view']
};

const roleVariant = (role: string) => {
  switch (role) {
    case 'super_admin':
    case 'company_admin': return 'destructive' as const;
    case 'factory_manager': return 'default' as const;
    case 'accountant': return 'warning' as const;
    default: return 'outline' as const;
  }
};

export default function UsersSettingsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [viewingRole, setViewingRole] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', { search, page, roleFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<User>>('/v1/users/', {
        params: {
          search,
          page,
          per_page: 20,
          ...(roleFilter !== 'all' && { role: roleFilter }),
        },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: UserFormData) => {
      const payload = {
        email: values.email,
        username: values.email.split('@')[0] + Math.floor(Math.random() * 1000), // Ensure uniqueness
        full_name: values.name,
        role: values.role.toLowerCase(),
        password: values.password
      };
      const { data } = await api.post('/v1/users/', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: UserFormData & { id: string }) => {
      const payload = {
        full_name: values.name,
        role: values.role.toLowerCase()
      };
      const { data } = await api.put(`/v1/users/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.put(`/v1/users/${id}`, { is_active: false });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.put(`/v1/users/${id}`, { is_active: true });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/v1/users/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(editingUser ? editUserSchema : userSchema),
    defaultValues: {
      name: '',
      email: '',
      role: '',
      password: '',
    },
  });

  function resetForm() {
    reset({ name: '', email: '', role: '', password: '' });
    setEditingUser(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    reset({
      // @ts-ignore
      name: user.full_name || user.name || '',
      email: user.email,
      role: user.role,
      password: '',
    });
    setDialogOpen(true);
  }

  function openPermissions(role: string) {
    setViewingRole(role);
    setPermissionsDialogOpen(true);
  }

  function onSubmit(values: UserFormData) {
    if (editingUser) {
      updateMutation.mutate({ ...values, id: editingUser.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<User, unknown>[] = [
    {
      accessorKey: 'full_name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <span className="text-xs font-medium text-primary">{(row.getValue('full_name') as string)?.charAt(0).toUpperCase() || 'U'}</span>
          </div>
          <span className="font-medium">{row.getValue('full_name') || 'Unnamed User'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <span className="text-xs">{row.getValue('email')}</span>,
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const role = row.getValue('role') as string;
        return (
          <button
            className="flex items-center gap-1 hover:underline"
            onClick={(e) => { e.stopPropagation(); openPermissions(role); }}
          >
            <Badge variant={roleVariant(role)} className="capitalize">{role}</Badge>
          </button>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Deactivated'}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.getValue('created_at') as string).toLocaleDateString()}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {row.original.is_active ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-orange-500 hover:text-orange-600"
              onClick={(e) => { e.stopPropagation(); deactivateMutation.mutate(row.original.id); }}
              disabled={deactivateMutation.isPending}
              title="Deactivate"
            >
              <UserX className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-emerald-500 hover:text-emerald-600"
              onClick={(e) => { e.stopPropagation(); activateMutation.mutate(row.original.id); }}
              disabled={activateMutation.isPending}
              title="Activate"
            >
              <UserCheck className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this user?')) {
                deleteMutation.mutate(row.original.id);
              }
            }}
            disabled={deleteMutation.isPending}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const isPending = createMutation.isPending || updateMutation.isPending;
  const rolePermissions = viewingRole ? (PERMISSIONS[viewingRole] || []) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">User Management</h2>
          <p className="text-sm text-muted-foreground">Manage users, roles, and permissions</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search users..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {data && <p className="text-sm text-muted-foreground">{data.total} user{data.total !== 1 ? 's' : ''} total</p>}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load users</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable columns={columns} data={data?.items || []} loading={isLoading} emptyMessage="No users found. Add your first user to get started." pageSize={20} />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Add User'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Name" placeholder="Full name" {...register('name')} error={errors.name?.message} />
            <Input label="Email" type="email" placeholder="email@example.com" {...register('email')} error={errors.email?.message} />
            <div>
              <label className="text-sm font-medium text-foreground">Role *</label>
              <Select value={watch('role') || ''} onValueChange={(v) => setValue('role', v)}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.role && <p className="mt-1 text-xs text-destructive">{errors.role.message}</p>}
            </div>
            <Input label={editingUser ? 'New Password (leave blank to keep)' : 'Password'} type="password" placeholder="Min 6 characters" {...register('password')} error={errors.password?.message} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" loading={isPending}>{editingUser ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Permissions: <span className="capitalize">{viewingRole}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {rolePermissions.includes('all') ? (
              <div className="flex items-center gap-2 rounded-md bg-primary/10 p-3">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Full Access - All modules</span>
              </div>
            ) : (
              <div className="grid gap-2">
                {rolePermissions.map((perm) => (
                  <div key={perm} className="flex items-center gap-2 rounded-md border border-border p-3">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm capitalize">{perm.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            )}
            {rolePermissions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No specific permissions defined for this role.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
