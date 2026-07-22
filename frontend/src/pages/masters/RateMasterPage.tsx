import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Pencil, Trash2, AlertCircle, Coins } from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  DataTable,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

const rateSchema = z.object({
  name: z.string().min(1, 'Operation name is required'),
  process: z.string().min(1, 'Operation (Dept Category) is required'),
  rate: z.coerce.number().min(0, 'Rate must be greater than or equal to 0'),
  remarks: z.string().optional(),
  date: z.string().optional(),
  design_no: z.string().optional(),
});

type RateFormData = z.infer<typeof rateSchema>;

interface RateItem {
  id: number;
  name: string;
  process: string;
  rate: number;
  remarks?: string;
  date?: string;
  design_no?: string;
  created_at?: string;
}

export default function RateMasterPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RateItem | null>(null);

  const { data, isLoading, isError } = useQuery<PaginatedResponse<RateItem>>({
    queryKey: ['rates', page, search],
    queryFn: async () => {
      const { data } = await api.get('/v1/services', {
        params: { page, per_page: 20, search }
      });
      return data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (values: RateFormData) => {
      const { data } = await api.post('/v1/services', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rates'] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      let msg = error.response?.data?.detail;
      if (Array.isArray(msg)) msg = msg.map(m => m.msg).join(', ');
      alert(msg || "Failed to create operation rate.");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: RateFormData }) => {
      const { data } = await api.put(`/v1/services/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rates'] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      let msg = error.response?.data?.detail;
      if (Array.isArray(msg)) msg = msg.map(m => m.msg).join(', ');
      alert(msg || "Failed to update operation rate.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/v1/services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rates'] });
    }
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RateFormData>({
    resolver: zodResolver(rateSchema),
    defaultValues: { name: 'Stitching', process: 'Production', rate: 0, remarks: '' }
  });

  function resetForm() {
    reset({ name: 'Stitching', process: 'Production', rate: 0, remarks: '', date: '', design_no: '' });
    setEditingRate(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(item: RateItem) {
    setEditingRate(item);
    reset({
      name: item.name,
      process: item.process,
      rate: item.rate,
      remarks: item.remarks || '',
      date: item.date || '',
      design_no: item.design_no || '',
    });
    setDialogOpen(true);
  }

  function handleDelete(item: RateItem) {
    if (window.confirm(`Are you sure you want to delete rate for ${item.name}?`)) {
      deleteMutation.mutate(item.id);
    }
  }

  function onSubmit(values: RateFormData) {
    const payload: any = { ...values };
    
    // Scrub empty strings to avoid Pydantic "Input should be None" errors
    if (!payload.date) delete payload.date;
    if (!payload.remarks) delete payload.remarks;
    if (!payload.design_no) delete payload.design_no;
    
    if (editingRate) {
      updateMutation.mutate({ id: editingRate.id, values: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const columns = useMemo<ColumnDef<RateItem, unknown>[]>(() => [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-xs">#{row.getValue('id')}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Operation / Process Name',
      cell: ({ row }) => <span className="font-semibold text-foreground">{row.getValue('name')}</span>,
    },
    {
      accessorKey: 'process',
      header: 'Operation',
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.getValue('process')}
        </Badge>
      ),
    },
    {
      accessorKey: 'design_no',
      header: 'Design No',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.design_no || '—'}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-sm">{row.original.date ? new Date(row.original.date).toLocaleDateString() : '—'}</span>,
    },
    {
      accessorKey: 'rate',
      header: 'Defined Rate (₹ / Piece)',
      cell: ({ row }) => (
        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-base">
          ₹{row.getValue('rate')}
        </span>
      ),
    },
    {
      accessorKey: 'remarks',
      header: 'Notes / Remarks',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.getValue('remarks') || '—'}</span>,
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
          <h2 className="text-2xl font-bold text-foreground">Rate Master</h2>
          <p className="text-sm text-muted-foreground">Define operation piece-rates (Stitching, Collar, Overlock, Press, Thread Cutting)</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Operation Rate
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 w-full sm:max-w-xs relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search operation rates..."
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
              <p className="text-sm font-medium">Failed to load operation rates</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
              loading={isLoading}
              emptyMessage="No operation rates defined yet. Click 'Add Operation Rate' to create one."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRate ? 'Edit Operation Rate' : 'Add Operation Rate'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <Input 
              label="Operation / Process Name *" 
              placeholder="e.g. Stitching, Collar, Overlock, Press, Thread Cutting" 
              {...register('name')} 
              error={errors.name?.message} 
            />
            <Input 
              label="Operation (Dept Category) *" 
              placeholder="e.g. Production / Cutting / Finishing" 
              {...register('process')} 
              error={errors.process?.message} 
            />
            <Input 
              label="Date (Optional)" 
              type="date"
              {...register('date')} 
              error={errors.date?.message} 
            />
            <Input 
              label="Design No (Optional)" 
              placeholder="e.g. D-101" 
              {...register('design_no')} 
              error={errors.design_no?.message} 
            />
            <Input 
              label="Rate (₹ / Piece) *" 
              type="number" 
              placeholder="0" 
              {...register('rate')} 
              error={errors.rate?.message} 
            />
            <Input 
              label="Remarks / Notes (Optional)" 
              placeholder="Additional operation specs..." 
              {...register('remarks')} 
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editingRate ? 'Save Changes' : 'Create Rate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
