import React, { useState, useEffect } from 'react';
import { Factory, PackageCheck, ClipboardList, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';

interface DashboardStats {
  today_production: number;
  pending_lots: number;
  completed_lots: number;
  active_employees: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/dashboard/stats');
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch dashboard stats', error);
    } finally {
      setLoading(false);
    }
  };

  const chartData = [
    { name: 'Mon', Lots: 12 },
    { name: 'Tue', Lots: 19 },
    { name: 'Wed', Lots: 15 },
    { name: 'Thu', Lots: 22 },
    { name: 'Fri', Lots: Math.max(10, stats?.today_production || 0) },
    { name: 'Sat', Lots: 0 },
    { name: 'Sun', Lots: 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Factory Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of today's manufacturing operations.</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 text-purple-600 rounded-lg">
                  <Factory className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Today's Production</p>
                  <h3 className="text-2xl font-bold">{stats?.today_production || 0} Lots</h3>
                </div>
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-500/10 text-orange-600 rounded-lg">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending Lots (WIP)</p>
                  <h3 className="text-2xl font-bold">{stats?.pending_lots || 0} Lots</h3>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/10 text-green-600 rounded-lg">
                  <PackageCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completed Lots</p>
                  <h3 className="text-2xl font-bold">{stats?.completed_lots || 0} Lots</h3>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 text-blue-600 rounded-lg">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Employees</p>
                  <h3 className="text-2xl font-bold">{stats?.active_employees || 0}</h3>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-6">Weekly Production (Lots)</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#888'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#888'}} />
                  <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#111', borderColor: '#333'}} />
                  <Bar dataKey="Lots" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
