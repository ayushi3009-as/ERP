import React, { useState, useEffect } from 'react';
import { Factory, PackageCheck, ClipboardList, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ShieldAlert, UploadCloud, Loader2, QrCode } from 'lucide-react';

interface DashboardStats {
  today_production: number;
  pending_lots: number;
  completed_lots: number;
  active_employees: number;
}

interface CompanyInfo {
  id: number;
  name: string;
  subscription_plan: string;
  subscription_expiry: string | null;
  tenant_status: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [renewSuccess, setRenewSuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, companyRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/v1/company/')
      ]);
      setStats(statsRes.data);
      setCompany(companyRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRenew = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fileData = new FormData();
      fileData.append('file', file);
      
      const uploadRes = await api.post('/v1/tenant/upload-payment', fileData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      await api.post('/v1/company/me/renew', {
        payment_screenshot_url: uploadRes.data.url
      });
      
      setRenewSuccess(true);
      fetchData(); // Refresh company status
      setTimeout(() => {
        setShowRenewModal(false);
        setRenewSuccess(false);
        setFile(null);
      }, 3000);
    } catch (error) {
      console.error('Failed to renew subscription', error);
      alert('Failed to submit renewal request. Please try again.');
    } finally {
      setUploading(false);
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
          {/* Subscription Panel */}
          {company && (
            <Card className="p-6 mb-6 bg-purple-500/5 border-purple-500/20">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-500/20 text-purple-600 rounded-xl">
                    <ShieldAlert className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      {company.subscription_plan.toUpperCase()} PLAN
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Status: <span className="font-semibold">{company.tenant_status.toUpperCase()}</span> 
                      {company.subscription_expiry && ` • Expires: ${new Date(company.subscription_expiry).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => setShowRenewModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Update Plan
                </Button>
              </div>
            </Card>
          )}

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

          {/* Renew Modal */}
          {showRenewModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
              <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#13111C] p-6 shadow-2xl border border-gray-200 dark:border-white/10">
                <h3 className="text-2xl font-bold mb-2">Update Your Plan</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                  Scan the QR code below to make a payment, then upload your payment screenshot to renew.
                </p>

                {renewSuccess ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h4 className="text-xl font-semibold text-green-600">Request Submitted!</h4>
                    <p className="text-gray-500 mt-2 text-center">Your renewal is pending Super Admin approval.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center p-6 bg-gray-50 dark:bg-black/20 rounded-xl mb-6">
                      <img 
                        src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=9712922340@barodampay" 
                        alt="UPI QR Code" 
                        className="w-40 h-40 object-contain bg-white p-2 rounded-lg shadow-sm mb-4"
                      />
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-white/5 px-4 py-2 rounded-full border border-gray-200 dark:border-white/10">
                        <QrCode className="w-4 h-4" />
                        9712922340@barodampay
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer bg-gray-50 dark:bg-white/5 border-gray-300 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-8 h-8 mb-2 text-gray-400" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              <span className="font-semibold text-purple-600">Click to upload</span> screenshot
                            </p>
                          </div>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                      
                      {file && (
                        <div className="text-sm text-green-600 bg-green-50 dark:bg-green-500/10 p-3 rounded-lg flex items-center justify-between">
                          <span>{file.name}</span>
                          <button onClick={() => setFile(null)} className="text-red-500 font-medium">Remove</button>
                        </div>
                      )}

                      <div className="flex gap-3 pt-4">
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => {
                            setShowRenewModal(false);
                            setFile(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white" 
                          disabled={!file || uploading}
                          onClick={handleRenew}
                        >
                          {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Submit Request
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
