import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowRight, Scissors, QrCode, Shirt, BarChart3, Users, 
  Moon, Sun, CheckCircle2, ChevronRight, Zap, Boxes
} from 'lucide-react';
import Logo from '@/components/ui/Logo';
import api from '@/lib/api';

interface PricingPlan {
  id: string;
  name: string;
  price: string;
  desc: string;
  features: string[];
  highlighted: boolean;
}

export default function LandingPage() {
  const [isDark, setIsDark] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [loadingPricing, setLoadingPricing] = useState(true);

  useEffect(() => {
    if (document.documentElement.classList.contains('dark')) {
      setIsDark(true);
    }
    
    const fetchPricing = async () => {
      try {
        const { data } = await api.get('/v1/settings/pricing');
        setPricingPlans(data);
      } catch (error) {
        console.error('Failed to fetch pricing plans', error);
      } finally {
        setLoadingPricing(false);
      }
    };
    
    fetchPricing();
    
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#06040A] text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans selection:bg-purple-500/30">
      
      {/* Navbar */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 dark:bg-[#0a0614]/80 backdrop-blur-lg border-b border-slate-200 dark:border-white/10' : 'bg-transparent'}`}>
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <Logo />
          
          <div className="flex items-center gap-6">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
            >
              {isDark ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
            </button>
            <Link to="/login" className="text-sm font-semibold hover:text-purple-600 dark:hover:text-purple-400 transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link to="/register" className="text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-full shadow-lg shadow-purple-500/25 transition-all hover:scale-105">
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/20 dark:bg-purple-600/20 blur-[120px] rounded-full pointer-events-none"></div>
        
        <div className="container mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-white/5 border border-purple-200 dark:border-purple-500/20 shadow-sm mb-8 animate-fade-in-up">
            <span className="flex h-2 w-2 rounded-full bg-purple-500 animate-pulse"></span>
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">The Ultimate Garment Manufacturing ERP</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight max-w-4xl mx-auto">
            Transform your <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-500">factory floor</span> with digital precision.
          </h1>
          
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            From fabric planning and cutting to real-time barcode lot tracking and employee payroll. Build exactly what you need without the spreadsheet chaos.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-8 py-4 rounded-full text-lg font-semibold transition-transform hover:scale-105 shadow-xl">
              Launch Your Factory <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="#features" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 px-8 py-4 rounded-full text-lg font-semibold transition-colors">
              Explore Features
            </Link>
          </div>
        </div>
      </section>

      {/* Production Flow Section */}
      <section className="py-24 bg-white dark:bg-[#0B0815] relative border-y border-slate-100 dark:border-white/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">The Complete Garment Lifecycle</h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">Track every piece of clothing from a raw roll of fabric to a finished dispatched product.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-12 left-0 w-full h-[2px] bg-gradient-to-r from-purple-500/10 via-purple-500/50 to-purple-500/10 z-0"></div>
            
            <FlowStep icon={<Shirt />} step="1. Plan & Design" desc="Manage designs, calculate fabric consumption, and generate BOMs." />
            <FlowStep icon={<Scissors />} step="2. Cut & Bundle" desc="Cut fabrics, assign sizes, and generate unique Lots for the floor." />
            <FlowStep icon={<QrCode />} step="3. Barcode Floor Tracking" desc="Workers scan Lot QR codes to advance items through stitching & checking." />
            <FlowStep icon={<Boxes />} step="4. Pack & Dispatch" desc="Verify finalized lots, pack them in boxes, and dispatch to clients." />
          </div>
        </div>
      </section>

      {/* Deep Features Grid */}
      <section id="features" className="py-32 relative">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            
            <div className="space-y-8">
              <h2 className="text-3xl md:text-5xl font-bold leading-tight">
                Designed exclusively for <br/><span className="text-purple-600 dark:text-purple-400">apparel manufacturing.</span>
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                Generic ERPs don't understand sizes, colors, and lot tracking. We built this platform strictly around the nuances of garment production.
              </p>
              
              <ul className="space-y-6">
                <FeatureListItem title="Granular Lot Tracking" desc="Create lots with specific sizes and quantities. Track them through Printing, Embroidery, and Stitching." />
                <FeatureListItem title="Employee Attendance & Piece-Rate" desc="Scan employee ID barcodes for instant attendance. Automate payroll based on work completed." />
                <FeatureListItem title="SaaS Multi-Tenancy" desc="100% data isolation. Your factory's data is strictly secured in your own isolated tenant environment." />
              </ul>
            </div>
            
            {/* Visual Glassmorphism Card */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-500 to-blue-500 rounded-3xl blur-2xl opacity-20 animate-pulse"></div>
              <div className="relative bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-white/40 dark:border-white/10 p-8 rounded-3xl shadow-2xl">
                <div className="flex items-center gap-4 mb-8 pb-8 border-b border-slate-200 dark:border-white/10">
                  <div className="w-16 h-16 bg-purple-100 dark:bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <QrCode className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Lot #LOT-2026-001</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Status: In Stitching</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-full"></div>
                  <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-5/6"></div>
                  <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-4/6"></div>
                </div>
                <div className="mt-8 flex justify-end">
                  <button className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium">Scan Next Stage</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-slate-100 dark:bg-[#0B0815] border-y border-slate-200 dark:border-white/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg">Pick the perfect plan for your factory's size.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {loadingPricing ? (
              <div className="col-span-4 text-center py-12 text-slate-500">Loading pricing plans...</div>
            ) : (
              pricingPlans.map((plan) => (
                <PricingCard 
                  key={plan.id}
                  name={plan.name} 
                  price={plan.price} 
                  desc={plan.desc} 
                  features={plan.features} 
                  highlighted={plan.highlighted} 
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white dark:bg-[#06040A]">
        <div className="container mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Logo />
          </div>
          <p className="text-slate-500 dark:text-slate-500 text-sm">
            © {new Date().getFullYear()} Microtechnique IT and Communications Sol. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Subcomponents

function FlowStep({ icon, step, desc }: { icon: React.ReactNode, step: string, desc: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center text-center p-6">
      <div className="w-20 h-20 bg-white dark:bg-[#130E20] border-4 border-slate-50 dark:border-[#0B0815] shadow-xl dark:shadow-purple-900/20 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 mb-6 relative">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2">{step}</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function FeatureListItem({ title, desc }: { title: string, desc: string }) {
  return (
    <li className="flex gap-4">
      <div className="mt-1 bg-purple-100 dark:bg-purple-500/20 p-1 rounded-full text-purple-600 dark:text-purple-400 h-fit">
        <CheckCircle2 className="w-5 h-5" />
      </div>
      <div>
        <h4 className="text-lg font-bold mb-1">{title}</h4>
        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
      </div>
    </li>
  );
}

function PricingCard({ name, price, desc, features, highlighted = false }: { name: string, price: string, desc: string, features: string[], highlighted?: boolean }) {
  return (
    <div className={`p-8 rounded-3xl border ${highlighted ? 'bg-purple-600 text-white border-purple-500 shadow-2xl shadow-purple-600/30 scale-105 z-10 relative' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white'}`}>
      <h3 className={`text-xl font-bold mb-2 ${highlighted ? 'text-purple-100' : 'text-slate-500 dark:text-slate-400'}`}>{name}</h3>
      <div className="mb-2">
        <span className="text-4xl font-extrabold">{price}</span>
      </div>
      <p className={`text-sm mb-8 ${highlighted ? 'text-purple-200' : 'text-slate-500 dark:text-slate-400'}`}>{desc}</p>
      
      <ul className="space-y-4 mb-8">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-3 text-sm font-medium">
            <CheckCircle2 className={`w-5 h-5 ${highlighted ? 'text-purple-200' : 'text-purple-500'}`} />
            {f}
          </li>
        ))}
      </ul>
      
      <Link to="/register" className={`w-full py-3 rounded-xl font-bold flex justify-center transition-colors ${highlighted ? 'bg-white text-purple-600 hover:bg-purple-50' : 'bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20'}`}>
        Choose {name}
      </Link>
    </div>
  );
}
