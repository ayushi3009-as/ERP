import React, { useState, useEffect } from 'react';
import { Search, Activity, Calendar, User, ArrowRight, ClipboardList, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

const STAGE_PROGRESS: Record<string, number> = {
  planning: 10,
  cutting: 20,
  bundle: 30,
  printing: 40,
  embroidery: 50,
  stitching: 60,
  checking: 70,
  ironing: 80,
  packing: 90,
  finished: 95,
  dispatch: 100,
};

export default function ProductionTrackingPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Activity States
  const [activityLot, setActivityLot] = useState<Lot | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);

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

  // Calculate lot counts per stage
  const stageCounts = STAGES.reduce((acc, stage) => {
    acc[stage] = lots.filter((lot) => lot.current_process?.toLowerCase() === stage).length;
    return acc;
  }, {} as Record<string, number>);

  // Filter lots based on selected stage and search query
  const filteredLots = lots.filter((lot) => {
    const matchesStage = selectedStage
      ? lot.current_process?.toLowerCase() === selectedStage
      : true;
    const matchesSearch =
      lot.lot_number.toLowerCase().includes(search.toLowerCase()) ||
      (lot.design_number && lot.design_number.toLowerCase().includes(search.toLowerCase())) ||
      (lot.size && lot.size.toLowerCase().includes(search.toLowerCase()));
    return matchesStage && matchesSearch;
  });

  const columns: ColumnDef<Lot, unknown>[] = [
    {
      accessorKey: 'lot_number',
      header: 'Lot Number',
      cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.getValue('lot_number')}</span>,
    },
    {
      accessorKey: 'design_number',
      header: 'Design Number',
      cell: ({ row }) => <span>{row.original.design_number || `D-${row.original.design_id}`}</span>,
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
      accessorKey: 'progress',
      header: 'Overall Progress',
      cell: ({ row }) => {
        const progress = STAGE_PROGRESS[row.original.current_process?.toLowerCase()] || 0;
        return (
          <div className="w-full max-w-[150px] space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-purple-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'current_process',
      header: 'Current Stage',
      cell: ({ row }) => (
        <Badge variant="purple" className="uppercase tracking-wider">
          {row.original.current_process}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs flex items-center gap-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/20"
          onClick={() => fetchActivityLogs(row.original)}
        >
          <Activity className="h-3.5 w-3.5" />
          Track History
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Process Tracking</h2>
        <p className="text-sm text-muted-foreground">Monitor real-time lot progress across all stages of production.</p>
      </div>

      {/* Horizontal Scrollable Stages Overview */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        <Card
          className={`shrink-0 w-36 cursor-pointer border transition-all ${
            selectedStage === null
              ? 'border-purple-600 ring-1 ring-purple-600/20 bg-purple-500/5'
              : 'hover:border-purple-600/50'
          }`}
          onClick={() => setSelectedStage(null)}
        >
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <ClipboardList className="h-5 w-5 text-purple-600 mb-2" />
            <p className="text-xs text-muted-foreground font-semibold">ALL LOTS</p>
            <p className="text-lg font-bold text-foreground mt-1">{lots.length}</p>
          </CardContent>
        </Card>

        {STAGES.map((stage) => {
          const count = stageCounts[stage] || 0;
          const isActive = selectedStage === stage;
          return (
            <Card
              key={stage}
              className={`shrink-0 w-36 cursor-pointer border transition-all ${
                isActive
                  ? 'border-purple-600 ring-1 ring-purple-600/20 bg-purple-500/5'
                  : 'hover:border-purple-600/50'
              }`}
              onClick={() => setSelectedStage(stage)}
            >
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <div
                  className={`h-2 w-2 rounded-full mb-3 ${
                    count > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'
                  }`}
                />
                <p className="text-xs text-muted-foreground font-semibold uppercase truncate w-full">
                  {stage}
                </p>
                <p className="text-lg font-bold text-foreground mt-1">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by lot or design..."
              className="pl-9 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {selectedStage && (
            <Badge variant="outline" className="h-6 gap-1 border-purple-500/30 text-purple-600 uppercase">
              Filter: {selectedStage}
              <button
                type="button"
                className="hover:bg-accent rounded-full p-0.5 ml-1"
                onClick={() => setSelectedStage(null)}
              >
                &times;
              </button>
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredLots}
            loading={loading}
            emptyMessage="No lots found in this stage."
            pageSize={20}
          />
        </CardContent>
      </Card>

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
                {activityLogs.map((log) => (
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
