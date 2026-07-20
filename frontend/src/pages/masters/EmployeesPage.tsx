import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Pencil, Trash2, AlertCircle, ScanBarcode } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

// The Employee schema as expected by backend EmployeeCreate
const employeeSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  username: z.string().min(1, 'Username is required'),
  phone: z.string().optional(),
  role: z.string().min(1, 'Role is required'),
  employee_id: z.string().optional(),
  joined_date: z.string().optional(),
  barcode: z.string().optional(),
  department: z.string().min(1, 'Department is required'),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

// The Employee interface from backend EmployeeResponse
interface Employee {
  id: number;
  full_name: string;
  email: string;
  username: string;
  phone: string;
  role: string;
  barcode: string;
  employee_id?: string;
  joined_date?: string;
  is_active: boolean;
  created_at: string;
  settings?: {
    department?: string;
  };
}

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState<{name: string, code: string} | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employees', { search, page }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Employee>>('/v1/employees', {
        params: { search, skip: (page - 1) * 20, limit: 20 },
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
    onError: (error: any) => {
      alert(error.response?.data?.detail || "Failed to create employee. Barcode, email or username might already be in use.");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number, values: EmployeeFormData }) => {
      const { data } = await api.put(`/v1/employees/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || "Failed to update employee.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/v1/employees/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { role: 'WORKER', department: 'STITCHING' },
  });

  function resetForm() {
    reset({ role: 'WORKER', department: 'STITCHING', full_name: '', email: '', username: '', phone: '', employee_id: '', joined_date: '', barcode: '' });
    setEditingEmployee(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditingEmployee(emp);
    reset({
      full_name: emp.full_name || '',
      email: emp.email || '',
      username: emp.username || '',
      phone: emp.phone || '',
      role: emp.role || 'WORKER',
      employee_id: emp.employee_id || '',
      joined_date: emp.joined_date || '',
      barcode: emp.barcode || '',
      department: emp.settings?.department || 'STITCHING',
    });
    setDialogOpen(true);
  }

  function handleDelete(emp: Employee) {
    if (window.confirm(`Are you sure you want to delete ${emp.full_name}?`)) {
      deleteMutation.mutate(emp.id);
    }
  }

  function onSubmit(values: EmployeeFormData) {
    const payload = { 
      ...values,
      settings: {
        department: values.department
      }
    } as any;
    
    // Delete local form-only field
    delete payload.department;
    
    if (!payload.joined_date) payload.joined_date = null;
    if (!payload.employee_id) payload.employee_id = null;
    if (!payload.barcode) payload.barcode = null;
    if (!payload.phone) payload.phone = null;

    if (editingEmployee) {
      updateMutation.mutate({ id: editingEmployee.id, values: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function showBarcode(emp: Employee) {
    setSelectedBarcode({ name: emp.full_name, code: emp.barcode });
    setBarcodeDialogOpen(true);
  }

  const columns = useMemo<ColumnDef<Employee, unknown>[]>(() => [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-xs">#{row.getValue('id')}</span>,
    },
    {
      accessorKey: 'full_name',
      header: 'Name',
      cell: ({ row }) => <span className="font-medium">{row.getValue('full_name')}</span>,
    },
    {
      accessorKey: 'role',
      header: 'Department',
      cell: ({ row }) => {
        const emp = row.original;
        const val = String(emp.settings?.department || emp.role || 'Worker').replace("_", " ").toLowerCase();
        return (
          <Badge variant="outline" className="capitalize">
            {val}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email / Username',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium">{row.getValue('email')}</span>
          <span className="text-[10px] text-muted-foreground">{row.original.username}</span>
        </div>
      ),
    },
    {
      accessorKey: 'barcode',
      header: 'Barcode',
      cell: ({ row }) => (
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 text-xs flex items-center text-purple-600 hover:text-purple-700 hover:bg-purple-50"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); showBarcode(row.original); }}
        >
          <ScanBarcode className="w-3 h-3 mr-1" />
          {row.getValue('barcode')}
        </Button>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Joined',
      cell: ({ row }) => <span>{row.original.joined_date ? row.original.joined_date : formatDate(row.getValue('created_at'))}</span>,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(row.original)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    }
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Employees</h2>
          <p className="text-sm text-muted-foreground">Manage factory workers and operators</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Employee
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 w-full sm:max-w-xs relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive mb-2" />
              <p className="text-sm font-medium">Failed to load employees</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
              loading={isLoading}
              emptyMessage="No employees found. Add your first employee to get started."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Employee ID (Optional)" placeholder="EMP-001" {...register('employee_id')} />
              <Input label="Joined Date (Optional)" type="date" {...register('joined_date')} />
              <Input label="Full Name" placeholder="e.g. John Doe" {...register('full_name')} error={errors.full_name?.message} />
              <Input label="Username" placeholder="johndoe" {...register('username')} error={errors.username?.message} />
              <Input label="Email" type="email" placeholder="john@example.com" {...register('email')} error={errors.email?.message} />
              <Input label="Phone (Optional)" placeholder="+1234567890" {...register('phone')} />
              <Input label="Barcode (Optional)" placeholder="Leave empty for auto-generate" {...register('barcode')} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Department / Role</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...register('department')}
                >
                  <option value="STITCHING">Stitching Department</option>
                  <option value="CUTTING">Cutting Department</option>
                  <option value="CHECKING">Checking Department</option>
                  <option value="FINISHING">Finishing Department</option>
                  <option value="PACKING">Packing Department</option>
                  <option value="IRONING">Ironing Department</option>
                  <option value="SUPERVISOR">Supervisor / Manager</option>
                  <option value="ADMIN">HR / Payroll Admin</option>
                </select>
                {errors.department && <p className="text-xs text-red-500">{errors.department.message}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editingEmployee ? 'Save Changes' : 'Create Employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={barcodeDialogOpen} onOpenChange={setBarcodeDialogOpen}>
        <DialogContent className="sm:max-w-xs text-center flex flex-col items-center">
          <DialogHeader>
            <DialogTitle className="text-center w-full">{selectedBarcode?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center">
            {selectedBarcode?.code ? (
              <img
                src={`https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${encodeURIComponent('https://erp.microtechnique.in/public/attendance/' + selectedBarcode.code)}&scale=3`}
                alt={selectedBarcode.name}
                className="w-32 h-32 object-contain mb-4"
              />
            ) : null}
            <p className="font-mono text-sm font-bold tracking-widest">{selectedBarcode?.code || 'NO BARCODE'}</p>
            <p className="text-xs text-muted-foreground mt-2">Scan this ID card with a phone to log attendance instantly.</p>
          </div>
          <DialogFooter className="w-full sm:justify-center">
            <Button variant="outline" onClick={() => window.print()}>Print ID Card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
