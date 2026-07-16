import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  Package,
  Users,
  Settings,
  Factory,
  BarChart3,
  PackageOpen,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from '@/components/ui';
import { cn, formatDate } from '@/lib/utils';
import api from '@/lib/api';

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

type Stage = (typeof STAGES)[number];

interface ProductionOrderDetail {
  id: string;
  order_number: string;
  date: string;
  product_id: string;
  product_name?: string;
  style_name?: string;
  planned_quantity: number;
  produced_quantity: number;
  rejected_quantity: number;
  completed_qty?: number;
  status: string;
  current_stage?: string;
  priority?: string;
  start_date?: string;
  end_date?: string;
  bom_id?: string;
  sales_order_id?: string;
  remarks?: string;
  stage_details: StageDetail[];
  bundles: BundleInfo[];
}

interface StageDetail {
  stage: string;
  input_qty: number;
  output_qty: number;
  rejected_qty: number;
  operator_name?: string;
  machine_name?: string;
  started_at?: string;
  completed_at?: string;
  remarks?: string;
  bundles: BundleInfo[];
}

interface BundleInfo {
  id: string;
  bundle_number: string;
  color_name?: string;
  size_name?: string;
  quantity: number;
  status: string;
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
    default: return 'outline' as const;
  }
};

const statusVariant = (status: string) => {
  switch (status) {
    case 'planned': return 'secondary' as const;
    case 'in_progress': return 'warning' as const;
    case 'completed': return 'success' as const;
    case 'on_hold': return 'outline' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'outline' as const;
  }
};

