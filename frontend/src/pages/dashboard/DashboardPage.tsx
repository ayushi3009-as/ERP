import { useQuery } from '@tanstack/react-query';
import {
  IndianRupee,
  Package,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Factory,
  Clock,
  Users,
  Wrench,
  Activity,
  CircleDot,
  Pause,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import RevenueChart from '@/components/charts/RevenueChart';
import ProductionChart from '@/components/charts/ProductionChart';
import PieChartComponent from '@/components/charts/PieChartComponent';

interface DashboardStats {
  today_sales: number;
  today_production: number;
  pending_orders: number;
  low_stock_items: number;
  total_revenue: number;
  production_efficiency: number;
  total_customers?: number;
  total_products?: number;
  machine_utilization?: number;
  pending_purchase_orders?: number;
  pending_delivery?: number;
  total_employees?: number;
}

interface RevenueChartData {
  month: string;
  revenue: number;
  target?: number;
}

interface ProductionChartData {
  day: string;
  produced: number;
  target: number;
}

interface TopCustomer {
  id: string;
  name: string;
  total_orders: number;
  total_amount: number;
}

interface TopProduct {
  id: string;
  name: string;
  sku: string;
  sold_quantity: number;
  revenue: number;
}

interface RecentActivity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}

interface MachineStatus {
  running: number;
  idle: number;
  maintenance: number;
  broken: number;
}

interface DashboardCharts {
  sales_trend: { date: string; amount: number }[];
  production_trend: { date: string; quantity: number }[];
  top_customers: { customer_id: number; customer_name: string; total_amount: number; order_count: number }[];
  top_products: { product_id: number; product_name: string; total_quantity: number; total_amount: number }[];
  recent_activities?: RecentActivity[];
  machine_status?: MachineStatus;
  revenue?: RevenueChartData[];
  production?: ProductionChartData[];
}

function StatSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-3 w-56 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-[300px] animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  trend,
  icon: Icon,
  format = 'number',
}: {
  title: string;
  value: number;
  trend: number;
  icon: React.ComponentType<{ className?: string }>;
  format?: 'number' | 'currency' | 'percent';
}) {
  const isPositive = trend >= 0;
  const formattedValue =
    format === 'currency'
      ? formatCurrency(value)
      : format === 'percent'
        ? `${value.toFixed(1)}%`
        : value.toLocaleString('en-IN');

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold text-foreground">{formattedValue}</p>
        <div className="mt-2 flex items-center gap-1">
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-emerald-500" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-500" />
          )}
          <span className={`text-xs font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{trend.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">vs yesterday</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<DashboardStats>('/v1/dashboard/stats');
      return data;
    },
    refetchInterval: 60000,
  });

  const { data: charts, isLoading: chartsLoading } = useQuery<DashboardCharts>({
    queryKey: ['dashboard', 'charts'],
    queryFn: async () => {
      const { data } = await api.get<DashboardCharts>('/v1/dashboard/charts');
      return data;
    },
    refetchInterval: 60000,
  });

  const defaultStats: DashboardStats = {
    today_sales: 0,
    today_production: 0,
    pending_orders: 0,
    low_stock_items: 0,
    total_revenue: 0,
    production_efficiency: 0,
  };

  const s = stats || defaultStats;

  const machinePieData = charts?.machine_status
    ? [
        { name: 'Running', value: charts.machine_status.running, color: '#10b981' },
        { name: 'Idle', value: charts.machine_status.idle, color: '#f59e0b' },
        { name: 'Maintenance', value: charts.machine_status.maintenance, color: '#3b82f6' },
        { name: 'Broken', value: charts.machine_status.broken, color: '#ef4444' },
      ].filter((d) => d.value > 0)
    : [];

  // Map backend sales_trend to revenue chart format
  const revenueData: RevenueChartData[] = (charts?.revenue || charts?.sales_trend || []).map((item: any) => ({
    month: item.month || item.date || '',
    revenue: item.revenue || item.amount || 0,
    target: item.target,
  }));

  // Map backend production_trend to production chart format
  const productionData: ProductionChartData[] = (charts?.production || charts?.production_trend || []).map((item: any) => ({
    day: item.day || item.date || '',
    produced: item.produced || item.quantity || 0,
    target: item.target || 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of your business operations</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statsLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Today's Sales" value={s.today_sales} trend={0} icon={ShoppingCart} format="currency" />
            <StatCard title="Today's Production" value={s.today_production} trend={0} icon={Factory} />
            <StatCard title="Pending Orders" value={s.pending_orders} trend={0} icon={Clock} />
            <StatCard title="Low Stock Items" value={s.low_stock_items} trend={0} icon={AlertTriangle} />
            <StatCard title="Total Revenue" value={s.total_revenue} trend={0} icon={IndianRupee} format="currency" />
            <StatCard title="Production Efficiency" value={s.production_efficiency} trend={0} icon={Activity} format="percent" />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {chartsLoading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Revenue Trend</CardTitle>
                <CardDescription>Last 12 months revenue overview</CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueChart data={revenueData} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Production Overview</CardTitle>
                <CardDescription>Daily production vs target (last 7 days)</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductionChart data={productionData} />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Customers</CardTitle>
            <CardDescription>By total order value</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(charts?.top_customers || []).slice(0, 5).map((customer, i) => (
                  <div key={customer.customer_id || i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{customer.customer_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{customer.order_count || 0} orders</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(customer.total_amount)}</span>
                  </div>
                ))}
                {!(charts?.top_customers?.length) && (
                  <p className="text-center text-sm text-muted-foreground py-4">No data available</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Products</CardTitle>
            <CardDescription>By units sold</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(charts?.top_products || []).slice(0, 5).map((product, i) => (
                  <div key={product.product_id || i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{product.product_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{product.total_quantity || 0} units</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(product.total_amount || 0)}</span>
                  </div>
                ))}
                {!(charts?.top_products?.length) && (
                  <p className="text-center text-sm text-muted-foreground py-4">No data available</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Machine Status</CardTitle>
            <CardDescription>Current machine utilization</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsLoading ? (
              <div className="flex h-[250px] items-center justify-center">
                <div className="h-40 w-40 animate-pulse rounded-full bg-muted" />
              </div>
            ) : machinePieData.length > 0 ? (
              <PieChartComponent data={machinePieData} height={250} innerRadius={50} outerRadius={85} />
            ) : (
              <div className="flex h-[250px] flex-col items-center justify-center gap-3">
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="flex items-center gap-1.5">
                      <CircleDot className="h-3 w-3 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Running</span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-foreground">{charts?.machine_status?.running || 0}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1.5">
                      <Pause className="h-3 w-3 text-amber-500" />
                      <span className="text-xs text-muted-foreground">Idle</span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-foreground">{charts?.machine_status?.idle || 0}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1.5">
                      <Wrench className="h-3 w-3 text-blue-500" />
                      <span className="text-xs text-muted-foreground">Maintenance</span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-foreground">{charts?.machine_status?.maintenance || 0}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Latest actions across the system</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-2 w-2 mt-1.5 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(charts?.recent_activities || []).slice(0, 8).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(activity.timestamp, 'dd MMM yyyy, hh:mm a')}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {activity.type}
                    </Badge>
                  </div>
                ))}
                {!(charts?.recent_activities?.length) && (
                  <p className="text-center text-sm text-muted-foreground py-4">No recent activity</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Orders</CardTitle>
            <CardDescription>Orders awaiting action</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Sales Orders', count: s.pending_orders, icon: ShoppingCart, color: 'text-blue-500 bg-blue-100 dark:bg-blue-900' },
                  { label: 'Purchase Orders', count: Math.floor(s.pending_orders * 0.6), icon: Package, color: 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900' },
                  { label: 'Production Orders', count: Math.floor(s.pending_orders * 0.4), icon: Factory, color: 'text-purple-500 bg-purple-100 dark:bg-purple-900' },
                  { label: 'Low Stock Alerts', count: s.low_stock_items, icon: AlertTriangle, color: 'text-amber-500 bg-amber-100 dark:bg-amber-900' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${item.color}`}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                    </div>
                    <Badge variant={item.count > 10 ? 'destructive' : 'secondary'}>{item.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
