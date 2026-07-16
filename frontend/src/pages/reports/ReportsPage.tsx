import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  AlertCircle,
  BarChart3,
  ShoppingCart,
  Package,
  Factory,
  FileSpreadsheet,
  TrendingUp,
  ClipboardList,
  Scissors,
  Users,
  Activity,
  ArrowLeft,
  Calendar,
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
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';

interface ReportConfig {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  columns: ColumnDef<Record<string, unknown>, unknown>[];
}

const REPORTS: ReportConfig[] = [
  {
    id: 'sales',
    title: 'Sales Report',
    description: 'Sales analysis by period, customer, and product',
    icon: ShoppingCart,
    endpoint: '/v1/reports/sales',
    columns: [
      { accessorKey: 'date', header: 'Date', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span> },
      { accessorKey: 'invoice_number', header: 'Invoice #', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('invoice_number') as string}</span> },
      { accessorKey: 'customer_name', header: 'Customer', cell: ({ row }) => <span className="font-medium">{row.getValue('customer_name') as string}</span> },
      { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => <span>{row.getValue('quantity') as number}</span> },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('amount') as number)}</span> },
    ],
  },
  {
    id: 'purchase',
    title: 'Purchase Report',
    description: 'Purchase analysis by vendor and period',
    icon: Package,
    endpoint: '/v1/reports/purchase',
    columns: [
      { accessorKey: 'date', header: 'Date', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span> },
      { accessorKey: 'invoice_number', header: 'Invoice #', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('invoice_number') as string}</span> },
      { accessorKey: 'vendor_name', header: 'Vendor', cell: ({ row }) => <span className="font-medium">{row.getValue('vendor_name') as string}</span> },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('amount') as number)}</span> },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory Report',
    description: 'Stock levels, valuation, and movements',
    icon: Package,
    endpoint: '/v1/reports/inventory',
    columns: [
      { accessorKey: 'product_name', header: 'Product', cell: ({ row }) => <span className="font-medium">{row.getValue('product_name') as string}</span> },
      { accessorKey: 'sku', header: 'SKU', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('sku') as string}</span> },
      { accessorKey: 'warehouse', header: 'Warehouse', cell: ({ row }) => <span>{row.getValue('warehouse') as string}</span> },
      { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => <span className="font-medium">{row.getValue('quantity') as number}</span> },
      { accessorKey: 'value', header: 'Value', cell: ({ row }) => <span>{formatCurrency(row.getValue('value') as number)}</span> },
    ],
  },
  {
    id: 'production',
    title: 'Production Report',
    description: 'Production output and efficiency analysis',
    icon: Factory,
    endpoint: '/v1/reports/production',
    columns: [
      { accessorKey: 'order_number', header: 'Order #', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('order_number') as string}</span> },
      { accessorKey: 'product_name', header: 'Product', cell: ({ row }) => <span className="font-medium">{row.getValue('product_name') as string}</span> },
      { accessorKey: 'planned_qty', header: 'Planned', cell: ({ row }) => <span>{row.getValue('planned_qty') as number}</span> },
      { accessorKey: 'produced_qty', header: 'Produced', cell: ({ row }) => <span className="text-emerald-600">{row.getValue('produced_qty') as number}</span> },
      { accessorKey: 'rejected_qty', header: 'Rejected', cell: ({ row }) => <span className="text-destructive">{row.getValue('rejected_qty') as number}</span> },
    ],
  },
  {
    id: 'gst',
    title: 'GST Report',
    description: 'GST summary for filing (GSTR-1, GSTR-3B)',
    icon: FileSpreadsheet,
    endpoint: '/v1/reports/gst',
    columns: [
      { accessorKey: 'party_name', header: 'Party', cell: ({ row }) => <span className="font-medium">{row.getValue('party_name') as string}</span> },
      { accessorKey: 'gstin', header: 'GSTIN', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('gstin') as string}</span> },
      { accessorKey: 'invoice_number', header: 'Invoice #', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('invoice_number') as string}</span> },
      { accessorKey: 'taxable_value', header: 'Taxable', cell: ({ row }) => <span>{formatCurrency(row.getValue('taxable_value') as number)}</span> },
      { accessorKey: 'cgst', header: 'CGST', cell: ({ row }) => <span>{formatCurrency(row.getValue('cgst') as number)}</span> },
      { accessorKey: 'sgst', header: 'SGST', cell: ({ row }) => <span>{formatCurrency(row.getValue('sgst') as number)}</span> },
      { accessorKey: 'total', header: 'Total', cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('total') as number)}</span> },
    ],
  },
  {
    id: 'profit',
    title: 'Profit & Loss',
    description: 'Income, expenses, and net profit analysis',
    icon: TrendingUp,
    endpoint: '/v1/reports/profit-loss',
    columns: [
      { accessorKey: 'account_name', header: 'Account', cell: ({ row }) => <span className="font-medium">{row.getValue('account_name') as string}</span> },
      { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Badge variant="outline">{row.getValue('type') as string}</Badge> },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => <span className={cn('font-medium', (row.getValue('amount') as number) < 0 ? 'text-destructive' : 'text-emerald-600')}>{formatCurrency(row.getValue('amount') as number)}</span> },
    ],
  },
  {
    id: 'pending-orders',
    title: 'Pending Orders',
    description: 'Outstanding sales and purchase orders',
    icon: ClipboardList,
    endpoint: '/v1/reports/pending-orders',
    columns: [
      { accessorKey: 'order_number', header: 'Order #', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('order_number') as string}</span> },
      { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Badge variant={(row.getValue('type') as string) === 'sales' ? 'default' : 'outline'}>{row.getValue('type') as string}</Badge> },
      { accessorKey: 'party_name', header: 'Party', cell: ({ row }) => <span className="font-medium">{row.getValue('party_name') as string}</span> },
      { accessorKey: 'date', header: 'Date', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span> },
      { accessorKey: 'pending_qty', header: 'Pending Qty', cell: ({ row }) => <span className="text-amber-600 font-medium">{row.getValue('pending_qty') as number}</span> },
      { accessorKey: 'pending_amount', header: 'Pending Amount', cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('pending_amount') as number)}</span> },
    ],
  },
  {
    id: 'fabric-consumption',
    title: 'Fabric Consumption',
    description: 'Fabric usage and wastage analysis',
    icon: Scissors,
    endpoint: '/v1/reports/fabric-consumption',
    columns: [
      { accessorKey: 'fabric_name', header: 'Fabric', cell: ({ row }) => <span className="font-medium">{row.getValue('fabric_name') as string}</span> },
      { accessorKey: 'production_order', header: 'Order #', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('production_order') as string}</span> },
      { accessorKey: 'planned_qty', header: 'Planned', cell: ({ row }) => <span>{row.getValue('planned_qty') as number}</span> },
      { accessorKey: 'consumed_qty', header: 'Consumed', cell: ({ row }) => <span>{row.getValue('consumed_qty') as number}</span> },
      { accessorKey: 'wastage_percent', header: 'Wastage %', cell: ({ row }) => <span className={cn((row.getValue('wastage_percent') as number) > 5 ? 'text-destructive' : '')}>{(row.getValue('wastage_percent') as number).toFixed(1)}%</span> },
    ],
  },
  {
    id: 'worker',
    title: 'Worker Report',
    description: 'Worker productivity and attendance summary',
    icon: Users,
    endpoint: '/v1/reports/worker',
    columns: [
      { accessorKey: 'worker_name', header: 'Worker', cell: ({ row }) => <span className="font-medium">{row.getValue('worker_name') as string}</span> },
      { accessorKey: 'department', header: 'Department', cell: ({ row }) => <Badge variant="outline">{row.getValue('department') as string}</Badge> },
      { accessorKey: 'present_days', header: 'Present', cell: ({ row }) => <span className="text-emerald-600">{row.getValue('present_days') as number}</span> },
      { accessorKey: 'output_qty', header: 'Output', cell: ({ row }) => <span className="font-medium">{row.getValue('output_qty') as number}</span> },
      { accessorKey: 'efficiency', header: 'Efficiency', cell: ({ row }) => <span>{(row.getValue('efficiency') as number).toFixed(1)}%</span> },
    ],
  },
  {
    id: 'daily-production',
    title: 'Daily Production',
    description: 'Day-wise production output summary',
    icon: Activity,
    endpoint: '/v1/reports/daily-production',
    columns: [
      { accessorKey: 'date', header: 'Date', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span> },
      { accessorKey: 'product_name', header: 'Product', cell: ({ row }) => <span className="font-medium">{row.getValue('product_name') as string}</span> },
      { accessorKey: 'planned_qty', header: 'Planned', cell: ({ row }) => <span>{row.getValue('planned_qty') as number}</span> },
      { accessorKey: 'actual_qty', header: 'Actual', cell: ({ row }) => <span className="font-medium">{row.getValue('actual_qty') as number}</span> },
      { accessorKey: 'rejection_rate', header: 'Rejection %', cell: ({ row }) => <span className={cn((row.getValue('rejection_rate') as number) > 3 ? 'text-destructive' : '')}>{(row.getValue('rejection_rate') as number).toFixed(1)}%</span> },
    ],
  },
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<ReportConfig | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const { data: reportData, isLoading, isError } = useQuery({
    queryKey: ['report', selectedReport?.id, { dateFrom, dateTo, search }],
    queryFn: async () => {
      const { data } = await api.get<{ data: Record<string, unknown>[]; total: number }>(selectedReport!.endpoint, {
        params: {
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
          ...(search && { search }),
        },
      });
      return data;
    },
    enabled: !!selectedReport,
  });

  const filteredReports = REPORTS.filter(
    (r) => r.title.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase()),
  );

  if (selectedReport) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedReport(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-foreground">{selectedReport.title}</h2>
              <p className="text-sm text-muted-foreground">{selectedReport.description}</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input type="date" className="w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span className="text-muted-foreground">to</span>
                <Input type="date" className="w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium text-foreground">Failed to load report data</p>
                <p className="text-xs text-muted-foreground">Please try again later</p>
              </div>
            ) : (
              <DataTable
                columns={selectedReport.columns}
                data={(reportData?.data || []) as Record<string, unknown>[]}
                loading={isLoading}
                emptyMessage="No data available for the selected filters."
                pageSize={50}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Reports</h2>
        <p className="text-sm text-muted-foreground">View and generate business reports</p>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search reports..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredReports.map((report) => {
          const Icon = report.icon;
          return (
            <Card
              key={report.id}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => setSelectedReport(report)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredReports.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No reports found</p>
          <p className="text-xs text-muted-foreground">Try a different search term</p>
        </div>
      )}
    </div>
  );
}
