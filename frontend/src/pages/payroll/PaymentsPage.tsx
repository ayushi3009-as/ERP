import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Pencil, Trash2, AlertCircle } from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
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
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';
import { format } from 'date-fns';

const paymentSchema = z.object({
  payment_id: z.string().min(1, 'Payment ID is required'),
  employee_name: z.string().min(1, 'Employee name is required'),
  payment_type: z.string().min(1, 'Payment Type is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  remarks: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface InternalPayment {
  id: number;
  payment_id: string;
  payment_date: string;
  employee_name: string;
  payment_type: string;
  amount: number;
  remarks: string;
}

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<InternalPayment | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState<InternalPayment | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payments', { search, page }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<InternalPayment>>('/v1/payments', {
        params: { search, page, per_page: 20 },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: PaymentFormData) => {
      const { data } = await api.post('/v1/payments', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: PaymentFormData & { id: number }) => {
      const { data } = await api.put(`/v1/payments/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/v1/payments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setDeleteDialogOpen(false);
      setDeletingPayment(null);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_id: '',
      employee_name: '',
      payment_type: 'Piece-rate',
      amount: 0,
      remarks: '',
    },
  });

  function resetForm() {
    reset({ payment_id: '', employee_name: '', payment_type: 'Piece-rate', amount: 0, remarks: '' });
    setEditingPayment(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(payment: InternalPayment) {
    setEditingPayment(payment);
    reset({
      payment_id: payment.payment_id,
      employee_name: payment.employee_name,
      payment_type: payment.payment_type,
      amount: payment.amount,
      remarks: payment.remarks,
    });
    setDialogOpen(true);
  }

  function openDelete(payment: InternalPayment) {
    setDeletingPayment(payment);
    setDeleteDialogOpen(true);
  }

  function onSubmit(values: PaymentFormData) {
    if (editingPayment) {
      updateMutation.mutate({ ...values, id: editingPayment.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<InternalPayment, unknown>[] = [
    {
      accessorKey: 'payment_id',
      header: 'Payment ID',
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.getValue('payment_id')}</span>,
    },
    {
      accessorKey: 'payment_date',
      header: 'Date',
      cell: ({ row }) => {
        const date = row.getValue('payment_date') as string;
        return <span>{date ? format(new Date(date), 'dd MMM yyyy HH:mm') : '—'}</span>;
      },
    },
    {
      accessorKey: 'employee_name',
      header: 'Employee',
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.getValue('employee_name') || '—'}</span>
      ),
    },
    {
      accessorKey: 'payment_type',
      header: 'Type',
      cell: ({ row }) => <span>{row.getValue('payment_type')}</span>,
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency((row.getValue('amount') as number) || 0)}</span>
      ),
    },
    {
      accessorKey: 'remarks',
      header: 'Remarks',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.getValue('remarks') || '—'}</span>,
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
          <h2 className="text-2xl font-bold text-foreground">Internal Payments</h2>
          <p className="text-sm text-muted-foreground">Manage piece-rate wages and other internal payments</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Payment
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by Payment ID..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load payments</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
              loading={isLoading}
              emptyMessage="No payments found. Add your first payment to get started."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? 'Edit Payment' : 'Add New Payment'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <Input
              label="Payment ID (Voucher/Ref No)"
              placeholder="e.g. PAY-1001"
              {...register('payment_id')}
              error={errors.payment_id?.message}
            />
            <Input
              label="Employee Name"
              placeholder="e.g. Ramesh Kumar"
              {...register('employee_name')}
              error={errors.employee_name?.message}
            />
            <div>
              <label className="text-sm font-medium text-foreground">Payment Type</label>
              <Select
                value={watch('payment_type')}
                onValueChange={(v) => setValue('payment_type', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Piece-rate">Piece-rate</SelectItem>
                  <SelectItem value="Salary">Salary</SelectItem>
                  <SelectItem value="Advance">Advance</SelectItem>
                  <SelectItem value="Bonus">Bonus</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Amount (₹)"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register('amount')}
              error={errors.amount?.message}
            />
            <Input
              label="Remarks"
              placeholder="e.g. Paid for 50 pieces of Lot L-1001"
              {...register('remarks')}
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isPending}>{editingPayment ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Payment</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete payment <span className="font-medium text-foreground">{deletingPayment?.payment_id}</span>?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" loading={deleteMutation.isPending} onClick={() => deletingPayment && deleteMutation.mutate(deletingPayment.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
