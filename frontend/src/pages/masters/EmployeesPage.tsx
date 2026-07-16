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
  UserCircle,
  HardHat,
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
import type { Employee, PaginatedResponse } from '@/types';

const employeeSchema = z.object({
  employee_code: z.string().min(1, 'Employee code is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').or(z.literal('')),
  phone: z.string(),
  designation: z.string(),
  department: z.string(),
  date_of_joining: z.string(),
  basic_salary: z.coerce.number().min(0),
  employee_type: z.string(),
  bank_name: z.string(),
  bank_account: z.string(),
  ifsc_code: z.string(),
  pan: z.string(),
  aadhaar: z.string(),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

const DEPARTMENTS = [
  'Production',
  'Quality',
  'Warehouse',
  'Sales',
  'Purchase',
  'Accounts',
  'HR',
  'Admin',
  'Design',
  'Maintenance',
];

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [employeeType, setEmployeeType] = useState<'all' | 'staff' | 'worker'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employees', { search, page, departmentFilter, employeeType }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Employee>>('/v1/employees', {
        params: {
          search,
          page,
          per_page: 20,
          ...(departmentFilter !== 'all' && { department: departmentFilter }),
          ...(employeeType !== 'all' && { employee_type: employeeType }),
        },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: EmployeeFormData) => {
      const { data } = await api.post('/v1/employees', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: EmployeeFormData & { id: string }) => {
      const { data } = await api.put(`/v1/employees/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/employees/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDeleteDialogOpen(false);
      setDeletingEmployee(null);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employee_code: '',
      name: '',
      email: '',
      phone: '',
      designation: '',
      department: '',
      date_of_joining: '',
      basic_salary: 0,
      employee_type: 'staff',
      bank_name: '',
      bank_account: '',
      ifsc_code: '',
      pan: '',
      aadhaar: '',
    },
  });

  function resetForm() {
    reset();
    setEditingEmployee(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditingEmployee(emp);
    reset({
      employee_code: emp.employee_code,
      name: emp.name,
      email: emp.email || '',
      phone: emp.phone || '',
      designation: emp.designation || '',
      department: emp.department || '',
      date_of_joining: emp.date_of_joining || '',
      basic_salary: emp.basic_salary || 0,
      employee_type: 'staff',
      bank_name: emp.bank_name || '',
      bank_account: emp.bank_account || '',
      ifsc_code: emp.ifsc_code || '',
      pan: emp.pan || '',
      aadhaar: emp.aadhaar || '',
    });
    setDialogOpen(true);
  }

  function openDelete(emp: Employee) {
    setDeletingEmployee(emp);
    setDeleteDialogOpen(true);
  }

  function onSubmit(values: EmployeeFormData) {
    if (editingEmployee) {
      updateMutation.mutate({ ...values, id: editingEmployee.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<Employee, unknown>[] = [
    {
      accessorKey: 'employee_code',
      header: 'Code',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('employee_code')}</span>
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
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => {
        const dept = row.getValue('department') as string;
        return dept ? <Badge variant="outline">{dept}</Badge> : <span>—</span>;
      },
    },
    {
      accessorKey: 'designation',
      header: 'Designation',
      cell: ({ row }) => <span>{row.getValue('designation') || '—'}</span>,
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
      accessorKey: 'date_of_joining',
      header: 'Date of Joining',
      cell: ({ row }) => {
        const date = row.getValue('date_of_joining') as string;
        return <span>{date ? formatDate(date) : '—'}</span>;
      },
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
          <h2 className="text-2xl font-bold text-foreground">Employees</h2>
          <p className="text-sm text-muted-foreground">Manage your employee master data</p>
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
                  placeholder="Search employees..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} employee{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <Button
              variant={employeeType === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setEmployeeType('all'); setPage(1); }}
            >
              All
            </Button>
            <Button
              variant={employeeType === 'staff' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setEmployeeType('staff'); setPage(1); }}
            >
              <UserCircle className="mr-1.5 h-3.5 w-3.5" />
              Staff
            </Button>
            <Button
              variant={employeeType === 'worker' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setEmployeeType('worker'); setPage(1); }}
            >
              <HardHat className="mr-1.5 h-3.5 w-3.5" />
              Workers
            </Button>
          </div>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load employees</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No employees found. Add your first employee to get started."
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
            <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={editingEmployee?.employee_code ? 'outline' : 'default'}
                size="sm"
                onClick={() => reset({ employee_type: 'staff' })}
              >
                <UserCircle className="mr-1.5 h-3.5 w-3.5" />
                Staff
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => reset({ employee_type: 'worker' })}
              >
                <HardHat className="mr-1.5 h-3.5 w-3.5" />
                Worker
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Employee Code"
                placeholder="EMP-001"
                {...register('employee_code')}
                error={errors.employee_code?.message}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Name"
                  placeholder="Full name"
                  {...register('name')}
                  error={errors.name?.message}
                />
              </div>
              <Input
                label="Email"
                type="email"
                placeholder="email@example.com"
                {...register('email')}
                error={errors.email?.message}
              />
              <Input
                label="Phone"
                placeholder="+91 XXXXX XXXXX"
                {...register('phone')}
                error={errors.phone?.message}
              />
              <div>
                <label className="text-sm font-medium text-foreground">Department</label>
                <Select
                  defaultValue={editingEmployee?.department || ''}
                  onValueChange={(v) => reset({ department: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                label="Designation"
                placeholder="Designation"
                {...register('designation')}
                error={errors.designation?.message}
              />
              <Input
                label="Date of Joining"
                type="date"
                {...register('date_of_joining')}
                error={errors.date_of_joining?.message}
              />
              <Input
                label="Basic Salary"
                type="number"
                placeholder="0.00"
                {...register('basic_salary')}
                error={errors.basic_salary?.message}
              />
              <Input
                label="PAN"
                placeholder="ABCDE1234F"
                {...register('pan')}
                error={errors.pan?.message}
              />
              <Input
                label="Aadhaar"
                placeholder="XXXX XXXX XXXX"
                {...register('aadhaar')}
                error={errors.aadhaar?.message}
              />
              <Input
                label="Bank Name"
                placeholder="Bank name"
                {...register('bank_name')}
                error={errors.bank_name?.message}
              />
              <Input
                label="Bank Account"
                placeholder="Account number"
                {...register('bank_account')}
                error={errors.bank_account?.message}
              />
              <Input
                label="IFSC Code"
                placeholder="SBIN0001234"
                {...register('ifsc_code')}
                error={errors.ifsc_code?.message}
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
                {editingEmployee ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{deletingEmployee?.name}</span>
              <span className="text-xs"> ({deletingEmployee?.employee_code})</span>?
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
              onClick={() => deletingEmployee && deleteMutation.mutate(deletingEmployee.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
