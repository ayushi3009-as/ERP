import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Package, Hash, Ruler, Layers, Calendar, 
  Activity, ArrowRight, ShieldCheck, AlertCircle, Building2
} from 'lucide-react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface PublicLotDetails {
  success: boolean;
  lot_number: string;
  barcode: string;
  size: string;
  quantity: number;
  current_process: string;
  design_number: string;
  design_name: string;
  product_name: string;
  product_code: string;
  fabric_name: string;
  category_name: string;
  created_at: string;
}

export default function PublicLotDetailsPage() {
  const { barcode } = useParams<{ barcode: string }>();

  const { data: lot, isLoading, error } = useQuery<PublicLotDetails>({
    queryKey: ['public-lot', barcode],
    queryFn: async () => {
      const { data } = await api.get<PublicLotDetails>(`/v1/public/lot/${barcode}`);
      return data;
    },
    enabled: !!barcode,
    retry: 1
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Retrieving Lot Information...</p>
        </div>
      </div>
    );
  }

  if (error || !lot) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-destructive/20">
          <CardHeader className="text-center pb-2">
            <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold text-destructive">Invalid Barcode</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-slate-500">
              We couldn't find any active production lot matching the scanned barcode:
            </p>
            <div className="font-mono text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded border break-all">
              {barcode}
            </div>
            <p className="text-xs text-muted-foreground">
              Please make sure the barcode was generated from our system and scan again.
            </p>
            <div className="pt-2">
              <Link to="/login">
                <Button className="w-full bg-purple-600 hover:bg-purple-700">Go to Login</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 px-4 py-8 md:py-16">
      <div className="w-full max-w-lg mx-auto space-y-6">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-1.5 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
            <span className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white">Microtechnique</span>
          </div>
          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 tracking-[0.2em] uppercase">MANUFACTURING PLATFORM</span>
        </div>

        {/* Core Lot Card */}
        <Card className="shadow-xl border-t-4 border-t-purple-600 overflow-hidden bg-white dark:bg-slate-950">
          <CardHeader className="pb-3 border-b">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Production Lot Details</span>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Lot #{lot.lot_number}</h2>
              </div>
              <Badge variant="purple" className="text-xs py-1 px-3 uppercase tracking-wider font-semibold">
                {lot.current_process}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6 space-y-6">
            
            {/* Visual Scan Status Badge */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1 text-sm font-semibold leading-tight">
                Authentic Production Lot Verified
              </div>
            </div>

            {/* Spec Grid */}
            <div className="grid grid-cols-2 gap-3">
              <DetailBox icon={<Package className="h-4 w-4" />} label="Product Name" value={lot.product_name} />
              <DetailBox icon={<Hash className="h-4 w-4" />} label="Product Code" value={lot.product_code} />
              <DetailBox icon={<Layers className="h-4 w-4" />} label="Design Name" value={lot.design_name} />
              <DetailBox icon={<Hash className="h-4 w-4" />} label="Design #" value={lot.design_number} />
              <DetailBox icon={<Ruler className="h-4 w-4" />} label="Size" value={lot.size} />
              <DetailBox icon={<Hash className="h-4 w-4" />} label="Quantity" value={`${lot.quantity} PCS`} />
              <DetailBox icon={<Building2 className="h-4 w-4" />} label="Fabric" value={lot.fabric_name} />
              <DetailBox icon={<Layers className="h-4 w-4" />} label="Category" value={lot.category_name} />
            </div>

            {/* Stage Timeline Banner */}
            <div className="border rounded-xl p-4 bg-slate-50 dark:bg-slate-900/50 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Current Tracking Stage</span>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {lot.current_process.toUpperCase()}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(lot.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Barcode Display */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <img
                className="h-12 w-64 object-contain mb-1.5"
                src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(lot.barcode)}&scale=2&rotate=N&includeText=false`}
                alt={lot.barcode}
              />
              <span className="font-mono text-[9px] text-muted-foreground">{lot.barcode}</span>
            </div>

          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-[10px] text-muted-foreground">
          Microtechnique ERP SaaS Platform. All rights reserved.
        </p>

      </div>
    </div>
  );
}

function DetailBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 bg-slate-100/50 dark:bg-slate-900/50 border rounded-lg space-y-1">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
        {value}
      </div>
    </div>
  );
}
