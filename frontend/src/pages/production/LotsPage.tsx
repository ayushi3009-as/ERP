import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Printer, Activity, Pencil, Trash2, AlertCircle, Calendar, User } from 'lucide-react';
import api from '@/lib/api';
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
  Badge,
} from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';

interface Lot {
  id: number;
  lot_number: string;
  barcode: string;
  design_id: number;
  design_number?: string;
  product_id: number;
  product_name?: string;
  size: string;
  quantity: number;
  current_process: string;
  created_at: string;
}

interface ActivityLog {
  id: number;
  barcode: string;
  scan_type: string;
  process_stage: string;
  remarks: string;
  created_at: string;
  scanned_by_name: string;
}

const lotSchema = z.object({
  design_number: z.string().min(1, 'Design Number is required'),
  size: z.string().min(1, 'Size is required (e.g. S, M, L, XL)'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  lot_number: z.string().optional(),
  barcode: z.string().optional(),
  current_process: z.string().optional(),
});

type LotFormData = z.infer<typeof lotSchema>;

const STAGES = [
  'planning',
  'cutting',
  'bundle',
  'printing',
  'embroidery',
  'stitching',
  'checking',
  'ironing',
  'packing',
  'finished',
  'dispatch',
];

export default function LotsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<Lot | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingLot, setDeletingLot] = useState<Lot | null>(null);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Print States
  const [printLot, setPrintLot] = useState<Lot | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  // Activity States
  const [activityLot, setActivityLot] = useState<Lot | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LotFormData>({
    resolver: zodResolver(lotSchema),
    defaultValues: {
      design_number: '',
      size: '',
      quantity: 1,
      lot_number: '',
      barcode: '',
      current_process: 'planning',
    },
  });

  useEffect(() => {
    fetchLots();
  }, []);

  const fetchLots = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/v1/lots');
      setLots(data.items || []);
    } catch (error) {
      console.error('Failed to fetch lots', error);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: LotFormData) => {
    setErrorMsg(null);
    try {
      const payload = {
        ...values,
        lot_number: values.lot_number || undefined,
        barcode: values.barcode || undefined,
        current_process: values.current_process || 'planning',
      };
      if (editingLot) {
        await api.put(`/v1/lots/${editingLot.id}`, payload);
      } else {
        await api.post('/v1/lots', payload);
      }
      setDialogOpen(false);
      resetForm();
      fetchLots();
    } catch (error: any) {
      console.error('Failed to save lot', error);
      setErrorMsg(
        error?.response?.data?.detail || 'Failed to save lot. Please check if Design Number exists.'
      );
    }
  };

  const deleteLot = async (id: number) => {
    try {
      await api.delete(`/v1/lots/${id}`);
      setDeleteDialogOpen(false);
      setDeletingLot(null);
      fetchLots();
    } catch (error) {
      console.error('Failed to delete lot', error);
    }
  };

  const fetchActivityLogs = async (lot: Lot) => {
    try {
      setLoadingActivity(true);
      setActivityLot(lot);
      setActivityDialogOpen(true);
      const { data } = await api.get(`/v1/lots/${lot.id}/activity`);
      setActivityLogs(data || []);
    } catch (error) {
      console.error('Failed to fetch lot activity', error);
    } finally {
      setLoadingActivity(false);
    }
  };

  const triggerLabelPrint = (lot: Lot) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${lot.lot_number}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              margin: 0;
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
            }
            .label-box {
              border: 2px dashed #000;
              padding: 20px;
              border-radius: 8px;
              width: 320px;
            }
            .title {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
              letter-spacing: 1px;
            }
            .subtitle {
              font-size: 11px;
              color: #555;
              margin-bottom: 15px;
              text-transform: uppercase;
            }
            .barcode-img {
              width: 100%;
              max-height: 80px;
              object-fit: contain;
              margin-bottom: 10px;
            }
            .meta {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              font-weight: 600;
              margin-top: 10px;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="label-box">
            <div class="title">MICROTECHNIQUE</div>
            <div class="subtitle">PRODUCTION LOT LABEL</div>
            <img class="barcode-img" src="https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(lot.lot_number)}&scale=3&rotate=N&includeText=true" alt="${lot.lot_number}" />
            <div class="meta">
              <div>SIZE: ${lot.size}</div>
              <div>QTY: ${lot.quantity} PCS</div>
              <div>STAGE: ${lot.current_process.toUpperCase()}</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  function resetForm() {
    reset({
      design_number: '',
      size: '',
      quantity: 1,
      lot_number: '',
      barcode: '',
      current_process: 'planning',
    });
    setEditingLot(null);
  }

  function openCreate() {
    resetForm();
    setErrorMsg(null);
    setDialogOpen(true);
  }

  function openEdit(lot: Lot) {
    setEditingLot(lot);
    setErrorMsg(null);
    reset({
      design_number: lot.design_number || `D-${lot.design_id}`,
      size: lot.size,
      quantity: lot.quantity,
      lot_number: lot.lot_number,
      barcode: lot.barcode,
      current_process: lot.current_process,
    });
    setDialogOpen(true);
  }

  const columns: ColumnDef<Lot, unknown>[] = [
    {
      accessorKey: 'lot_number',
      header: 'Lot Number',
      cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.getValue('lot_number')}</span>,
    },
    {
      accessorKey: 'barcode',
      header: 'Barcode UUID',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.getValue('barcode')}</span>,
    },
    {
      accessorKey: 'size_qty',
      header: 'Size & Qty',
      cell: ({ row }) => (
        <span>
          {row.original.size} / {row.original.quantity} pcs
        </span>
      ),
    },
    {
      accessorKey: 'current_process',
      header: 'Stage',
      cell: ({ row }) => (
        <Badge variant="purple" className="uppercase tracking-wider">
          {row.original.current_process}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created Date',
      cell: ({ row }) => <span>{new Date(row.original.created_at).toLocaleDateString()}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setPrintLot(row.original);
              setPrintDialogOpen(true);
            }}
            title="Print Barcode Label"
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => fetchActivityLogs(row.original)}
            title="View Activity"
          >
            <Activity className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row.original)} title="Edit Lot">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => {
              setDeletingLot(row.original);
              setDeleteDialogOpen(true);
            }}
            title="Delete Lot"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  // Filter lots based on client side search
  const filteredLots = lots.filter(
    (lot) =>
      lot.lot_number.toLowerCase().includes(search.toLowerCase()) ||
      (lot.barcode && lot.barcode.toLowerCase().includes(search.toLowerCase())) ||
      (lot.size && lot.size.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Lot Management</h2>
          <p className="text-sm text-muted-foreground">Create and track production batches.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Lot
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search lots..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredLots}
            loading={loading}
            emptyMessage="No lots found. Create one to get started."
            pageSize={20}
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLot ? 'Edit Lot' : 'Create New Lot'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <Input
              label="Design Number"
              placeholder="e.g. D-003"
              {...register('design_number')}
              error={errors.design_number?.message}
            />
            <Input
              label="Size"
              placeholder="e.g. S, M, L, XL"
              {...register('size')}
              error={errors.size?.message}
            />
            <Input
              label="Quantity"
              type="number"
              placeholder="e.g. 100"
              {...register('quantity')}
              error={errors.quantity?.message}
            />
            <Input
              label="Lot Number (Optional)"
              placeholder="Leave empty to auto-generate"
              {...register('lot_number')}
              error={errors.lot_number?.message}
            />
            <Input
              label="Barcode UUID (Optional)"
              placeholder="Leave empty to auto-generate"
              {...register('barcode')}
              error={errors.barcode?.message}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Stage</label>
              <Select
                value={watch('current_process') || 'planning'}
                onValueChange={(v) => setValue('current_process', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Stage" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errorMsg && (
              <div className="text-sm font-medium text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isSubmitting}>{editingLot ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Lot</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">{deletingLot?.lot_number}</span>?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingLot && deleteLot(deletingLot.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Label Print Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Print Production Lot Label</DialogTitle>
          </DialogHeader>
          {printLot && (
            <div className="flex flex-col items-center justify-center p-6 bg-accent/25 rounded-lg border border-border border-dashed space-y-4">
              <div className="border border-black p-4 bg-white rounded flex flex-col items-center justify-center w-[280px] shadow-sm">
                <div className="font-bold text-sm text-black tracking-widest">MICROTECHNIQUE</div>
                <div className="text-[9px] text-gray-500 font-semibold mb-3">PRODUCTION LOT LABEL</div>
                <img
                  className="h-16 w-full object-contain mb-2"
                  src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(printLot.lot_number)}&scale=2&rotate=N&includeText=true`}
                  alt={printLot.lot_number}
                />
                <div className="w-full flex justify-between text-[10px] font-bold text-black border-t border-gray-200 pt-2">
                  <div>SIZE: {printLot.size}</div>
                  <div>QTY: {printLot.quantity} PCS</div>
                  <div className="uppercase">STAGE: {printLot.current_process}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Click below to send the barcode label directly to your printer.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>Close</Button>
            <Button onClick={() => printLot && triggerLabelPrint(printLot)}>Print Label</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Timeline Dialog */}
      <Dialog open={activityDialogOpen} onOpenChange={setActivityDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lot Tracking History</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {loadingActivity ? (
              <div className="text-center text-sm text-muted-foreground py-8">Loading history...</div>
            ) : activityLogs.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8 space-y-2">
                <Activity className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p>No tracking history found.</p>
                <p className="text-xs">Scan this lot's barcode in the scanner page to record process movements.</p>
              </div>
            ) : (
              <div className="relative border-l border-muted-foreground/30 ml-4 space-y-6">
                {activityLogs.map((log, idx) => (
                  <div key={log.id} className="relative pl-6">
                    <div className="absolute -left-[9px] top-1.5 h-4.5 w-4.5 rounded-full border bg-background border-purple-500 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="purple" className="uppercase font-semibold tracking-wider">
                          {log.process_stage}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground pt-0.5">{log.remarks}</p>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 pt-0.5">
                        <User className="h-3 w-3" />
                        <span>Scanned by: {log.scanned_by_name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
