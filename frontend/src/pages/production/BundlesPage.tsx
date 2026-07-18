import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  AlertCircle,
  ArrowRight,
  Package,
  Barcode,
  MoveRight,
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
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { Bundle, PaginatedResponse } from '@/types';

const STAGES = [
  'Planning',
  'Cutting',
  'Bundle',
  'Printing',
  'Embroidery',
  'Stitching',
  'Checking',
  'Ironing',
  'Packing',
  'Finished',
  'Dispatch',
] as const;

interface BundleRow extends Bundle {
  production_order_number?: string;
  product_name?: string;
  color_name?: string;
  size_name?: string;
  current_stage?: string;
}

const stageVariant = (stage: string | undefined) => {
  switch (stage) {
    case 'Planning': return 'secondary' as const;
    case 'Cutting': return 'outline' as const;
    case 'Bundle': return 'outline' as const;
    case 'Printing': return 'default' as const;
    case 'Embroidery': return 'default' as const;
    case 'Stitching': return 'warning' as const;
    case 'Checking': return 'warning' as const;
    case 'Ironing': return 'secondary' as const;
    case 'Packing': return 'success' as const;
    case 'Finished': return 'success' as const;
    case 'Dispatch': return 'success' as const;
    case 'created': return 'secondary' as const;
    case 'cutting': return 'outline' as const;
    case 'stitching': return 'warning' as const;
    case 'finishing': return 'default' as const;
    case 'completed': return 'success' as const;
    default: return 'outline' as const;
  }
};

const statusVariant = (status: string) => {
  switch (status) {
    case 'created': return 'secondary' as const;
    case 'cutting': return 'outline' as const;
    case 'stitching': return 'warning' as const;
    case 'finishing': return 'default' as const;
    case 'completed': return 'success' as const;
    default: return 'outline' as const;
  }
};

