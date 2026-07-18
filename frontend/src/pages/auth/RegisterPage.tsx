import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, UploadCloud, Loader2, QrCode } from 'lucide-react';
import api from '@/lib/api';
import Logo from '@/components/ui/Logo';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    company_name: '',
    admin_name: '',
    admin_email: '',
    phone: '',
    password: '',
    subscription_plan: 'trial',
    payment_screenshot_url: '',
  });
  
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const registerMutation = useMutation({
    mutationFn: async () => {
      let finalData = { ...formData };
      
      // If there's a file, upload it first
      if (file) {
        setUploading(true);
        const fileData = new FormData();
        fileData.append('file', file);
        try {
          const uploadRes = await api.post('/v1/tenant/upload-payment', fileData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          finalData.payment_screenshot_url = uploadRes.data.url;
        } catch (err: any) {
          throw new Error('Failed to upload screenshot: ' + (err.response?.data?.detail || err.message));
        } finally {
          setUploading(false);
        }
      }
      
      const { data } = await api.post('/v1/tenant/register', finalData);
      return data;
    },
    onSuccess: () => {
      alert("Registration successful! Please wait for Super Admin approval before logging in.");
      navigate('/login');
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.message || 'Registration failed');
    }
  });

  const handleNext = () => {
    if (step === 1 && (!formData.company_name || !formData.admin_email || !formData.password)) {
      setError("Please fill all required fields");
      return;
    }
    setError('');
    setStep(step + 1);
  };

  const handleRegister = () => {
    registerMutation.mutate();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0A0F] px-4 py-12 sm:px-6 lg:px-8 bg-grid-white/[0.02]">
      <div className="w-full max-w-2xl space-y-8 relative z-10">
        
        <div className="text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-white">
            Create your SaaS Account
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Start managing your manufacturing business efficiently
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-[#13111C] shadow-2xl p-8">
          
          {/* Progress Bar */}
          <div className="mb-8 flex items-center justify-between">
            {['Account Details', 'Choose Plan', 'Payment'].map((label, index) => (
              <div key={label} className="flex flex-col items-center flex-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-300 ${
                  step > index + 1 ? 'bg-purple-600 text-white' : 
                  step === index + 1 ? 'bg-purple-600 ring-4 ring-purple-600/20 text-white' : 
                  'bg-white/5 text-gray-500'
                }`}>
                  {step > index + 1 ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                </div>
                <span className={`mt-2 text-xs font-medium ${step >= index + 1 ? 'text-purple-400' : 'text-gray-500'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Step 1: Details */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div>
                <label className="block text-sm font-medium text-gray-300">Company Name *</label>
                <input type="text" required
                  className="mt-1 block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 sm:text-sm"
                  value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">Admin Full Name</label>
                  <input type="text"
                    className="mt-1 block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 sm:text-sm"
                    value={formData.admin_name} onChange={e => setFormData({...formData, admin_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300">Admin Email *</label>
                  <input type="email" required
                    className="mt-1 block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 sm:text-sm"
                    value={formData.admin_email} onChange={e => setFormData({...formData, admin_email: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">Phone Number</label>
                  <input type="text"
                    className="mt-1 block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 sm:text-sm"
                    value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300">Password *</label>
                  <input type="password" required
                    className="mt-1 block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 sm:text-sm"
                    value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end">
                <button onClick={handleNext} className="flex items-center gap-2 rounded-md bg-purple-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 transition-colors">
                  Next Step <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Choose Plan */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { id: 'trial', name: 'Free Trial', price: '₹0 / 14 days' },
                  { id: 'premium', name: 'Premium', price: '₹4,999 / mo' },
                  { id: 'enterprise', name: 'Enterprise', price: '₹9,999 / mo' }
                ].map(plan => (
                  <div key={plan.id} onClick={() => setFormData({...formData, subscription_plan: plan.id})}
                    className={`cursor-pointer rounded-lg border p-4 transition-all ${
                      formData.subscription_plan === plan.id 
                      ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500 ring-offset-2 ring-offset-[#13111C]' 
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <h3 className="font-semibold text-white">{plan.name}</h3>
                    <p className="mt-1 text-sm text-gray-400">{plan.price}</p>
                  </div>
                ))}
              </div>
              <div className="pt-6 flex justify-between">
                <button onClick={() => setStep(1)} className="text-sm font-semibold text-gray-400 hover:text-white">
                  Back
                </button>
                <button onClick={() => setStep(3)} className="flex items-center gap-2 rounded-md bg-purple-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-500 transition-colors">
                  Proceed to Payment <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              {formData.subscription_plan === 'trial' ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="mx-auto h-16 w-16 text-green-500 mb-4" />
                  <h3 className="text-xl font-medium text-white mb-2">Ready to start your free trial?</h3>
                  <p className="text-gray-400">No payment required for the trial period.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
                  <div className="inline-flex h-32 w-32 items-center justify-center rounded-xl bg-white p-2 mb-4">
                    {/* Placeholder for actual QR code image */}
                    <QrCode className="h-24 w-24 text-gray-900" />
                  </div>
                  <h3 className="text-lg font-medium text-white">Scan to Pay via UPI</h3>
                  <p className="mt-2 text-sm font-mono text-purple-400 bg-purple-400/10 inline-block px-3 py-1 rounded">
                    merchant@upi
                  </p>
                  <p className="mt-4 text-xs text-gray-500">
                    After making the payment for your selected plan, please upload the screenshot below for verification.
                  </p>
                </div>
              )}

              {formData.subscription_plan !== 'trial' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Upload Payment Screenshot</label>
                  <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-white/20 px-6 pt-5 pb-6 hover:border-purple-500/50 transition-colors">
                    <div className="space-y-1 text-center">
                      <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-400 justify-center">
                        <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-purple-500 focus-within:outline-none hover:text-purple-400">
                          <span>Upload a file</span>
                          <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF up to 5MB</p>
                    </div>
                  </div>
                  {file && <p className="mt-2 text-sm text-green-400 text-center flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" /> {file.name} selected</p>}
                </div>
              )}

              <div className="pt-6 flex justify-between">
                <button onClick={() => setStep(2)} className="text-sm font-semibold text-gray-400 hover:text-white" disabled={registerMutation.isPending || uploading}>
                  Back
                </button>
                <button 
                  onClick={handleRegister} 
                  disabled={registerMutation.isPending || uploading || (formData.subscription_plan !== 'trial' && !file)}
                  className="flex items-center gap-2 rounded-md bg-purple-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-500 disabled:opacity-50 transition-colors"
                >
                  {(registerMutation.isPending || uploading) ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                  ) : (
                    'Complete Registration'
                  )}
                </button>
              </div>
            </div>
          )}
          
        </div>
        
        <p className="text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-purple-400 hover:text-purple-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
