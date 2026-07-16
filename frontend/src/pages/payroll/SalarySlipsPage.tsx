import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  AlertCircle,
  Eye,
  FileText,
  CheckCircle,
  DollarSign,
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
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type { SalarySlip, Employee, PaginatedResponse } from '@/types';

const generateSchema = z.object({
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2020).max(2100),
});

type GenerateFormData = z.infer<typeof generateSchema>;

interface SlipRow extends SalarySlip {
  employee_name?: string;
  employee_code?: string;
  department?: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SLIP_STATUSES = ['all', 'draft', 'approved', 'paid'] as const;

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'approved': return 'default' as const;
    case 'paid': return 'success' as const;
    default: return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'approved': return 'Approved';
    case 'paid': return 'Paid';
    default: return status;
  }
};

export default function SalarySlipsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingSlip, setViewingSlip] = useState<SlipRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['salary-slips', { search, page, statusFilter, monthFilter, yearFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<SlipRow>>('/v1/salary-slips', {
        params: {
          search,
          page,
          per_page: 20,
          ...(statusFilter !== 'all' && { status: statusFilter }),
          ...(monthFilter !== 'all' && { month: monthFilter }),
          ...(yearFilter !== 'all' && { year: yearFilter }),
        },
      });
      return data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/v1/salary-slips/${id}/approve`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-slips'] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GenerateFormData>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (values: GenerateFormData) => {
      const { data } = await api.post('/v1/salary-slips/generate', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-slips'] });
      setGenerateDialogOpen(false);
      reset();
    },
  });

  function openView(slip: SlipRow) {
    setViewingSlip(slip);
    setViewDialogOpen(true);
  }

  function onGenerate(values: GenerateFormData) {
    generateMutation.mutate(values);
  }

  const columns: ColumnDef<SlipRow, unknown>[] = [
    {
      accessorKey: 'slip_number',
      header: 'Slip #',
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.getValue('slip_number')}</span>,
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
      id: 'period',
      header: 'Month/Year',
      cell: ({ row }) => (
        <span className="text-xs">{MONTHS[(row.original.month || 1) - 1]} {row.original.year}</span>
      ),
    },
    {
      accessorKey: 'gross_salary',
      header: 'Gross',
      cell: ({ row }) => <span>{formatCurrency((row.getValue('gross_salary') as number) || 0)}</span>,
    },
    {
      id: 'deductions',
      header: 'Deductions',
      cell: ({ row }) => {
        const total = (row.original.pf_deduction || 0) + (row.original.esi_deduction || 0) + (row.original.tds_deduction || 0) + (row.original.other_deductions || 0);
        return <span className="text-destructive">{formatCurrency(total)}</span>;
      },
    },
    {
      accessorKey: 'net_salary',
      header: 'Net',
      cell: ({ row }) => <span className="font-medium">{formatCurrency((row.getValue('net_salary') as number) || 0)}</span>,
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
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openView(row.original); }}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {row.original.status === 'draft' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
              onClick={(e) => { e.stopPropagation(); approveMutation.mutate(row.original.id); }}
              disabled={approveMutation.isPending}
              title="Approve"
            >
              <CheckCircle className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Salary Slips</h2>
          <p className="text-sm text-muted-foreground">Manage payroll and salary slips</p>
        </div>
        <Button onClick={() => setGenerateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate Slips
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search slips..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLIP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={monthFilter} onValueChange={(v) => { setMonthFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Month" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && <p className="text-sm text-muted-foreground">{data.total} slip{data.total !== 1 ? 's' : ''} total</p>}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load salary slips</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable columns={columns} data={data?.data || []} loading={isLoading} emptyMessage="No salary slips found. Generate slips for a month to get started." pageSize={20} />
          )}
        </CardContent>
      </Card>

      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Salary Slips</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Month *</label>
                <Select defaultValue={String(new Date().getMonth() + 1)} onValueChange={(v) => reset({ month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input label="Year" type="number" {...register('year')} error={errors.year?.message} />
            </div>
            <p className="text-xs text-muted-foreground">This will generate salary slips for all active employees for the selected month.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGenerateDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={generateMutation.isPending}>Generate</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Salary Slip: {viewingSlip?.slip_number}
            </DialogTitle>
          </DialogHeader>
          {viewingSlip && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Employee</p>
                  <p className="font-medium">{viewingSlip.employee_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Period</p>
                  <p className="font-medium">{MONTHS[(viewingSlip.month || 1) - 1]} {viewingSlip.year}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={statusVariant(viewingSlip.status)}>{statusLabel(viewingSlip.status)}</Badge>
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold">Earnings</h4>
                <div className="space-y-2 rounded-md border border-border p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Basic Salary</span>
                    <span>{formatCurrency(viewingSlip.basic_salary)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">HRA</span>
                    <span>{formatCurrency(viewingSlip.hra)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Allowances</span>
                    <span>{formatCurrency(viewingSlip.allowances)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-sm font-bold">
                    <span>Gross Salary</span>
                    <span>{formatCurrency(viewingSlip.gross_salary)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold">Deductions</h4>
                <div className="space-y-2 rounded-md border border-border p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PF</span>
                    <span className="text-destructive">{formatCurrency(viewingSlip.pf_deduction)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ESI</span>
                    <span className="text-destructive">{formatCurrency(viewingSlip.esi_deduction)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">TDS</span>
                    <span className="text-destructive">{formatCurrency(viewingSlip.tds_deduction)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Other Deductions</span>
                    <span className="text-destructive">{formatCurrency(viewingSlip.other_deductions)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-sm font-bold">
                    <span>Total Deductions</span>
                    <span className="text-destructive">{formatCurrency((viewingSlip.pf_deduction || 0) + (viewingSlip.esi_deduction || 0) + (viewingSlip.tds_deduction || 0) + (viewingSlip.other_deductions || 0))}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border-2 border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
                <div className="flex justify-between text-sm font-bold">
                  <span>Net Salary</span>
                  <span className="text-emerald-700 dark:text-emerald-400">{formatCurrency(viewingSlip.net_salary)}</span>
                </div>
              </div>

              {viewingSlip.paid_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Paid Date</p>
                  <p className="text-sm font-medium">{formatDate(viewingSlip.paid_date)}</p>
                </div>
              )}

              {viewingSlip.remarks && (
                <div>
                  <p className="text-xs text-muted-foreground">Remarks</p>
                  <p className="text-sm">{viewingSlip.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