export default function BundlesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [stageFilter, setStageFilter] = useState('all');
  const [productionOrderFilter, setProductionOrderFilter] = useState('all');

  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [viewingBundle, setViewingBundle] = useState<BundleRow | null>(null);
  const [movingBundle, setMovingBundle] = useState<BundleRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bundles', { search, page, stageFilter, productionOrderFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<BundleRow>>('/v1/bundles', {
        params: {
          search,
          page,
          per_page: 20,
          ...(stageFilter !== 'all' && { current_stage: stageFilter }),
          ...(productionOrderFilter !== 'all' && { production_order_id: productionOrderFilter }),
        },
      });
      return data;
    },
  });

  const { data: productionOrdersData } = useQuery({
    queryKey: ['production-orders', 'for-bundles'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; order_number: string }>>('/v1/production-orders', {
        params: { per_page: 200 },
      });
      return data.data;
    },
  });

  const moveStageMutation = useMutation({
    mutationFn: async ({ id, next_stage }: { id: string; next_stage: string }) => {
      const { data } = await api.post(`/v1/bundles/${id}/move-stage`, { next_stage });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundles'] });
      setMoveDialogOpen(false);
      setMovingBundle(null);
    },
  });

  const getNextStage = (currentStage: string | undefined): string | null => {
    const stage = currentStage || 'Planning';
    const idx = STAGES.indexOf(stage as (typeof STAGES)[number]);
    if (idx === -1 || idx >= STAGES.length - 1) return null;
    return STAGES[idx + 1];
  };

  const openBarcode = (bundle: BundleRow) => {
    setViewingBundle(bundle);
    setBarcodeDialogOpen(true);
  };

  const openMoveStage = (bundle: BundleRow) => {
    setMovingBundle(bundle);
    setMoveDialogOpen(true);
  };

  const handleMoveStage = () => {
    if (!movingBundle) return;
    const nextStage = getNextStage(movingBundle.current_stage);
    if (nextStage) {
      moveStageMutation.mutate({ id: movingBundle.id, next_stage: nextStage });
    }
  };

  const columns: ColumnDef<BundleRow, unknown>[] = [
    {
      accessorKey: 'bundle_number',
      header: 'Bundle #',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">{row.getValue('bundle_number')}</span>
      ),
    },
    {
      accessorKey: 'production_order_number',
      header: 'Production Order',
      cell: ({ row }) => (
        <span className="text-xs">{row.getValue('production_order_number') || row.original.production_order_id}</span>
      ),
    },
    {
      accessorKey: 'product_name',
      header: 'Product',
      cell: ({ row }) => <span className="font-medium">{row.getValue('product_name') || row.original.product_id}</span>,
    },
    {
      accessorKey: 'color_name',
      header: 'Color',
      cell: ({ row }) => <span>{row.getValue('color_name') || '—'}</span>,
    },
    {
      accessorKey: 'size_name',
      header: 'Size',
      cell: ({ row }) => <span>{row.getValue('size_name') || '—'}</span>,
    },
    {
      accessorKey: 'quantity',
      header: 'Quantity',
      cell: ({ row }) => <span className="font-medium">{row.getValue('quantity')}</span>,
    },
    {
      accessorKey: 'current_stage',
      header: 'Current Stage',
      cell: ({ row }) => {
        const stage = (row.getValue('current_stage') as string) || row.original.status || '—';
        return <Badge variant={stageVariant(stage)}>{stage}</Badge>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return <Badge variant={statusVariant(status)}>{status}</Badge>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const bundle = row.original;
        const nextStage = getNextStage(bundle.current_stage);
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => { e.stopPropagation(); openBarcode(bundle); }}
              title="View Barcode"
            >
              <Barcode className="h-3.5 w-3.5" />
            </Button>
            {nextStage && bundle.status !== 'completed' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                onClick={(e) => { e.stopPropagation(); openMoveStage(bundle); }}
                title={`Move to ${nextStage}`}
              >
                <MoveRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const productionOrders = productionOrdersData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Bundles</h2>
          <p className="text-sm text-muted-foreground">Track bundles through production stages</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search bundles..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={productionOrderFilter} onValueChange={(v) => { setProductionOrderFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Production Order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  {productionOrders.map((po) => (
                    <SelectItem key={po.id} value={po.id}>{po.order_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.total} bundle{data.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load bundles</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
              loading={isLoading}
              emptyMessage="No bundles found. Bundles are created during production."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={barcodeDialogOpen} onOpenChange={setBarcodeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Barcode className="h-5 w-5" />
              Bundle Barcode
            </DialogTitle>
          </DialogHeader>
          {viewingBundle && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6">
                <div className="flex gap-0.5">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-16',
                        Math.random() > 0.3 ? 'bg-foreground' : 'bg-transparent',
                        i % 3 === 0 ? 'w-0.5' : 'w-1',
                      )}
                    />
                  ))}
                </div>
                <p className="mt-2 font-mono text-lg font-bold tracking-wider">
                  {viewingBundle.bundle_number}
                </p>
              </div>
              <div className="w-full space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product</span>
                  <span className="font-medium">{viewingBundle.product_name || viewingBundle.product_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Color</span>
                  <span className="font-medium">{viewingBundle.color_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size</span>
                  <span className="font-medium">{viewingBundle.size_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-medium">{viewingBundle.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stage</span>
                  <Badge variant={stageVariant(viewingBundle.current_stage)}>
                    {viewingBundle.current_stage || viewingBundle.status}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBarcodeDialogOpen(false)}>Close</Button>
            <Button
              variant="default"
              onClick={() => {
                const printContent = document.getElementById('barcode-print-area');
                if (printContent) {
                  window.print();
                }
              }}
            >
              <Package className="mr-2 h-4 w-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move Bundle to Next Stage</DialogTitle>
          </DialogHeader>
          {movingBundle && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-md border border-border p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{movingBundle.bundle_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {movingBundle.product_name || movingBundle.product_id}
                  </p>
                </div>
                <Badge variant={stageVariant(movingBundle.current_stage)}>
                  {movingBundle.current_stage || movingBundle.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Moving to</p>
                  <p className="text-sm font-semibold">{getNextStage(movingBundle.current_stage)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This will update the bundle's current stage. Make sure all items in the bundle are ready for the next stage.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
            <Button
              loading={moveStageMutation.isPending}
              onClick={handleMoveStage}
            >
              <MoveRight className="mr-2 h-4 w-4" />
              Move Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
