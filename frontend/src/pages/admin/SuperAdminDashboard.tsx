import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ShieldAlert, CheckCircle, Clock, Building, Calendar, Zap, Loader2, Save, Users, CreditCard, Ban } from 'lucide-react';

interface PricingPlan {
  id: string;
  name: string;
  price: string;
  desc: string;
  features: string[];
  highlighted: boolean;
}

interface Company {
  id: number;
  name: string;
  is_approved: boolean;
  subscription_plan: string;
  subscription_expiry: string | null;
  tenant_status: string;
  payment_screenshot_url: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Record<number, string>>({});

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ['saas-companies'],
    queryFn: async () => {
      const { data } = await api.get('/v1/company/all');
      return data;
    },
  });

  const { data: pricingPlans, isLoading: pricingLoading } = useQuery<PricingPlan[]>({
    queryKey: ['pricing-plans'],
    queryFn: async () => {
      const { data } = await api.get('/v1/settings/pricing');
      return data;
    },
  });

  const [editablePlans, setEditablePlans] = useState<PricingPlan[]>([]);
  
  // Set editable plans when fetched
  if (pricingPlans && editablePlans.length === 0) {
    setEditablePlans(pricingPlans);
  }


  const updateCompanyMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const { data } = await api.put(`/v1/company/${id}/saas`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saas-companies'] });
    },
  });

  const updatePricingMutation = useMutation({
    mutationFn: async (payload: PricingPlan[]) => {
      const { data } = await api.post('/v1/settings/pricing', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-plans'] });
      alert("Pricing plans updated successfully!");
    },
  });

  if (companiesLoading || pricingLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-[#0a0118]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-[#0a0118]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Super Admin Portal
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Manage SaaS tenants, approvals, and subscriptions
            </p>
          </div>
          <div className="rounded-full bg-purple-100 p-3 dark:bg-purple-900/30">
            <ShieldAlert className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
        </div>

        {companies && (
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <Card className="border-gray-200 dark:border-white/[.08] dark:bg-white/[.02]">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg dark:bg-blue-900/30 dark:text-blue-400">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tenants / Admins</p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{companies.length}</h3>
                </div>
              </CardContent>
            </Card>
            <Card className="border-gray-200 dark:border-white/[.08] dark:bg-white/[.02]">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-green-100 text-green-600 rounded-lg dark:bg-green-900/30 dark:text-green-400">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Subscriptions</p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{companies.filter(c => c.tenant_status === 'active' || c.is_approved).length}</h3>
                </div>
              </CardContent>
            </Card>
            <Card className="border-gray-200 dark:border-white/[.08] dark:bg-white/[.02]">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-lg dark:bg-amber-900/30 dark:text-amber-400">
                  <Ban className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pending / Suspended</p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{companies.filter(c => c.tenant_status !== 'active' && !c.is_approved).length}</h3>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {companies?.map((company) => (
            <Card key={company.id} className="border-gray-200 dark:border-white/[.08] dark:bg-white/[.02]">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <CardTitle className="text-lg text-gray-900 dark:text-white">{company.name}</CardTitle>
                  </div>
                  {company.is_approved ? (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
                      <CheckCircle className="h-3 w-3" /> Approved
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                      <Clock className="h-3 w-3" /> Pending
                    </span>
                  )}
                </div>
                <CardDescription className="dark:text-gray-400">
                  Joined {new Date(company.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-gray-100 p-3 dark:bg-white/[.04]">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Zap className="h-4 w-4" />
                    Plan:
                  </div>
                  <span className="text-sm font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                    {company.subscription_plan}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-gray-100 p-3 dark:bg-white/[.04]">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Calendar className="h-4 w-4" />
                    Status:
                  </div>
                  <span className={`text-sm font-medium ${company.tenant_status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {company.tenant_status.toUpperCase()}
                  </span>
                </div>

                {company.payment_screenshot_url && (
                  <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20">
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-purple-900 dark:text-purple-300">Payment Screenshot</span>
                      <a href={`http://127.0.0.1:8000${company.payment_screenshot_url}`} target="_blank" rel="noreferrer" className="block relative overflow-hidden rounded-md border border-purple-200 dark:border-purple-500/30 group">
                        <img src={`http://127.0.0.1:8000${company.payment_screenshot_url}`} alt="Payment" className="h-32 w-full object-cover transition-transform group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white text-xs font-medium px-2 py-1 bg-black/50 rounded">Click to enlarge</span>
                        </div>
                      </a>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button
                    variant={company.is_approved ? "outline" : "default"}
                    className="w-full"
                    onClick={() => updateCompanyMutation.mutate({
                      id: company.id,
                      payload: { is_approved: !company.is_approved, tenant_status: company.is_approved ? 'suspended' : 'active' }
                    })}
                  >
                    {company.is_approved ? "Suspend" : "Approve"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-500/30 dark:text-purple-300 dark:hover:bg-purple-500/10"
                    onClick={() => updateCompanyMutation.mutate({
                      id: company.id,
                      payload: { subscription_plan: selectedPlan[company.id] || company.subscription_plan }
                    })}
                  >
                    Update Plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Manage Pricing Plans
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Update the pricing configuration for the public landing page
              </p>
            </div>
            <Button 
              onClick={() => updatePricingMutation.mutate(editablePlans)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={updatePricingMutation.isPending}
            >
              {updatePricingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {editablePlans.map((plan, index) => (
              <Card key={plan.id} className={`border-gray-200 dark:border-white/[.08] dark:bg-white/[.02] ${plan.highlighted ? 'ring-2 ring-purple-500' : ''}`}>
                <CardHeader>
                  <CardTitle className="text-lg text-gray-900 dark:text-white">{plan.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Price String</label>
                    <input 
                      type="text" 
                      value={plan.price}
                      onChange={(e) => {
                        const newPlans = [...editablePlans];
                        newPlans[index].price = e.target.value;
                        setEditablePlans(newPlans);
                      }}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none dark:border-white/10 dark:bg-[#13072e] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Description String</label>
                    <input 
                      type="text" 
                      value={plan.desc}
                      onChange={(e) => {
                        const newPlans = [...editablePlans];
                        newPlans[index].desc = e.target.value;
                        setEditablePlans(newPlans);
                      }}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none dark:border-white/10 dark:bg-[#13072e] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Features (Comma Separated)</label>
                    <textarea 
                      rows={4}
                      value={plan.features.join(', ')}
                      onChange={(e) => {
                        const newPlans = [...editablePlans];
                        newPlans[index].features = e.target.value.split(',').map(f => f.trim()).filter(f => f);
                        setEditablePlans(newPlans);
                      }}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none dark:border-white/10 dark:bg-[#13072e] dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id={`highlight-${plan.id}`}
                      checked={plan.highlighted}
                      onChange={(e) => {
                        const newPlans = [...editablePlans];
                        newPlans[index].highlighted = e.target.checked;
                        setEditablePlans(newPlans);
                      }}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor={`highlight-${plan.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Highlighted Card
                    </label>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
