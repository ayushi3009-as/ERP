import React, { useState, useRef, useEffect } from 'react';
import {
  Scan, CheckCircle2, XCircle, ArrowRight, User, Package,
  Hash, Ruler, Layers, UserCheck, Calendar, Clock, Camera, RefreshCw
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

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
  const [useCamera, setUseCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep focus on the text input so hardware/keyboard inputs work when camera is disabled
  useEffect(() => {
    if (useCamera) return;
    const focusInput = () => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    };
    document.addEventListener('click', focusInput);
    focusInput();
    return () => document.removeEventListener('click', focusInput);
  }, [useCamera]);

  // Handle camera scanner initialization
  useEffect(() => {
    if (!useCamera) return;

    let html5Qrcode: any = null;

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        html5Qrcode = new Html5Qrcode('reader');

        const config = {
          fps: 10,
          qrbox: (width: number, height: number) => {
            // Wider scan box optimized for linear 1D barcodes on mobile devices
            const widthOffset = width > 400 ? 300 : 250;
            return { width: widthOffset, height: 100 };
          },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        };

        await html5Qrcode.start(
          { facingMode: 'environment' }, // Uses rear camera on phones
          config,
          async (decodedText: string) => {
            if (html5Qrcode) {
              await html5Qrcode.stop();
            }
            setUseCamera(false);
            await triggerScanRequest(decodedText);
          },
          (errorMessage: string) => {
            // quiet fail, video scan iteration
          }
        );
      } catch (err) {
        console.error("Scanner failed to start", err);
      }
    };

    startScanner();

    return () => {
      if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().catch((err: any) => console.error("Failed to stop scanner", err));
      }
    };
  }, [useCamera]);

  const triggerScanRequest = async (scannedBarcode: string) => {
    if (!scannedBarcode.trim() || isScanning) return;
    try {
      setIsScanning(true);
      const { data } = await api.post('/v1/production/scan', { barcode: scannedBarcode.trim() });
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
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerScanRequest(barcode);
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
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2 flex items-center justify-between p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Previous Process</span>
                    <span className="font-semibold text-sm uppercase">{(lastScan as LotScanResult).previous_stage || 'Planning'}</span>
                  </div>
                  <ArrowRight className="h-5 w-5 text-purple-500 flex-shrink-0 mx-2" />
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] uppercase tracking-wider text-purple-500">New Process</span>
                    <span className="font-bold text-sm uppercase text-purple-600">{(lastScan as LotScanResult).new_stage}</span>
                  </div>
                </div>
                <InfoCard icon={<Hash className="h-4 w-4" />} label="Lot Number" value={(lastScan as LotScanResult).lot_number} />
                <InfoCard icon={<Ruler className="h-4 w-4" />} label="Size" value={(lastScan as LotScanResult).size} />
                <InfoCard icon={<Package className="h-4 w-4" />} label="Product Name" value={(lastScan as LotScanResult).product_name} />
                <InfoCard icon={<Layers className="h-4 w-4" />} label="Design Number" value={(lastScan as LotScanResult).design_number} />
                <InfoCard icon={<Package className="h-4 w-4" />} label="Design Name" value={(lastScan as LotScanResult).design_name} />
                <InfoCard icon={<Hash className="h-4 w-4" />} label="Quantity" value={`${(lastScan as LotScanResult).quantity} PCS`} />
              </div>
            )}

            {/* EMPLOYEE ATTENDANCE DETAILS */}
            {lastScan.success && lastScan.scan_type === 'employee' && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <InfoCard icon={<User className="h-4 w-4" />} label="Employee Name" value={(lastScan as EmployeeScanResult).employee_name} />
                <InfoCard icon={<Hash className="h-4 w-4" />} label="Employee ID" value={(lastScan as EmployeeScanResult).employee_id} />
                <InfoCard icon={<Layers className="h-4 w-4" />} label="Role / Dept" value={(lastScan as EmployeeScanResult).department} />
                <InfoCard icon={<Calendar className="h-4 w-4" />} label="Date" value={(lastScan as EmployeeScanResult).attendance_date} />
                <div className="md:col-span-2 flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold">Attendance Logged:</span>
                  </div>
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
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Smart Barcode Scanner</h2>
        <p className="text-muted-foreground">Scan Lot barcodes or Employee barcodes instantly.</p>
      </div>

      <div className="flex justify-center gap-4">
        <Button
          variant={useCamera ? 'outline' : 'purple'}
          onClick={() => setUseCamera(false)}
          className="flex items-center gap-2"
        >
          <Scan className="h-4 w-4" /> Hardware / Manual Input
        </Button>
        <Button
          variant={useCamera ? 'purple' : 'outline'}
          onClick={() => setUseCamera(true)}
          className="flex items-center gap-2"
        >
          <Camera className="h-4 w-4" /> Phone Camera Scanner
        </Button>
      </div>

      {useCamera ? (
        <Card className="p-4 border-2 border-dashed border-purple-500/35 bg-purple-500/5 relative overflow-hidden">
          <div className="text-center space-y-2 mb-4">
            <h3 className="font-semibold text-lg">Align Barcode within Camera View</h3>
            <p className="text-xs text-muted-foreground">Grant camera access when prompted.</p>
          </div>
          <div id="reader" className="w-full max-w-md mx-auto overflow-hidden rounded-lg border bg-black shadow-inner" />
        </Card>
      ) : (
        <Card className="p-8 border-2 border-dashed border-purple-500/30 bg-purple-500/5 relative overflow-hidden">
          <div className="absolute top-4 right-4 flex items-center gap-2 text-sm font-medium text-purple-600/80">
            <Scan className="h-4 w-4 animate-pulse" />
            Ready to Scan
          </div>

          <form onSubmit={handleManualSubmit} className="flex flex-col items-center justify-center py-6">
            <div className="relative mb-6">
              <div className="absolute -inset-4 rounded-full bg-purple-500/20 blur-xl animate-pulse" />
              <div className="relative h-20 w-20 rounded-full bg-purple-500/20 flex items-center justify-center border-2 border-purple-500/50">
                <Scan className="h-9 w-9 text-purple-600" />
              </div>
            </div>

            <h3 className="text-xl font-medium mb-2">Awaiting Input...</h3>
            <div className="flex gap-4 mb-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" /> Lot Barcode</span>
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> Employee Barcode</span>
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
              <Button
                type="submit"
                disabled={isScanning}
                className="mt-4 px-8 py-2.5 bg-purple-600 text-white font-semibold hover:bg-purple-700 transition"
              >
                {isScanning ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                {isScanning ? 'Processing...' : 'Submit'}
              </Button>
            )}
          </form>
        </Card>
      )}

      {renderScanResult()}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-lg bg-background/60 border shadow-sm">
      <span className="text-purple-600">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wide font-semibold">{label}</div>
        <div className="text-sm font-bold truncate">{value}</div>
      </div>
    </div>
  );
}
