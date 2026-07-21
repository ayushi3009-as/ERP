import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  UserCheck, Hash, Layers, Calendar, 
  Clock, ShieldCheck, AlertCircle, Phone, Boxes
} from 'lucide-react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface PublicAttendanceDetails {
  success: boolean;
  employee_name: string;
  employee_id: string;
  operation?: string;
  department?: string;
  rate?: number;
  total_pieces?: number;
  completed_pieces?: number;
  pending_pieces?: number;
  damaged_pieces?: number;
  working_status?: string;
  pieces_given?: number;
  pieces_returned?: number;
  status: string;
  date: string;
  message: string;
}

export default function PublicAttendanceDetailsPage() {
  const { barcode } = useParams<{ barcode: string }>();

  const { data: log, isLoading, error } = useQuery<PublicAttendanceDetails>({
    queryKey: ['public-attendance', barcode],
    queryFn: async () => {
      const { data } = await api.get<PublicAttendanceDetails>(`/v1/public/attendance/${barcode}`);
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
          <p className="text-sm font-medium text-slate-500">Loading Work Status...</p>
        </div>
      </div>
    );
  }

  if (error || !log) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-destructive/20">
          <CardHeader className="text-center pb-2">
            <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold text-destructive">Invalid Employee Barcode</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-slate-500">
              We couldn't recognize this employee tracking code:
            </p>
            <div className="font-mono text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded border break-all">
              {barcode}
            </div>
            <div className="pt-2">
              <Link to="/login">
                <Button className="w-full bg-purple-600 hover:bg-purple-700">Login to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const opName = log.operation || log.department || 'Overlock';
  const totalPcs = log.total_pieces ?? log.pieces_given ?? 0;
  const completedPcs = log.completed_pieces ?? log.pieces_returned ?? 0;
  const pendingPcs = log.pending_pieces ?? Math.max(0, totalPcs - completedPcs);
  const damagedPcs = log.damaged_pieces ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 px-4 py-8 md:py-16">
      <div className="w-full max-w-lg mx-auto space-y-6">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-1.5 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
            <span className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white">Microtechnique ERP</span>
          </div>
          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 tracking-[0.2em] uppercase">Employee Production Status Dashboard</span>
        </div>

        {/* Core Live Tracking Card */}
        <Card className="shadow-xl border-t-4 border-t-purple-600 overflow-hidden bg-white dark:bg-slate-950">
          <CardHeader className="pb-3 border-b">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Live Work Progress</span>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{log.employee_name}</h2>
              </div>
              <Badge variant="secondary" className="text-xs py-1 px-3 uppercase tracking-wider font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                {log.working_status || 'Active in Production'}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6 space-y-6">
            
            {/* Status Info Banner */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400">
              <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1 text-sm font-semibold leading-tight">
                {log.message}
              </div>
            </div>

            {/* Spec Grid */}
            <div className="grid grid-cols-2 gap-3">
              <DetailBox icon={<Hash className="h-4 w-4" />} label="Employee ID" value={log.employee_id} />
              <DetailBox icon={<Layers className="h-4 w-4" />} label="Assigned Operation" value={opName} />
              <DetailBox icon={<Boxes className="h-4 w-4" />} label="Total Pieces Assigned" value={String(totalPcs)} />
              <DetailBox icon={<Boxes className="h-4 w-4" />} label="Completed Pieces" value={String(completedPcs)} highlight="emerald" />
              <DetailBox icon={<Boxes className="h-4 w-4" />} label="Pending Pieces" value={String(pendingPcs)} highlight="amber" />
              <DetailBox icon={<Boxes className="h-4 w-4" />} label="Damaged / Rejected" value={String(damagedPcs)} highlight="red" />
              <DetailBox icon={<Calendar className="h-4 w-4" />} label="Date" value={new Date(log.date).toLocaleDateString()} />
              <DetailBox icon={<Clock className="h-4 w-4" />} label="Last Updated" value={new Date().toLocaleTimeString()} />
            </div>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Scanned scannable Employee Badge barcode. Live status updated automatically across piece tracking flow.
            </p>

          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-[10px] text-muted-foreground">
          Microtechnique Textile ERP SaaS Platform. All rights reserved.
        </p>

      </div>
    </div>
  );
}

function DetailBox({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: string }) {
  let valColor = "text-slate-800 dark:text-slate-100";
  if (highlight === 'emerald') valColor = "text-emerald-600 dark:text-emerald-400";
  if (highlight === 'amber') valColor = "text-amber-600 dark:text-amber-400";
  if (highlight === 'red') valColor = "text-red-600 dark:text-red-400";

  return (
    <div className="p-3 bg-slate-100/50 dark:bg-slate-900/50 border rounded-lg space-y-1">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-base font-bold ${valColor} truncate`}>
        {value}
      </div>
    </div>
  );
}
