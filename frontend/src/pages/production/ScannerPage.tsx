import React, { useState, useRef, useEffect } from 'react';
import { Scan, CheckCircle2, XCircle, ArrowRight, UserCircle } from 'lucide-react';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';

interface ScanResult {
  success: boolean;
  message: string;
  lot_number?: string;
  previous_stage?: string;
  new_stage?: string;
}

export default function ScannerPage() {
  const [barcode, setBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep focus on the hidden input so hardware scanners always work
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
      const { data } = await api.post('/production/scan', {
        barcode: barcode.trim()
      });
      setLastScan(data);
    } catch (error: any) {
      setLastScan({
        success: false,
        message: error.response?.data?.detail || "Scan failed. Network error or invalid barcode."
      });
    } finally {
      setIsScanning(false);
      setBarcode('');
      // ensure focus remains
      if (inputRef.current) inputRef.current.focus();
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Factory Barcode Scanner</h2>
        <p className="text-muted-foreground">Scan Lot barcodes to advance production stages instantly.</p>
      </div>

      <Card className="p-8 border-2 border-dashed border-purple-500/30 bg-purple-500/5 relative overflow-hidden">
        <div className="absolute top-4 right-4 flex items-center gap-2 text-sm font-medium text-purple-600/80">
          <Scan className="h-4 w-4 animate-pulse" />
          Ready to Scan
        </div>

        <form onSubmit={handleScan} className="flex flex-col items-center justify-center py-12">
          <div className="relative mb-8">
            <div className="absolute -inset-4 rounded-full bg-purple-500/20 blur-xl animate-pulse" />
            <div className="relative h-24 w-24 rounded-full bg-purple-500/20 flex items-center justify-center border-2 border-purple-500/50">
              <Scan className="h-10 w-10 text-purple-600" />
            </div>
          </div>
          
          <h3 className="text-xl font-medium mb-4">Awaiting Input...</h3>
          <p className="text-sm text-muted-foreground mb-8 text-center max-w-md">
            Use your hardware barcode scanner. Focus is locked to this page. You can also manually type and press Enter.
          </p>

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
        </form>
      </Card>

      {lastScan && (
        <div className={`rounded-xl border p-6 animate-in fade-in slide-in-from-bottom-4 ${
          lastScan.success 
            ? 'border-green-500/30 bg-green-500/5' 
            : 'border-destructive/30 bg-destructive/5'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-full ${
              lastScan.success ? 'bg-green-500/20 text-green-600' : 'bg-destructive/20 text-destructive'
            }`}>
              {lastScan.success ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
            </div>
            
            <div className="flex-1 pt-1">
              <h4 className={`text-lg font-semibold ${
                lastScan.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'
              }`}>
                {lastScan.success ? 'Scan Successful' : 'Scan Failed'}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {lastScan.message}
              </p>

              {lastScan.success && lastScan.previous_stage && lastScan.new_stage && (
                <div className="mt-4 flex items-center gap-3 p-4 rounded-lg bg-background/50 border border-border/50">
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lot Number</div>
                    <div className="font-mono font-medium">{lastScan.lot_number}</div>
                  </div>
                  <div className="flex-1 flex justify-center items-center gap-4 text-sm font-semibold">
                    <span className="text-muted-foreground uppercase">{lastScan.previous_stage}</span>
                    <ArrowRight className="h-4 w-4 text-purple-500" />
                    <span className="text-purple-600 dark:text-purple-400 uppercase">{lastScan.new_stage}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
