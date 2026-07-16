import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  AlertCircle,
  Eye,
  X,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
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
import type { QualityCheck, QualityCheckParameter, Product, Employee, PaginatedResponse } from '@/types';

const paramSchema = z.object({
  parameter_name: z.string().min(1, 'Parameter name is required'),
  standard_value: z.string(),
  actual_value: z.string(),
  status: z.enum(['pass', 'fail', 'na']),
  remarks: z.string(),
});

const qcSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  check_type: z.enum(['incoming', 'in_process', 'final']),
  product_id: z.string().min(1, 'Product is required'),
  production_order_id: z.string(),
  grn_id: z.string(),
  sample_size: z.coerce.number().min(1, 'Sample size must be > 0'),
  passed_qty: z.coerce.number().min(0),
  rejected_qty: z.coerce.number().min(0),
  rework_qty: z.coerce.number().min(0),
  inspector_id: z.string(),
  remarks: z.string(),
  parameters: z.array(paramSchema),
});

type QCFormData = z.infer<typeof qcSchema>;

interface QCRow extends QualityCheck {
  product_name?: string;
  inspector_name?: string;
  check_type?: string;
  rework_qty?: number;
}

const QC_TYPES = ['all', 'incoming', 'in_process', 'final'] as const;
const QC_RESULTS = ['all', 'passed', 'failed', 'partial', 'pending'] as const;

const typeVariant = (type: string) => {
  switch (type) {
    case 'incoming': return 'default' as const;
    case 'in_process': return 'warning' as const;
    case 'final': return 'outline' as const;
    default: return 'secondary' as const;
  }
};

const typeLabel = (type: string) => {
  switch (type) {
    case 'incoming': return 'Incoming';
    case 'in_process': return 'In-Process';
    case 'final': return 'Final';
    default: return type;
  }
};

const resultVariant = (status: string) => {
  switch (status) {
    case 'passed': return 'success' as const;
    case 'failed': return 'destructive' as const;
    case 'partial': return 'warning' as const;
    case 'pending': return 'secondary' as const;
    default: return 'outline' as const;
  }
};

const resultLabel = (status: string) => {
  switch (status) {
    case 'passed': return 'Pass';
    case 'failed': return 'Fail';
    case 'partial': return 'Partial';
    case 'pending': return 'Pending';
    default: return status;
  }
};

