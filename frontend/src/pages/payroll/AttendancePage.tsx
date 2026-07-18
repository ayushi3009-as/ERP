import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, CheckCircle2, XCircle, Clock, Users, ScanBarcode, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, DataTable, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types';

interface AttendanceRow {
  id: number;
  employee_id: number;
  date: string;
  status: string;
  scan_type: string;
  created_at: string;
}

interface Employee {
  id: number;
  full_name: string;
  role: string;
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'scanner' | 'manual'>('scanner');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Scanner state
  const [scanValue, setScanValue] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: employeesData } = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Employee>>('/v1/employees', { params: { limit: 200 } });
      return data.items;
    },
  });

  const { data: attendanceData, isLoading } = useQuery({
    queryKey: ['attendance', selectedDate],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<AttendanceRow>>('/v1/attendance', {
        params: { target_date: selectedDate, limit: 100 },
      });
      return data;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (barcode: string) => {
      const { data } = await api.post('/v1/attendance/scan', { barcode });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setScanStatus('success');
      setScanMessage(data.message);
      setScanValue('');
      setTimeout(() => setScanStatus('idle'), 3000);
    },
    onError: (error: any) => {
      setScanStatus('error');
      setScanMessage(error.response?.data?.detail || 'Scan failed');
      setScanValue('');
      setTimeout(() => setScanStatus('idle'), 3000);
    },
  });

  // Ensure scanner always has focus in scanner view
  useEffect(() => {
    if (view === 'scanner' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [view, scanStatus]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scanValue.trim()) {
      scanMutation.mutate(scanValue.trim());
    }
  };

  const columns: ColumnDef<AttendanceRow, unknown>[] = [
    {
      accessorKey: 'employee_id',
      header: 'Employee Name',
      cell: ({ row }) => {
        const emp = employeesData?.find(e => e.id === row.getValue('employee_id'));
        return <span className="font-medium">{emp ? emp.full_name : `ID: ${row.getValue('employee_id')}`}</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as string;
        return <Badge variant={s === 'PRESENT' ? 'success' : 'secondary'}>{s}</Badge>;
      },
    },
    {
      accessorKey: 'scan_type',
      header: 'Method',
      cell: ({ row }) => <span className="text-xs">{row.getValue('scan_type')}</span>,
    },
    {
      accessorKey: 'created_at',
      header: 'Timestamp',
      cell: ({ row }) => <span className="text-xs">{formatDate(row.getValue('created_at'))}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Attendance</h2>
          <p className="text-sm text-muted-foreground">Factory check-in and attendance records</p>
        </div>
        <div className="flex gap-2 bg-muted/50 p-1 rounded-lg">
          <Button 
            variant={view === 'scanner' ? 'default' : 'ghost'} 
            size="sm" 
            onClick={() => setView('scanner')}
            className="w-32"
          >
            <ScanBarcode className="mr-2 h-4 w-4" /> Scanner
          </Button>
          <Button 
            variant={view === 'manual' ? 'default' : 'ghost'} 
            size="sm" 
            onClick={() => setView('manual')}
            className="w-32"
          >
            <Calendar className="mr-2 h-4 w-4" /> Grid View
          </Button>
        </div>
      </div>

      {view === 'scanner' ? (
        <Card className="border-2 border-dashed flex flex-col items-center justify-center py-16 px-4 text-center min-h-[400px]">
          <div className={`p-4 rounded-full mb-6 transition-colors duration-500 ${
            scanStatus === 'success' ? 'bg-emerald-100 text-emerald-600' :
            scanStatus === 'error' ? 'bg-red-100 text-red-600' :
            'bg-purple-100 text-purple-600'
          }`}>
            <ScanBarcode className="w-16 h-16" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Ready to Scan</h2>
          <p className="text-muted-foreground mb-8">Scan Employee ID Card barcode to check in for {formatDate(selectedDate)}</p>
          
          {scanMessage && (
            <div className={`px-4 py-2 rounded-md mb-6 font-medium animate-in fade-in slide-in-from-bottom-4 ${
              scanStatus === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}>
              {scanMessage}
            </div>
          )}

          <form onSubmit={handleScanSubmit} className="relative w-full max-w-sm">
            <Input
              ref={inputRef}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              placeholder="Scan Barcode Here..."
              className="pl-10 text-center font-mono text-lg bg-muted/50 focus-visible:ring-purple-500"
              autoFocus
              onBlur={() => {
                // Try to keep focus
                if (view === 'scanner') {
                  setTimeout(() => inputRef.current?.focus(), 100);
                }
              }}
            />
            <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          </form>
          <p className="text-xs text-muted-foreground mt-4 italic">Input is hidden-focused. Use a physical barcode scanner.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center gap-4">
                <Input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-40"
                />
                <span className="text-sm font-medium">Daily Attendance Grid</span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <DataTable
                columns={columns}
                data={attendanceData?.items || []}
                loading={isLoading}
                emptyMessage="No attendance records found for this date."
                pageSize={50}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
