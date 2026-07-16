import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  AlertCircle,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Users,
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
import { cn, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type { AttendanceRecord, Employee, PaginatedResponse } from '@/types';

const attendanceSchema = z.object({
  employee_id: z.string().min(1, 'Employee is required'),
  date: z.string().min(1, 'Date is required'),
  status: z.enum(['present', 'absent', 'half_day', 'leave', 'holiday']),
  check_in: z.string(),
  check_out: z.string(),
  overtime_hours: z.coerce.number().min(0),
  remarks: z.string(),
});

const bulkAttendanceSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  entries: z.array(z.object({
    employee_id: z.string(),
    status: z.enum(['present', 'absent', 'half_day', 'leave', 'holiday']),
    check_in: z.string(),
    check_out: z.string(),
    overtime_hours: z.coerce.number().min(0),
  })),
});

type AttendanceFormData = z.infer<typeof attendanceSchema>;

interface AttendanceRow extends AttendanceRecord {
  employee_name?: string;
  employee_code?: string;
  department?: string;
}

const ATTENDANCE_STATUSES = ['present', 'absent', 'half_day', 'leave', 'holiday'] as const;

const statusVariant = (status: string) => {
  switch (status) {
    case 'present': return 'success' as const;
    case 'absent': return 'destructive' as const;
    case 'half_day': return 'warning' as const;
    case 'leave': return 'outline' as const;
    case 'holiday': return 'secondary' as const;
    default: return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'present': return 'Present';
    case 'absent': return 'Absent';
    case 'half_day': return 'Half Day';
    case 'leave': return 'Leave';
    case 'holiday': return 'Holiday';
    default: return status;
  }
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [view, setView] = useState<'daily' | 'monthly'>('daily');

  const [markDialogOpen, setMarkDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<AttendanceRow | null>(null);

  const { data: employeesData } = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Employee>>('/v1/employees', { params: { per_page: 200 } });
      return data.data;
    },
  });

  const { data: dailyData, isLoading: dailyLoading, isError: dailyError } = useQuery({
    queryKey: ['attendance', { selectedDate, search, page }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<AttendanceRow>>('/v1/attendance', {
        params: { date: selectedDate, search, page, per_page: 50 },
      });
      return data;
    },
    enabled: view === 'daily',
  });

  const { data: monthlyData, isLoading: monthlyLoading, isError: monthlyError } = useQuery({
    queryKey: ['attendance', 'monthly', { month, year }],
    queryFn: async () => {
      const { data } = await api.get('/v1/attendance/monthly-summary', {
        params: { month, year },
      });
      return data as { employees: Array<{ employee_id: string; employee_name: string; present: number; absent: number; half_day: number; leave: number; holiday: number; total_days: number }>; summary: { total_present: number; total_absent: number; total_leave: number } };
    },
    enabled: view === 'monthly',
  });

  const createMutation = useMutation({
    mutationFn: async (values: AttendanceFormData) => {
      const { data } = await api.post('/v1/attendance', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setMarkDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: AttendanceFormData & { id: string }) => {
      const { data } = await api.put(`/v1/attendance/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setMarkDialogOpen(false);
      resetForm();
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (values: { date: string; entries: Array<{ employee_id: string; status: string; check_in?: string; check_out?: string; overtime_hours?: number }> }) => {
      const { data } = await api.post('/v1/attendance/bulk', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setBulkDialogOpen(false);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AttendanceFormData>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: {
      employee_id: '',
      date: new Date().toISOString().split('T')[0],
      status: 'present',
      check_in: '',
      check_out: '',
      overtime_hours: 0,
      remarks: '',
    },
  });

  const [bulkEntries, setBulkEntries] = useState<Array<{ employee_id: string; status: string }>>([]);

  const employees = employeesData || [];

  function resetForm() {
    reset({
      employee_id: '',
      date: selectedDate,
      status: 'present',
      check_in: '',
      check_out: '',
      overtime_hours: 0,
      remarks: '',
    });
    setEditingAttendance(null);
  }

  function openMark() {
    resetForm();
    setMarkDialogOpen(true);
  }

  function openEdit(att: AttendanceRow) {
    setEditingAttendance(att);
    reset({
      employee_id: att.employee_id,
      date: att.date,
      status: att.status,
      check_in: att.check_in || '',
      check_out: att.check_out || '',
      overtime_hours: att.overtime_hours || 0,
      remarks: att.remarks || '',
    });
    setMarkDialogOpen(true);
  }

  function openBulk() {
    setBulkEntries(employees.map((e) => ({ employee_id: e.id, status: 'present' })));
    setBulkDialogOpen(true);
  }

  function onSubmit(values: AttendanceFormData) {
    if (editingAttendance) {
      updateMutation.mutate({ ...values, id: editingAttendance.id });
    } else {
      createMutation.mutate(values);
    }
  }

  function onBulkSubmit() {
    const validEntries = bulkEntries.filter((e) => e.employee_id && e.status);
    bulkMutation.mutate({ date: selectedDate, entries: validEntries });
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  }

  const columns: ColumnDef<AttendanceRow, unknown>[] = [
    {
      accessorKey: 'employee_code',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('employee_code') || '—'}</span>,
    },
    {
      accessorKey: 'employee_name',
      header: 'Employee',
      cell: ({ row }) => <span className="font-medium">{row.getValue('employee_name') || '—'}</span>,
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => <Badge variant="outline">{row.getValue('department') || '—'}</Badge>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as string;
        return <Badge variant={statusVariant(s)}>{statusLabel(s)}</Badge>;
      },
    },
    {
      accessorKey: 'check_in',
      header: 'Check In',
      cell: ({ row }) => <span className="text-xs">{(row.getValue('check_in') as string) || '—'}</span>,
    },
    {
      accessorKey: 'check_out',
      header: 'Check Out',
      cell: ({ row }) => <span className="text-xs">{(row.getValue('check_out') as string) || '—'}</span>,
    },
    {
      accessorKey: 'overtime_hours',
      header: 'OT Hours',
      cell: ({ row }) => <span>{(row.getValue('overtime_hours') as number) || 0}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  const monthlyColumns: ColumnDef<typeof monthlyData extends undefined ? never : NonNullable<typeof monthlyData>['employees'][number], unknown>[] = [
    {
      accessorKey: 'employee_name',
      header: 'Employee',
      cell: ({ row }) => <span className="font-medium">{row.getValue('employee_name')}</span>,
    },
    {
      accessorKey: 'present',
      header: 'Present',
      cell: ({ row }) => <span className="text-emerald-600 font-medium">{row.getValue('present')}</span>,
    },
    {
      accessorKey: 'absent',
      header: 'Absent',
      cell: ({ row }) => <span className="text-destructive font-medium">{row.getValue('absent')}</span>,
    },
    {
      accessorKey: 'half_day',
      header: 'Half Day',
      cell: ({ row }) => <span className="text-amber-600">{row.getValue('half_day')}</span>,
    },
    {
      accessorKey: 'leave',
      header: 'Leave',
      cell: ({ row }) => <span>{row.getValue('leave')}</span>,
    },
    {
      accessorKey: 'holiday',
      header: 'Holiday',
      cell: ({ row }) => <span>{row.getValue('holiday')}</span>,
    },
    {
      accessorKey: 'total_days',
      header: 'Total Days',
      cell: ({ row }) => <span className="font-medium">{row.getValue('total_days')}</span>,
    },
  ];

  const isPending = createMutation.isPending || updateMutation.isPending;
  const summary = monthlyData?.summary || { total_present: 0, total_absent: 0, total_leave: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Attendance</h2>
          <p className="text-sm text-muted-foreground">Track and manage employee attendance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openBulk}>
            <Users className="mr-2 h-4 w-4" />
            Bulk Entry
          </Button>
          <Button onClick={openMark}>
            <Plus className="mr-2 h-4 w-4" />
            Mark Attendance
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Present</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{view === 'monthly' ? summary.total_present : (dailyData?.data || []).filter((r) => r.status === 'present').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Absent</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{view === 'monthly' ? summary.total_absent : (dailyData?.data || []).filter((r) => r.status === 'absent').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">On Leave</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{view === 'monthly' ? summary.total_leave : (dailyData?.data || []).filter((r) => r.status === 'leave').length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex gap-2">
                <Button variant={view === 'daily' ? 'default' : 'outline'} size="sm" onClick={() => setView('daily')}>
                  <Calendar className="mr-1.5 h-3.5 w-3.5" />Daily
                </Button>
                <Button variant={view === 'monthly' ? 'default' : 'outline'} size="sm" onClick={() => setView('monthly')}>
                  <Calendar className="mr-1.5 h-3.5 w-3.5" />Monthly
                </Button>
              </div>
              {view === 'daily' && (
                <>
                  <Input type="date" className="w-full sm:w-[160px]" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                  </div>
                </>
              )}
              {view === 'monthly' && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-sm font-medium min-w-[140px] text-center">{MONTHS[month]} {year}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {view === 'daily' ? (
            dailyError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium text-foreground">Failed to load attendance</p>
                <p className="text-xs text-muted-foreground">Please try again later</p>
              </div>
            ) : (
              <DataTable columns={columns} data={dailyData?.data || []} loading={dailyLoading} emptyMessage="No attendance records found for this date." pageSize={50} />
            )
          ) : (
            monthlyError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium text-foreground">Failed to load monthly summary</p>
                <p className="text-xs text-muted-foreground">Please try again later</p>
              </div>
            ) : (
              <DataTable columns={monthlyColumns} data={monthlyData?.employees || []} loading={monthlyLoading} emptyMessage="No attendance data for this month." pageSize={50} />
            )
          )}
        </CardContent>
      </Card>

      <Dialog open={markDialogOpen} onOpenChange={(open) => { setMarkDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAttendance ? 'Edit Attendance' : 'Mark Attendance'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Employee *</label>
              <Select value={watch('employee_id') || ''} onValueChange={(v) => setValue('employee_id', v)} disabled={!!editingAttendance}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.employee_code})</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.employee_id && <p className="mt-1 text-xs text-destructive">{errors.employee_id.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Date" type="date" {...register('date')} error={errors.date?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={watch('status')} onValueChange={(v) => setValue('status', v as AttendanceFormData['status'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input label="Check In" type="time" {...register('check_in')} />
              <Input label="Check Out" type="time" {...register('check_out')} />
              <Input label="Overtime Hours" type="number" {...register('overtime_hours')} error={errors.overtime_hours?.message} />
            </div>
            <Input label="Remarks" placeholder="Remarks..." {...register('remarks')} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setMarkDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" loading={isPending}>{editingAttendance ? 'Update' : 'Mark'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Attendance Entry - {formatDate(selectedDate)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input label="Date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Employee</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkEntries.map((entry, index) => {
                    const emp = employees.find((e) => e.id === entry.employee_id);
                    return (
                      <tr key={entry.employee_id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium">{emp?.name || entry.employee_id}</td>
                        <td className="px-3 py-2">
                          <Select value={entry.status} onValueChange={(v) => {
                            const updated = [...bulkEntries];
                            updated[index] = { ...updated[index], status: v };
                            setBulkEntries(updated);
                          }}>
                            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ATTENDANCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
              <Button onClick={onBulkSubmit} loading={bulkMutation.isPending}>Save All</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