export default function ProductionTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['production-order-detail', id],
    queryFn: async () => {
      const { data } = await api.get<ProductionOrderDetail>(`/v1/production-orders/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const getOverallProgress = (): number => {
    if (!order) return 0;
    const currentIdx = STAGES.indexOf((order.current_stage || 'Planning') as Stage);
    if (currentIdx === -1) return 0;
    if (order.status === 'completed') return 100;
    return Math.round((currentIdx / (STAGES.length - 1)) * 100);
  };

  const getStageStatus = (stage: string): 'completed' | 'current' | 'pending' => {
    if (!order) return 'pending';
    const currentIdx = STAGES.indexOf((order.current_stage || 'Planning') as Stage);
    const stageIdx = STAGES.indexOf(stage as Stage);
    if (order.status === 'completed') return 'completed';
    if (stageIdx < currentIdx) return 'completed';
    if (stageIdx === currentIdx) return 'current';
    return 'pending';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-border" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm font-medium text-foreground">Failed to load production order</p>
        <p className="text-xs text-muted-foreground">The order may not exist or you lack permission</p>
        <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">{order.order_number}</h2>
            <Badge variant={statusVariant(order.status)}>{order.status.replace('_', ' ')}</Badge>
            {order.priority && (
              <Badge variant={order.priority === 'urgent' ? 'destructive' : order.priority === 'high' ? 'warning' : 'secondary'}>
                {order.priority}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {order.product_name || order.product_id}
            {order.style_name && ` — ${order.style_name}`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="rounded-lg bg-primary/10 p-2">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Planned</p>
              <p className="text-xl font-bold">{order.planned_quantity}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="rounded-lg bg-emerald-100 p-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-xl font-bold">{order.completed_qty || order.produced_quantity || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="rounded-lg bg-destructive/10 p-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rejected</p>
              <p className="text-xl font-bold">{order.rejected_quantity || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="rounded-lg bg-amber-100 p-2">
              <BarChart3 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="text-xl font-bold">{getOverallProgress()}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Production Pipeline</CardTitle>
            <span className="text-sm text-muted-foreground">{getOverallProgress()}% complete</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${getOverallProgress()}%` }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((stage, idx) => {
              const stageStatus = getStageStatus(stage);
              return (
                <div key={stage} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setExpandedStage(expandedStage === stage ? null : stage)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all hover:shadow-sm',
                      stageStatus === 'completed' && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                      stageStatus === 'current' && 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30',
                      stageStatus === 'pending' && 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {stageStatus === 'completed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : stageStatus === 'current' ? (
                      <Circle className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 opacity-40" />
                    )}
                    {stage}
                  </button>
                  {idx < STAGES.length - 1 && (
                    <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {STAGES.map((stage) => {
          const stageStatus = getStageStatus(stage);
          const stageDetail = order.stage_details?.find((d) => d.stage === stage);
          const isExpanded = expandedStage === stage;

          if (stageStatus === 'pending' && !stageDetail) return null;

          return (
            <Card
              key={stage}
              className={cn(
                'transition-all',
                stageStatus === 'current' && 'ring-1 ring-primary/30',
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg',
                        stageStatus === 'completed' && 'bg-emerald-100',
                        stageStatus === 'current' && 'bg-primary/10',
                        stageStatus === 'pending' && 'bg-muted',
                      )}
                    >
                      {stageStatus === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : stageStatus === 'current' ? (
                        <Factory className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <CardTitle className="text-sm">{stage}</CardTitle>
                    <Badge variant={stageVariant(stage)} className="text-[10px]">
                      {stageStatus === 'completed' ? 'Done' : stageStatus === 'current' ? 'Active' : 'Pending'}
                    </Badge>
                  </div>
                  {stageDetail && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setExpandedStage(isExpanded ? null : stage)}
                    >
                      {isExpanded ? 'Collapse' : 'Details'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {stageDetail ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-md border border-border p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Input</p>
                        <p className="text-sm font-bold">{stageDetail.input_qty}</p>
                      </div>
                      <div className="rounded-md border border-border p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Output</p>
                        <p className="text-sm font-bold text-emerald-600">{stageDetail.output_qty}</p>
                      </div>
                      <div className="rounded-md border border-border p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Rejected</p>
                        <p className={cn('text-sm font-bold', stageDetail.rejected_qty > 0 ? 'text-destructive' : '')}>
                          {stageDetail.rejected_qty}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {stageDetail.operator_name && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {stageDetail.operator_name}
                        </span>
                      )}
                      {stageDetail.machine_name && (
                        <span className="flex items-center gap-1">
                          <Settings className="h-3 w-3" />
                          {stageDetail.machine_name}
                        </span>
                      )}
                      {stageDetail.started_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(stageDetail.started_at, 'dd MMM HH:mm')}
                          {stageDetail.completed_at && ` → ${formatDate(stageDetail.completed_at, 'dd MMM HH:mm')}`}
                        </span>
                      )}
                    </div>

                    {isExpanded && stageDetail.bundles && stageDetail.bundles.length > 0 && (
                      <div className="mt-2 border-t border-border pt-3">
                        <p className="mb-2 flex items-center gap-1 text-xs font-semibold">
                          <PackageOpen className="h-3 w-3" />
                          Bundles in this stage ({stageDetail.bundles.length})
                        </p>
                        <div className="space-y-1.5">
                          {stageDetail.bundles.map((bundle) => (
                            <div
                              key={bundle.id}
                              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-medium">{bundle.bundle_number}</span>
                                {bundle.color_name && <span className="text-muted-foreground">{bundle.color_name}</span>}
                                {bundle.size_name && <span className="text-muted-foreground">{bundle.size_name}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Qty: {bundle.quantity}</span>
                                <Badge variant={stageVariant(bundle.current_stage)} className="text-[10px]">
                                  {bundle.current_stage || bundle.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {stageDetail.remarks && (
                      <p className="text-xs text-muted-foreground italic">{stageDetail.remarks}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data recorded for this stage yet.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {order.bundles && order.bundles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageOpen className="h-4 w-4" />
              All Bundles ({order.bundles.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bundle #</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Color</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Size</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Quantity</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Current Stage</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {order.bundles.map((bundle) => (
                    <tr key={bundle.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-mono text-xs font-medium">{bundle.bundle_number}</td>
                      <td className="px-3 py-2">{bundle.color_name || '—'}</td>
                      <td className="px-3 py-2">{bundle.size_name || '—'}</td>
                      <td className="px-3 py-2 text-right">{bundle.quantity}</td>
                      <td className="px-3 py-2">
                        <Badge variant={stageVariant(bundle.current_stage)}>
                          {bundle.current_stage || '—'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={stageVariant(bundle.status)}>{bundle.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Order Date</p>
          <p className="font-medium">{formatDate(order.date)}</p>
        </div>
        {order.start_date && (
          <div>
            <p className="text-xs text-muted-foreground">Start Date</p>
            <p className="font-medium">{formatDate(order.start_date)}</p>
          </div>
        )}
        {order.end_date && (
          <div>
            <p className="text-xs text-muted-foreground">End Date</p>
            <p className="font-medium">{formatDate(order.end_date)}</p>
          </div>
        )}
        {order.bom_id && (
          <div>
            <p className="text-xs text-muted-foreground">BOM</p>
            <p className="font-mono text-xs">{order.bom_id}</p>
          </div>
        )}
      </div>

      {order.remarks && (
        <div>
          <p className="text-xs text-muted-foreground">Remarks</p>
          <p className="text-sm">{order.remarks}</p>
        </div>
      )}
    </div>
  );
}
