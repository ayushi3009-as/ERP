import React, { useState, useRef, useEffect } from 'react';
import {
  Scan, CheckCircle2, XCircle, ArrowRight, User, Package,
  Hash, Ruler, Layers, UserCheck, UserX, Calendar, Clock
} from 'lucide-react';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface LotScanResult {
  success: boolean;
  scan_type: 'lot';
  message: string;
  lot_number: string;
  previous_stage: string;
  new_stage: string;
  size: string;
  quantity: number;
  design_number: string;
  design_name: string;
  product_name: string;
  product_code: string;
}

interface EmployeeScanResult {
  success: boolean;
  scan_type: 'employee';
  message: string;
  employee_name: string;
  employee_id: string;
  role: string;
  department: string;
  phone: string;
  attendance_status: string;
  attendance_date: string;
}

interface UnknownScanResult {
  success: false;
  scan_type: 'unknown';
  message: string;
}

type ScanResult = LotScanResult | EmployeeScanResult | UnknownScanResult;

export default function ScannerPage() {
  const [barcode, setBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    };
    document.addEventListener('click', focusInput);
    focusInput();
    return () => document.removeEventListener('click', focusInput);
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim() || isScanning) return;
    try {
      setIsScanning(true);
      const { data } = await api.post('/v1/production/scan', { barcode: barcode.trim() });
      setLastScan(data);
    } catch (error: any) {
      setLastScan({
        success: false,
        scan_type: 'unknown',
        message: error.response?.data?.detail || 'Scan failed. Network error or invalid barcode.',
      });
    } finally {
      setIsScanning(false);
      setBarcode('');
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const renderScanResult = () => {
    if (!lastScan) return null;

    const borderColor = lastScan.success
      ? lastScan.scan_type === 'employee' ? 'border-blue-500/30 bg-blue-500/5' : 'border-green-500/30 bg-green-500/5'
      : 'border-destructive/30 bg-destructive/5';

    return (
      <div className={`rounded-xl border p-6 animate-in fade-in slide-in-from-bottom-4 ${borderColor}`}>
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full ${
            lastScan.success
              ? lastScan.scan_type === 'employee' ? 'bg-blue-500/20 text-blue-600' : 'bg-green-500/20 text-green-600'
              : 'bg-destructive/20 text-destructive'
          }`}>
            {lastScan.success
              ? lastScan.scan_type === 'employee' ? <UserCheck className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />
              : <XCircle className="h-6 w-6" />}
          </div>

          <div className="flex-1">
            <h4 className={`text-lg font-semibold ${
              lastScan.success
                ? lastScan.scan_type === 'employee' ? 'text-blue-600' : 'text-green-600'
                : 'text-destructive'
            }`}>
              {lastScan.success
                ? lastScan.scan_type === 'employee' ? 'Employee Attendance' : 'Lot Scanned'
                : 'Scan Failed'}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">{lastScan.message}</p>

            {/* LOT DETAILS */}
            {lastScan.success && lastScan.scan_type === 'lot' && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="col-span-2 flex items-center gap-4 p-4 rounded-lg bg-background/60 border">
                  <span className="text-muted-foreground text-sm uppercase font-semibold">{(lastScan as LotScanResult).previous_stage || 'Start'}</span>
                  <ArrowRight className="h-5 w-5 text-purple-500 flex-shrink-0" />
                  <span className="text-purple-600 font-bold text-sm uppercase">{(lastScan as LotScanResult).new_stage}</span>
                </div>
                <InfoCard icon={<Hash className="h-4 w-4" />} label="Lot #" value={(lastScan as LotScanResult).lot_number} />
                <InfoCard icon={<Ruler className="h-4 w-4" />} label="Size" value={(lastScan as LotScanResult).size} />
                <InfoCard icon={<Package className="h-4 w-4" />} label="Product" value={(lastScan as LotScanResult).product_name} />
                <InfoCard icon={<Layers className="h-4 w-4" />} label="Design #" value={(lastScan as LotScanResult).design_number} />
                <InfoCard icon={<Package className="h-4 w-4" />} label="Design Name" value={(lastScan as LotScanResult).design_name} />
                <InfoCard icon={<Hash className="h-4 w-4" />} label="Quantity" value={String((lastScan as LotScanResult).quantity)} />
              </div>
            )}

            {/* EMPLOYEE ATTENDANCE DETAILS */}
            {lastScan.success && lastScan.scan_type === 'employee' && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <InfoCard icon={<User className="h-4 w-4" />} label="Employee" value={(lastScan as EmployeeScanResult).employee_name} />
                <InfoCard icon={<Hash className="h-4 w-4" />} label="Employee ID" value={(lastScan as EmployeeScanResult).employee_id} />
                <InfoCard icon={<Layers className="h-4 w-4" />} label="Role / Dept" value={(lastScan as EmployeeScanResult).department} />
                <InfoCard icon={<Calendar className="h-4 w-4" />} label="Date" value={(lastScan as EmployeeScanResult).attendance_date} />
                <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-background/60 border">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Status:</span>
                  <Badge variant={(lastScan as EmployeeScanResult).attendance_status === 'PRESENT' ? 'default' : 'secondary'}>
                    {(lastScan as EmployeeScanResult).attendance_status}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Smart Barcode Scanner</h2>
        <p className="text-muted-foreground">Scan Lot barcodes (for production) or Employee barcodes (for attendance).</p>
      </div>

      <Card className="p-8 border-2 border-dashed border-purple-500/30 bg-purple-500/5 relative overflow-hidden">
        <div className="absolute top-4 right-4 flex items-center gap-2 text-sm font-medium text-purple-600/80">
          <Scan className="h-4 w-4 animate-pulse" />
          Ready to Scan
        </div>

        <form onSubmit={handleScan} className="flex flex-col items-center justify-center py-8">
          <div className="relative mb-6">
            <div className="absolute -inset-4 rounded-full bg-purple-500/20 blur-xl animate-pulse" />
            <div className="relative h-20 w-20 rounded-full bg-purple-500/20 flex items-center justify-center border-2 border-purple-500/50">
              <Scan className="h-9 w-9 text-purple-600" />
            </div>
          </div>

          <h3 className="text-xl font-medium mb-2">Awaiting Scan...</h3>
          <div className="flex gap-4 mb-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Package className="h-3 w-3" /> Lot → Stage Advance</span>
            <span className="flex items-center gap-1"><User className="h-3 w-3" /> Employee → Attendance</span>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            disabled={isScanning}
            placeholder="Scan or type barcode here..."
            className="w-full max-w-md h-12 rounded-lg border-2 border-purple-500/30 bg-background px-4 text-center text-lg shadow-sm transition-colors focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-500/20"
            autoFocus
          />
          {barcode && (
            <button
              type="submit"
              disabled={isScanning}
              className="mt-4 px-6 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition"
            >
              {isScanning ? 'Processing...' : 'Submit'}
            </button>
          )}
        </form>
      </Card>

      {renderScanResult()}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-background/60 border">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}