export default function QualityChecksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingQC, setViewingQC] = useState<QCRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['quality-checks', { search, page, typeFilter, resultFilter, dateFrom, dateTo }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<QCRow>>('/v1/quality-checks', {
        params: {
          search,
          page,
          per_page: 20,
          ...(typeFilter !== 'all' && { check_type: typeFilter }),
          ...(resultFilter !== 'all' && { status: resultFilter }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
        },
      });
      return data;
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ['quality-checks', 'summary'],
    queryFn: async () => {
      const { data } = await api.get('/v1/quality-checks/summary');
      return data as { total: number; pass_rate: number; fail_rate: number; rework_rate: number };
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Product>>('/v1/products', { params: { per_page: 500 } });
      return data.data;
    },
    enabled: createDialogOpen,
  });

  const { data: inspectorsData } = useQuery({
    queryKey: ['employees', 'quality'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Employee>>('/v1/employees', {
        params: { department: 'Quality', per_page: 100 },
      });
      return data.data;
    },
    enabled: createDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (values: QCFormData) => {
      const { data } = await api.post('/v1/quality-checks', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality-checks'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QCFormData>({
    resolver: zodResolver(qcSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      check_type: 'incoming',
      product_id: '',
      production_order_id: '',
      grn_id: '',
      sample_size: 10,
      passed_qty: 0,
      rejected_qty: 0,
      rework_qty: 0,
      inspector_id: '',
      remarks: '',
      parameters: [{ parameter_name: '', standard_value: '', actual_value: '', status: 'na', remarks: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'parameters' });
  const watchedParams = watch('parameters');
  const passedQty = watch('passed_qty');
  const rejectedQty = watch('rejected_qty');
  const reworkQty = watch('rework_qty');

  const computedResult = useMemo(() => {
    if (rejectedQty === 0 && reworkQty === 0 && passedQty > 0) return 'Pass';
    if (passedQty === 0 && rejectedQty > 0) return 'Fail';
    if (reworkQty > 0) return 'Rework';
    return 'Pending';
  }, [passedQty, rejectedQty, reworkQty]);

  function resetForm() {
    reset({
      date: new Date().toISOString().split('T')[0],
      check_type: 'incoming',
      product_id: '',
      production_order_id: '',
      grn_id: '',
      sample_size: 10,
      passed_qty: 0,
      rejected_qty: 0,
      rework_qty: 0,
      inspector_id: '',
      remarks: '',
      parameters: [{ parameter_name: '', standard_value: '', actual_value: '', status: 'na', remarks: '' }],
    });
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openView(qc: QCRow) {
    setViewingQC(qc);
    setViewDialogOpen(true);
  }

  function onSubmit(values: QCFormData) {
    createMutation.mutate(values);
  }

  const columns: ColumnDef<QCRow, unknown>[] = [
    {
      accessorKey: 'check_number',
      header: 'QC #',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('check_number')}</span>
      ),
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span>,
    },
    {
      accessorKey: 'check_type',
      header: 'Type',
      cell: ({ row }) => {
        const t = (row.original.check_type || row.getValue('check_type')) as string;
        return <Badge variant={typeVariant(t)}>{typeLabel(t)}</Badge>;
      },
    },
    {
      accessorKey: 'product_name',
      header: 'Product',
      cell: ({ row }) => <span className="font-medium">{row.getValue('product_name') || '—'}</span>,
    },
    {
      accessorKey: 'sample_size',
      header: 'Inspected',
      cell: ({ row }) => <span>{row.getValue('sample_size')}</span>,
    },
    {
      accessorKey: 'passed_qty',
      header: 'Passed',
      cell: ({ row }) => <span className="text-emerald-600">{row.getValue('passed_qty')}</span>,
    },
    {
      accessorKey: 'failed_qty',
      header: 'Rejected',
      cell: ({ row }) => <span className="text-destructive">{row.getValue('failed_qty')}</span>,
    },
    {
      accessorKey: 'rework_qty',
      header: 'Rework',
      cell: ({ row }) => <span className="text-amber-600">{row.original.rework_qty || 0}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Result',
      cell: ({ row }) => {
        const s = row.getValue('status') as string;
        return <Badge variant={resultVariant(s)}>{resultLabel(s)}</Badge>;
      },
    },
    {
      accessorKey: 'inspector_name',
      header: 'Inspector',
      cell: ({ row }) => <span className="text-xs">{row.getValue('inspector_name') || '—'}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); openView(row.original); }}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  const summary = summaryData || { total: 0, pass_rate: 0, fail_rate: 0, rework_rate: 0 };
  const products = productsData || [];
  const inspectors = inspectorsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Quality Checks</h2>
          <p className="text-sm text-muted-foreground">Manage quality inspections and control</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New QC
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Checks</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{summary.pass_rate.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fail Rate</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{summary.fail_rate.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rework Rate</CardTitle>
            <RotateCcw className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{summary.rework_rate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search QC..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {QC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t === 'all' ? 'All Types' : typeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultFilter} onValueChange={(v) => { setResultFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Result" />
                </SelectTrigger>
                <SelectContent>
                  {QC_RESULTS.map((r) => (
                    <SelectItem key={r} value={r}>{r === 'all' ? 'All Results' : resultLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" className="w-full sm:w-[140px]" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
              <Input type="date" className="w-full sm:w-[140px]" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">{data.total} check{data.total !== 1 ? 's' : ''} total</p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load quality checks</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              emptyMessage="No quality checks found. Create your first QC to get started."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Create Quality Check</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Date" type="date" {...register('date')} error={errors.date?.message} />
              <div>
                <label className="text-sm font-medium text-foreground">Type *</label>
                <Select value={watch('check_type')} onValueChange={(v) => setValue('check_type', v as QCFormData['check_type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incoming">Incoming</SelectItem>
                    <SelectItem value="in_process">In-Process</SelectItem>
                    <SelectItem value="final">Final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Product *</label>
                <Select value={watch('product_id') || ''} onValueChange={(v) => setValue('product_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.product_id && <p className="mt-1 text-xs text-destructive">{errors.product_id.message}</p>}
              </div>
              <Input label="Production Order ID" {...register('production_order_id')} />
              <Input label="GRN ID" {...register('grn_id')} />
              <div>
                <label className="text-sm font-medium text-foreground">Inspector</label>
                <Select value={watch('inspector_id') || ''} onValueChange={(v) => setValue('inspector_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select inspector" /></SelectTrigger>
                  <SelectContent>
                    {inspectors.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input label="Sample Size" type="number" {...register('sample_size')} error={errors.sample_size?.message} />
              <Input label="Passed Qty" type="number" {...register('passed_qty')} error={errors.passed_qty?.message} />
              <Input label="Rejected Qty" type="number" {...register('rejected_qty')} error={errors.rejected_qty?.message} />
              <Input label="Rework Qty" type="number" {...register('rework_qty')} error={errors.rework_qty?.message} />
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="text-sm font-medium">Computed Result: <Badge variant={computedResult === 'Pass' ? 'success' : computedResult === 'Fail' ? 'destructive' : computedResult === 'Rework' ? 'warning' : 'secondary'}>{computedResult}</Badge></p>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">QC Parameters</h4>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ parameter_name: '', standard_value: '', actual_value: '', status: 'na', remarks: '' })}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Add Parameter
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Parameter</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Standard</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actual</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remarks</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <Input className="min-w-[120px]" {...register(`parameters.${index}.parameter_name`)} placeholder="Name" />
                        </td>
                        <td className="px-3 py-2">
                          <Input className="w-24" {...register(`parameters.${index}.standard_value`)} placeholder="Standard" />
                        </td>
                        <td className="px-3 py-2">
                          <Input className="w-24" {...register(`parameters.${index}.actual_value`)} placeholder="Actual" />
                        </td>
                        <td className="px-3 py-2">
                          <Select value={watch(`parameters.${index}.status`) || 'na'} onValueChange={(v) => setValue(`parameters.${index}.status`, v as 'pass' | 'fail' | 'na')}>
                            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pass">Pass</SelectItem>
                              <SelectItem value="fail">Fail</SelectItem>
                              <SelectItem value="na">N/A</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input className="w-28" {...register(`parameters.${index}.remarks`)} placeholder="Remarks" />
                        </td>
                        <td className="px-3 py-2">
                          {fields.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(index)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Input label="Remarks" placeholder="Additional remarks..." {...register('remarks')} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" loading={createMutation.isPending}>Create QC</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              QC: {viewingQC?.check_number}
            </DialogTitle>
          </DialogHeader>
          {viewingQC && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingQC.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant={typeVariant(viewingQC.check_type || '')}>{typeLabel(viewingQC.check_type || '')}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Result</p>
                  <Badge variant={resultVariant(viewingQC.status)}>{resultLabel(viewingQC.status)}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Product</p>
                  <p className="font-medium">{viewingQC.product_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Inspector</p>
                  <p className="font-medium">{viewingQC.inspector_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sample Size</p>
                  <p className="font-medium">{viewingQC.sample_size}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Passed</p>
                  <p className="font-medium text-emerald-600">{viewingQC.passed_qty}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                  <p className="font-medium text-destructive">{viewingQC.failed_qty}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rework</p>
                  <p className="font-medium text-amber-600">{viewingQC.rework_qty || 0}</p>
                </div>
              </div>

              {viewingQC.parameters && viewingQC.parameters.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Parameters</h4>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Parameter</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Standard</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actual</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingQC.parameters.map((p) => (
                          <tr key={p.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">{p.parameter_name}</td>
                            <td className="px-3 py-2">{p.standard_value || '—'}</td>
                            <td className="px-3 py-2">{p.actual_value || '—'}</td>
                            <td className="px-3 py-2">
                              <Badge variant={p.status === 'pass' ? 'success' : p.status === 'fail' ? 'destructive' : 'secondary'}>{p.status}</Badge>
                            </td>
                            <td className="px-3 py-2">{p.remarks || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewingQC.remarks && (
                <div>
                  <p className="text-xs text-muted-foreground">Remarks</p>
                  <p className="text-sm">{viewingQC.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
