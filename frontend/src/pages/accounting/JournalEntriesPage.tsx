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
  FileText,
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
import type { JournalEntry, JournalEntryLine, Account, PaginatedResponse } from '@/types';

const lineSchema = z.object({
  account_id: z.string().min(1, 'Account is required'),
  debit: z.coerce.number().min(0),
  credit: z.coerce.number().min(0),
  description: z.string(),
});

const journalSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  narration: z.string(),
  reference_type: z.string(),
  reference_id: z.string(),
  lines: z.array(lineSchema).min(2, 'At least two lines are required'),
});

type JournalFormData = z.infer<typeof journalSchema>;

interface JERow extends JournalEntry {
  total_debit?: number;
  total_credit?: number;
}

const JE_STATUSES = ['all', 'draft', 'posted', 'cancelled'] as const;

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary' as const;
    case 'posted': return 'success' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'posted': return 'Posted';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

export default function JournalEntriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingJE, setViewingJE] = useState<JERow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['journal-entries', { search, page, statusFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<JERow>>('/v1/journal-entries', {
        params: {
          search,
          page,
          per_page: 20,
          ...(statusFilter !== 'all' && { status: statusFilter }),
        },
      });
      return data;
    },
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Account>>('/v1/accounts', { params: { per_page: 500 } });
      return data.data;
    },
    enabled: createDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (values: JournalFormData) => {
      const { data } = await api.post('/v1/journal-entries', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/v1/journal-entries/${id}/post`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
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
  } = useForm<JournalFormData>({
    resolver: zodResolver(journalSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      narration: '',
      reference_type: '',
      reference_id: '',
      lines: [
        { account_id: '', debit: 0, credit: 0, description: '' },
        { account_id: '', debit: 0, credit: 0, description: '' },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const watchedLines = watch('lines');

  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    watchedLines?.forEach((line) => {
      totalDebit += line?.debit || 0;
      totalCredit += line?.credit || 0;
    });
    return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }, [watchedLines]);

  function resetForm() {
    reset({
      date: new Date().toISOString().split('T')[0],
      narration: '',
      reference_type: '',
      reference_id: '',
      lines: [
        { account_id: '', debit: 0, credit: 0, description: '' },
        { account_id: '', debit: 0, credit: 0, description: '' },
      ],
    });
  }

  function openCreate() {
    resetForm();
    setCreateDialogOpen(true);
  }

  function openView(je: JERow) {
    setViewingJE(je);
    setViewDialogOpen(true);
  }

  function onSubmit(values: JournalFormData) {
    createMutation.mutate(values);
  }

  const accounts = accountsData || [];

  const getAccountName = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    return acc ? `${acc.code} - ${acc.name}` : accountId;
  };

  const columns: ColumnDef<JERow, unknown>[] = [
    {
      accessorKey: 'entry_number',
      header: 'Entry #',
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.getValue('entry_number')}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span>,
    },
    {
      accessorKey: 'narration',
      header: 'Narration',
      cell: ({ row }) => <span className="text-xs truncate max-w-[200px]">{(row.getValue('narration') as string) || '\u2014'}</span>,
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
      id: 'debit',
      header: 'Debit',
      cell: ({ row }) => {
        const total = row.original.lines?.reduce((s, l) => s + (l.debit || 0), 0) || row.original.total_debit || 0;
        return <span className="font-medium">{formatCurrency(total)}</span>;
      },
    },
    {
      id: 'credit',
      header: 'Credit',
      cell: ({ row }) => {
        const total = row.original.lines?.reduce((s, l) => s + (l.credit || 0), 0) || row.original.total_credit || 0;
        return <span className="font-medium">{formatCurrency(total)}</span>;
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
              onClick={(e) => { e.stopPropagation(); postMutation.mutate(row.original.id); }}
              disabled={postMutation.isPending}
              title="Post Entry"
            >
              <FileText className="h-3.5 w-3.5" />
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
          <h2 className="text-2xl font-bold text-foreground">Journal Entries</h2>
          <p className="text-sm text-muted-foreground">Create and manage journal entries</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Entry
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search entries..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && <p className="text-sm text-muted-foreground">{data.total} entr{data.total !== 1 ? 'ies' : 'y'} total</p>}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load journal entries</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable columns={columns} data={data?.data || []} loading={isLoading} emptyMessage="No journal entries found. Create your first entry to get started." pageSize={20} />
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Create Journal Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Date" type="date" {...register('date')} error={errors.date?.message} />
              <Input label="Narration" placeholder="Description..." {...register('narration')} />
              <Input label="Reference Type" placeholder="e.g. Invoice, GRN" {...register('reference_type')} />
              <Input label="Reference ID" {...register('reference_id')} />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Entry Lines</h4>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ account_id: '', debit: 0, credit: 0, description: '' })}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Add Line
                </Button>
              </div>
              {errors.lines?.message && <p className="mb-2 text-xs text-destructive">{errors.lines.message as string}</p>}
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Debit</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Credit</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <Select value={watch(`lines.${index}.account_id`) || ''} onValueChange={(v) => setValue(`lines.${index}.account_id`, v)}>
                            <SelectTrigger className="min-w-[200px]"><SelectValue placeholder="Select account" /></SelectTrigger>
                            <SelectContent>
                              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {errors.lines?.[index]?.account_id && <p className="mt-1 text-xs text-destructive">{errors.lines[index]?.account_id?.message}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" className="w-28" {...register(`lines.${index}.debit`, { valueAsNumber: true })} placeholder="0.00" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" className="w-28" {...register(`lines.${index}.credit`, { valueAsNumber: true })} placeholder="0.00" />
                        </td>
                        <td className="px-3 py-2">
                          <Input className="w-36" {...register(`lines.${index}.description`)} placeholder="Description" />
                        </td>
                        <td className="px-3 py-2">
                          {fields.length > 2 && (
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

            <div className="flex justify-end">
              <div className="w-72 space-y-2 rounded-md border border-border p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Debit</span>
                  <span className="font-medium">{formatCurrency(totals.totalDebit)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Credit</span>
                  <span className="font-medium">{formatCurrency(totals.totalCredit)}</span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Difference</span>
                    <span className={cn(totals.balanced ? 'text-emerald-600' : 'text-destructive')}>
                      {formatCurrency(Math.abs(totals.totalDebit - totals.totalCredit))}
                    </span>
                  </div>
                  {!totals.balanced && <p className="text-xs text-destructive mt-1">Entry is not balanced</p>}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" loading={createMutation.isPending} disabled={!totals.balanced}>Create Entry</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Journal Entry: {viewingJE?.entry_number}
            </DialogTitle>
          </DialogHeader>
          {viewingJE && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingJE.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={statusVariant(viewingJE.status)}>{statusLabel(viewingJE.status)}</Badge>
                </div>
                {viewingJE.reference_type && (
                  <div>
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <p className="font-medium">{viewingJE.reference_type} {viewingJE.reference_id ? `- ${viewingJE.reference_id}` : ''}</p>
                  </div>
                )}
              </div>

              {viewingJE.narration && (
                <div>
                  <p className="text-xs text-muted-foreground">Narration</p>
                  <p className="text-sm">{viewingJE.narration}</p>
                </div>
              )}

              <div>
                <h4 className="mb-2 text-sm font-semibold">Lines</h4>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Debit</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Credit</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingJE.lines || []).map((line) => (
                        <tr key={line.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-medium">{getAccountName(line.account_id)}</td>
                          <td className="px-3 py-2 text-right">{line.debit > 0 ? formatCurrency(line.debit) : '\u2014'}</td>
                          <td className="px-3 py-2 text-right">{line.credit > 0 ? formatCurrency(line.credit) : '\u2014'}</td>
                          <td className="px-3 py-2">{line.description || '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td className="px-3 py-2 font-bold">Total</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency((viewingJE.lines || []).reduce((s, l) => s + (l.debit || 0), 0))}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency((viewingJE.lines || []).reduce((s, l) => s + (l.credit || 0), 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
