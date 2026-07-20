import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  UserCheck, Hash, Layers, Calendar, 
  Clock, ShieldCheck, AlertCircle, Phone
} from 'lucide-react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface PublicAttendanceDetails {
  success: boolean;
  employee_name: string;
  employee_id: string;
  department: string;
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
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Logging Attendance...</p>
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
            <CardTitle className="text-xl font-bold text-destructive">Invalid Badge Code</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-slate-500">
              We couldn't recognize this employee badge code:
            </p>
            <div className="font-mono text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded border break-all">
              {barcode}
            </div>
            <p className="text-xs text-muted-foreground">
              Please contact your administrator to verify your employee barcode registration.
            </p>
            <div className="pt-2">
              <Link to="/login">
                <Button className="w-full bg-blue-600 hover:bg-blue-700">Login to Dashboard</Button>
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
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
            <span className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white">Microtechnique</span>
          </div>
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-[0.2em] uppercase">MANUFACTURING ATTENDANCE</span>
        </div>

        {/* Core Attendance Card */}
        <Card className="shadow-xl border-t-4 border-t-blue-600 overflow-hidden bg-white dark:bg-slate-950">
          <CardHeader className="pb-3 border-b">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Operator Log</span>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{log.employee_name}</h2>
              </div>
              <Badge variant={log.status === 'PRESENT' ? 'default' : 'secondary'} className="text-xs py-1 px-3 uppercase tracking-wider font-semibold">
                {log.status === 'PRESENT' ? 'Checked In' : 'Checked Out'}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6 space-y-6">
            
            {/* Verification Status */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400">
              <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1 text-sm font-semibold leading-tight">
                {log.message}
              </div>
            </div>

            {/* Spec Grid */}
            <div className="grid grid-cols-2 gap-3">
              <DetailBox icon={<Hash className="h-4 w-4" />} label="Employee ID" value={log.employee_id} />
              <DetailBox icon={<Layers className="h-4 w-4" />} label="Department / Role" value={log.department} />
              <DetailBox icon={<Calendar className="h-4 w-4" />} label="Date Logged" value={new Date(log.date).toLocaleDateString()} />
              <DetailBox icon={<Clock className="h-4 w-4" />} label="Time Stamp" value={new Date().toLocaleTimeString()} />
            </div>

            {/* Calendar Note */}
            <p className="text-center text-xs text-muted-foreground">
              Your attendance status has been saved in the administrative calendar log.
            </p>

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
