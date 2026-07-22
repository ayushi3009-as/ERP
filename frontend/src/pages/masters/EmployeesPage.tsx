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
  full_name: z.string().min(1, 'Full Name is required'),
  employee_id: z.string().optional(),
  joined_date: z.string().optional(),
  operation: z.string().min(1, 'Operation is required'),
  rate: z.coerce.number().optional().default(0),
  total_pieces: z.coerce.number().optional().default(0),
  completed_pieces: z.coerce.number().optional().default(0),
  pending_pieces: z.coerce.number().optional().default(0),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

// The Employee interface from backend EmployeeResponse
interface Employee {
  id: number;
  full_name: string;
  email?: string;
  username?: string;
  phone?: string;
  role?: string;
  barcode?: string;
  joined_date?: string;
  is_active: boolean;
  created_at: string;
  avatar_url?: string;
  settings?: {
    department?: string;
    operation?: string;
    rate?: number;
    total_pieces?: number;
    completed_pieces?: number;
    pending_pieces?: number;
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
    defaultValues: { operation: 'Overlock', rate: 0, total_pieces: 0, completed_pieces: 0, pending_pieces: 0 },
  });

  function resetForm() {
    reset({ operation: 'Overlock', rate: 0, total_pieces: 0, completed_pieces: 0, pending_pieces: 0, full_name: '', employee_id: '', joined_date: '' });
    setEditingEmployee(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditingEmployee(emp);
    
    let op = 'Overlock';
    let rt = 0;
    let tot = 0;
    let comp = 0;
    let pend = 0;
    
    if (emp.avatar_url) {
      try {
        const parsed = JSON.parse(emp.avatar_url);
        op = parsed.operation || parsed.department || 'Overlock';
        rt = parsed.rate || 0;
        tot = parsed.total_pieces || parsed.pieces_given || 0;
        comp = parsed.completed_pieces || parsed.pieces_returned || 0;
        pend = parsed.pending_pieces || Math.max(0, tot - comp);
      } catch (e) {
        op = emp.avatar_url || 'Overlock';
      }
    }

    reset({
      full_name: emp.full_name || '',
      employee_id: emp.employee_id || '',
      joined_date: emp.joined_date || '',
      operation: op,
      rate: rt,
      total_pieces: tot,
      completed_pieces: comp,
      pending_pieces: pend,
    });
    setDialogOpen(true);
  }

  function handleDelete(emp: Employee) {
    if (window.confirm(`Are you sure you want to delete ${emp.full_name}?`)) {
      deleteMutation.mutate(emp.id);
    }
  }

  function onSubmit(values: EmployeeFormData) {
    const fallbackId = Date.now().toString(36);
    const serializedDept = JSON.stringify({
      operation: values.operation,
      rate: Number(values.rate || 0),
      total_pieces: Number(values.total_pieces || 0),
      completed_pieces: Number(values.completed_pieces || 0),
      pending_pieces: Number(values.pending_pieces || 0),
      department: values.operation
    });

    const payload = { 
      full_name: values.full_name,
      username: editingEmployee?.username || `emp_${fallbackId}`,
      email: editingEmployee?.email || `emp_${fallbackId}@microtechnique.in`,
      role: 'OPERATOR',
      employee_id: values.employee_id || null,
      joined_date: values.joined_date || null,
      settings: {
        department: serializedDept
      }
    } as any;

    if (editingEmployee) {
      updateMutation.mutate({ id: editingEmployee.id, values: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function showBarcode(emp: Employee) {
    setSelectedBarcode({ name: emp.full_name, code: emp.barcode || '' });
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
      cell: ({ row }) => <span className="font-semibold text-foreground">{row.getValue('full_name')}</span>,
    },
    {
      accessorKey: 'operation',
      header: 'Assigned Operation',
      cell: ({ row }) => {
        const emp = row.original;
        let opName = 'Overlock';
        if (emp.avatar_url) {
          try {
            const parsed = JSON.parse(emp.avatar_url);
            opName = parsed.operation || parsed.department || 'Overlock';
          } catch (e) {
            opName = emp.avatar_url;
          }
        }
        return (
          <Badge variant="secondary" className="font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200">
            {opName}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'rate',
      header: 'Rate (₹/pc)',
      cell: ({ row }) => {
        const emp = row.original;
        let rt = 0;
        if (emp.avatar_url) {
          try {
            const parsed = JSON.parse(emp.avatar_url);
            rt = parsed.rate || 0;
          } catch (e) {}
        }
        return <span className="font-bold text-slate-700 dark:text-slate-200">₹{rt}</span>;
      },
    },
    {
      accessorKey: 'barcode',
      header: 'Tracking Barcode',
      cell: ({ row }) => {
        const emp = row.original;
        const code = emp.barcode || `EMP-${emp.id}`;
        return (
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs flex items-center gap-1.5 text-purple-600 hover:text-purple-700 border-purple-200 bg-purple-50/50 hover:bg-purple-100/50"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); showBarcode(emp); }}
          >
            <ScanBarcode className="w-3.5 h-3.5" />
            <span className="font-mono">{code}</span>
          </Button>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Employee Status',
      cell: ({ row }) => {
        const emp = row.original;
        let tot = 0;
        let comp = 0;
        let pend = 0;
        if (emp.avatar_url) {
          try {
            const parsed = JSON.parse(emp.avatar_url);
            tot = parsed.total_pieces || parsed.pieces_given || 0;
            comp = parsed.completed_pieces || parsed.pieces_returned || 0;
            pend = parsed.pending_pieces || Math.max(0, tot - comp);
          } catch (e) {}
        }
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Total: <strong>{tot}</strong>
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">
              Done: <strong>{comp}</strong>
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50">
              Pending: <strong>{pend}</strong>
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Joined',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.joined_date ? row.original.joined_date : formatDate(row.getValue('created_at'))}</span>,
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

  const [selectedEmpTrack, setSelectedEmpTrack] = useState<any>(null);

  function showBarcode(emp: Employee) {
    let op = 'Overlock';
    let rt = 0;
    let tot = 0;
    let comp = 0;
    let pend = 0;
    if (emp.avatar_url) {
      try {
        const parsed = JSON.parse(emp.avatar_url);
        op = parsed.operation || parsed.department || 'Overlock';
        rt = parsed.rate || 0;
        tot = parsed.total_pieces || parsed.pieces_given || 0;
        comp = parsed.completed_pieces || parsed.pieces_returned || 0;
        pend = parsed.pending_pieces || Math.max(0, tot - comp);
      } catch (e) {}
    }
    const code = emp.barcode || `EMP-${emp.id}`;
    setSelectedBarcode({ name: emp.full_name, code });
    setSelectedEmpTrack({
      name: emp.full_name,
      code,
      operation: op,
      rate: rt,
      total_pieces: tot,
      completed_pieces: comp,
      pending_pieces: pend,
      damaged_pieces: 0,
      employee_id: emp.employee_id || `EMP-${emp.id}`,
    });
    setBarcodeDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Employee Master</h2>
          <p className="text-sm text-muted-foreground">Manage operations, piece-rates, and status tracking</p>
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
              <Input label="Full Name *" placeholder="e.g. Rahul Kumar" {...register('full_name')} error={errors.full_name?.message} />
              <Input label="Machine No (Optional)" placeholder="MCH-01" {...register('employee_id')} />
              <Input label="Joined Date (Optional)" type="date" {...register('joined_date')} />
              
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Assigned Operation *</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...register('operation')}
                >
                  <option value="Overlock">Overlock</option>
                  <option value="Catalog">Catalog</option>
                  <option value="Single">Single</option>
                  <option value="Press Duty">Press Duty</option>
                  <option value="Thread Cutting">Thread Cutting</option>
                </select>
                {errors.operation && <p className="text-xs text-red-500">{errors.operation.message}</p>}
              </div>

              <Input 
                label="Operation Rate (₹ / Piece) (Optional)" 
                type="number" 
                placeholder="0" 
                {...register('rate')} 
                error={errors.rate?.message}
              />
              <Input 
                label="Total Pieces Assigned (Optional)" 
                type="number" 
                placeholder="0" 
                {...register('total_pieces')} 
                error={errors.total_pieces?.message}
              />
              <Input 
                label="Completed Pieces (Optional)" 
                type="number" 
                placeholder="0" 
                {...register('completed_pieces')} 
                error={errors.completed_pieces?.message}
              />
              <Input 
                label="Pending Pieces (Optional)" 
                type="number" 
                placeholder="0" 
                {...register('pending_pieces')} 
                error={errors.pending_pieces?.message}
              />
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
        <DialogContent className="sm:max-w-md text-center flex flex-col items-center">
          <DialogHeader className="w-full">
            <DialogTitle className="text-center w-full text-xl font-bold">{selectedEmpTrack?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col items-center w-full space-y-4">
            {selectedEmpTrack?.code ? (
              <div className="p-3 bg-white border rounded-xl shadow-sm">
                <img
                  src={`https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${encodeURIComponent('https://erp.microtechnique.in/public/attendance/' + selectedEmpTrack.code)}&scale=3`}
                  alt={selectedEmpTrack.name}
                  className="w-36 h-36 object-contain"
                />
              </div>
            ) : null}
            <p className="font-mono text-xs font-bold tracking-widest text-muted-foreground bg-muted px-3 py-1 rounded">
              {selectedEmpTrack?.code || 'NO BARCODE'}
            </p>

            {/* Live Tracking Dashboard Card */}
            <div className="w-full border rounded-xl p-3 bg-slate-50 dark:bg-slate-900 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between border-b pb-1.5">
                <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Assigned Operation</span>
                <Badge variant="purple">{selectedEmpTrack?.operation || 'Overlock'}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="p-2 bg-white dark:bg-slate-800 rounded border text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Total</p>
                  <p className="text-base font-bold text-slate-800 dark:text-white">{selectedEmpTrack?.total_pieces || 0}</p>
                </div>
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 text-center">
                  <p className="text-[9px] font-bold text-emerald-600 uppercase">Completed</p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">{selectedEmpTrack?.completed_pieces || 0}</p>
                </div>
                <div className="p-2 bg-amber-50 dark:bg-amber-950/40 rounded border border-amber-200 text-center">
                  <p className="text-[9px] font-bold text-amber-600 uppercase">Pending</p>
                  <p className="text-base font-bold text-amber-700 dark:text-amber-300">{selectedEmpTrack?.pending_pieces || 0}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                <span>Rate: <strong>₹{selectedEmpTrack?.rate || 0}/pc</strong></span>
                <span>Status: <strong className="text-purple-600">Active</strong></span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">Scan with phone camera or QR scanner to view complete live tracking dashboard.</p>
          </div>
          <DialogFooter className="w-full sm:justify-center">
            <Button variant="outline" onClick={() => window.print()}>Print Tracking ID Card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
