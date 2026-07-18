import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  AlertCircle,
  BarChart3,
  Factory,
  ClipboardList,
  Users,
  Activity,
  ArrowLeft,
  Calendar,
  Banknote,
  ScanLine,
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
    id: 'production',
    title: 'Production Lots',
    description: 'Overview of all production lots and their current status',
    icon: Factory,
    endpoint: '/v1/reports/production',
    columns: [
      { accessorKey: 'lot_number', header: 'Lot #', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('lot_number') as string}</span> },
      { accessorKey: 'product_name', header: 'Product', cell: ({ row }) => <span className="font-medium">{row.getValue('product_name') as string}</span> },
      { accessorKey: 'size', header: 'Size', cell: ({ row }) => <span>{row.getValue('size') as string}</span> },
      { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => <span className="font-medium">{row.getValue('quantity') as number}</span> },
      { accessorKey: 'current_process', header: 'Current Process', cell: ({ row }) => <Badge variant="outline">{row.getValue('current_process') as string}</Badge> },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={row.getValue('status') === 'completed' ? 'default' : 'secondary'}>{row.getValue('status') as string}</Badge> },
    ],
  },
  {
    id: 'employee',
    title: 'Employee Report',
    description: 'Overview of factory operators and their details',
    icon: Users,
    endpoint: '/v1/reports/employee',
    columns: [
      { accessorKey: 'employee_id', header: 'Emp ID', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('employee_id') as string}</span> },
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.getValue('name') as string}</span> },
      { accessorKey: 'department', header: 'Department', cell: ({ row }) => <Badge variant="outline">{row.getValue('department') as string}</Badge> },
      { accessorKey: 'designation', header: 'Designation', cell: ({ row }) => <span>{row.getValue('designation') as string}</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={row.getValue('status') === 'active' ? 'default' : 'destructive'}>{row.getValue('status') as string}</Badge> },
    ],
  },
  {
    id: 'attendance',
    title: 'Attendance Log',
    description: 'Detailed daily attendance records for all employees',
    icon: ClipboardList,
    endpoint: '/v1/reports/attendance',
    columns: [
      { accessorKey: 'date', header: 'Date', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('date') as string)}</span> },
      { accessorKey: 'employee_name', header: 'Employee', cell: ({ row }) => <span className="font-medium">{row.getValue('employee_name') as string}</span> },
      { accessorKey: 'employee_id', header: 'Emp ID', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('employee_id') as string}</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={row.getValue('status') === 'present' ? 'default' : 'destructive'}>{row.getValue('status') as string}</Badge> },
      { accessorKey: 'shift', header: 'Shift', cell: ({ row }) => <span>{row.getValue('shift') as string}</span> },
    ],
  },
  {
    id: 'scan-history',
    title: 'Barcode Scan History',
    description: 'Chronological log of all barcodes scanned on the floor',
    icon: ScanLine,
    endpoint: '/v1/reports/scan-history',
    columns: [
      { accessorKey: 'scanned_at', header: 'Scan Time', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('scanned_at') as string)}</span> },
      { accessorKey: 'barcode', header: 'Barcode', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('barcode') as string}</span> },
      { accessorKey: 'scan_type', header: 'Scan Type', cell: ({ row }) => <Badge variant="outline">{row.getValue('scan_type') as string}</Badge> },
      { accessorKey: 'scanned_by_name', header: 'Scanned By', cell: ({ row }) => <span>{row.getValue('scanned_by_name') as string}</span> },
      { accessorKey: 'process_recorded', header: 'Process', cell: ({ row }) => <span>{row.getValue('process_recorded') as string}</span> },
    ],
  },
  {
    id: 'payments',
    title: 'Internal Payments',
    description: 'Ledger of all piece-rate and internal wage payments',
    icon: Banknote,
    endpoint: '/v1/reports/payments',
    columns: [
      { accessorKey: 'payment_date', header: 'Date', cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('payment_date') as string)}</span> },
      { accessorKey: 'payment_id', header: 'Payment ID', cell: ({ row }) => <span className="font-mono text-xs">{row.getValue('payment_id') as string}</span> },
      { accessorKey: 'employee_name', header: 'Employee', cell: ({ row }) => <span className="font-medium">{row.getValue('employee_name') as string}</span> },
      { accessorKey: 'payment_type', header: 'Type', cell: ({ row }) => <Badge variant="secondary">{row.getValue('payment_type') as string}</Badge> },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => <span className="font-medium text-emerald-600">{formatCurrency(row.getValue('amount') as number)}</span> },
    ],
  },
];
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ReportsPage() {
  const location = useLocation();
  const [selectedReport, setSelectedReport] = useState<ReportConfig | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Auto-select report based on URL
  useEffect(() => {
    if (location.pathname.includes('/reports/production')) {
      const rep = REPORTS.find(r => r.id === 'production');
      if (rep) setSelectedReport(rep);
    } else if (location.pathname.includes('/reports/scans')) {
      const rep = REPORTS.find(r => r.id === 'scan-history');
      if (rep) setSelectedReport(rep);
    }
  }, [location.pathname]);

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
