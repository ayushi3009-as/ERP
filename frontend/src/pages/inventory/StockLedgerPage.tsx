import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  AlertCircle,
  Download,
  Calendar,
  Filter,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Settings,
} from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  Badge,
  DataTable,
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

interface LedgerRow {
  id: string;
  date: string;
  product_id: string;
  product_name: string;
  sku: string;
  warehouse_id: string;
  warehouse_name: string;
  movement_type: 'in' | 'out' | 'transfer' | 'adjustment';
  quantity: number;
  opening_qty: number;
  closing_qty: number;
  rate: number;
  value: number;
  reference_type?: string;
  reference_id?: string;
  reference_number?: string;
}

const MOVEMENT_TYPES = [
  { value: 'all', label: 'All Types', icon: Filter },
  { value: 'in', label: 'Stock In', icon: ArrowDownToLine },
  { value: 'out', label: 'Stock Out', icon: ArrowUpFromLine },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
  { value: 'adjustment', label: 'Adjustment', icon: Settings },
];

const movementBadge = (type: string) => {
  switch (type) {
    case 'in': return { variant: 'success' as const, label: 'In' };
    case 'out': return { variant: 'destructive' as const, label: 'Out' };
    case 'transfer': return { variant: 'default' as const, label: 'Transfer' };
    case 'adjustment': return { variant: 'warning' as const, label: 'Adjust' };
    default: return { variant: 'secondary' as const, label: type };
  }
};

export default function StockLedgerPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [movementFilter, setMovementFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stock-ledger', { search, warehouseFilter, movementFilter, dateFrom, dateTo, page }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<LedgerRow>>('/v1/inventory/ledger', {
        params: {
          search,
          page,
          per_page: 50,
          ...(warehouseFilter !== 'all' && { warehouse_id: warehouseFilter }),
          ...(movementFilter !== 'all' && { movement_type: movementFilter }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
        },
      });
      return data;
    },
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; name: string }>>('/v1/warehouses', {
        params: { per_page: 200 },
      });
      return data.data;
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: string; name: string; sku: string }>>('/v1/products', {
        params: { per_page: 500 },
      });
      return data.data;
    },
  });

  function handleExport() {
    const params = new URLSearchParams({
      ...(warehouseFilter !== 'all' && { warehouse_id: warehouseFilter }),
      ...(movementFilter !== 'all' && { movement_type: movementFilter }),
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
      format: 'csv',
    });
    window.open(`/api/v1/inventory/ledger/export?${params}`, '_blank');
  }

  const columns: ColumnDef<LedgerRow, unknown>[] = [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-xs">{formatDate(row.getValue('date') as string, 'dd MMM yyyy')}</span>
      ),
    },
    {
      accessorKey: 'product_name',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground text-sm">{row.original.product_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.original.sku}</p>
        </div>
      ),
    },
    {
      accessorKey: 'warehouse_name',
      header: 'Warehouse',
      cell: ({ row }) => <span className="text-sm">{row.getValue('warehouse_name')}</span>,
    },
    {
      accessorKey: 'movement_type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('movement_type') as string;
        const badge = movementBadge(type);
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      accessorKey: 'quantity',
      header: 'Quantity',
      cell: ({ row }) => {
        const qty = row.getValue('quantity') as number;
        const type = row.original.movement_type;
        return (
          <span className={cn(
            'font-medium',
            type === 'in' && 'text-emerald-600',
            type === 'out' && 'text-red-600',
          )}>
            {type === 'out' ? '-' : type === 'in' ? '+' : ''}{formatNumber(Math.abs(qty))}
          </span>
        );
      },
    },
    {
      accessorKey: 'rate',
      header: 'Rate',
      cell: ({ row }) => <span>{formatCurrency(row.getValue('rate') as number)}</span>,
    },
    {
      accessorKey: 'value',
      header: 'Value',
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('value') as number)}</span>,
    },
    {
      accessorKey: 'closing_qty',
      header: 'Balance',
      cell: ({ row }) => (
        <span className="font-medium">{formatNumber(row.getValue('closing_qty') as number)}</span>
      ),
    },
    {
      accessorKey: 'reference_number',
      header: 'Reference',
      cell: ({ row }) => {
        const ref = row.getValue('reference_number') as string;
        const refType = row.original.reference_type;
        return ref ? (
          <div>
            <span className="font-mono text-xs">{ref}</span>
            {refType && <p className="text-[10px] text-muted-foreground">{refType}</p>}
          </div>
        ) : <span>—</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Stock Ledger</h2>
          <p className="text-sm text-muted-foreground">Complete inventory movement history</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={warehouseFilter} onValueChange={(v) => { setWarehouseFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {(warehousesData || []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={movementFilter} onValueChange={(v) => { setMovementFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  className="w-[150px]"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  placeholder="From date"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="date"
                  className="w-[150px]"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  placeholder="To date"
                />
              </div>
              {(dateFrom || dateTo || warehouseFilter !== 'all' || movementFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setWarehouseFilter('all');
                    setMovementFilter('all');
                    setPage(1);
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load ledger entries</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data?.items || []}
              loading={isLoading}
              emptyMessage="No ledger entries found for the selected filters."
              pageSize={50}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
