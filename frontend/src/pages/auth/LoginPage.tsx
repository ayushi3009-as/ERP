import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/Toast';
import { useLogin } from '@/hooks/useAuth';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginPageContent() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; title: string; description: string; variant?: 'default' | 'destructive' | 'success' }>({
    open: false,
    title: '',
    description: '',
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await loginMutation.mutateAsync(values);
      setToast({ open: true, title: 'Welcome back!', description: 'Login successful.', variant: 'success' });
      setTimeout(() => navigate('/'), 500);
    } catch (err: unknown) {
      let message = 'Invalid email or password. Please try again.';
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { detail?: string }; status?: number } };
        if (axiosErr.response?.data?.detail) {
          message = axiosErr.response.data.detail;
        } else if (axiosErr.response?.status === 401) {
          message = 'Invalid email or password. Please check your credentials.';
        } else if (axiosErr.response?.status === 403) {
          message = 'Your account has been deactivated. Contact your administrator.';
        } else if (axiosErr.response?.status === 404) {
          message = 'User not found. Please check your email address.';
        } else if (axiosErr.response?.status && axiosErr.response.status >= 500) {
          message = 'Server error. Please try again later.';
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      setToast({ open: true, title: 'Login Failed', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0118] p-4">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(124,58,237,.28),transparent)]" />
        <div className="absolute top-1/3 left-1/4 h-72 w-72 rounded-full bg-purple-600/10 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-violet-500/8 blur-[120px]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.4) 1px,transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 rounded-2xl bg-white/[.06] p-4 ring-1 ring-white/[.08] backdrop-blur-md">
            <Logo size={48} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Microtechnique <span className="text-brand-gradient">ERP</span>
          </h1>
          <p className="mt-1.5 text-sm text-purple-200/60">
            Garments Manufacturing Management
          </p>
        </div>

        {/* Glassmorphism login card */}
        <Card className="border border-white/[.08] bg-white/[.04] shadow-2xl shadow-purple-900/20 backdrop-blur-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold text-white">Sign in to your account</CardTitle>
            <CardDescription className="text-purple-200/50">
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-2">
                <p className="text-xs text-purple-200/70">
                  <span className="font-medium">Demo credentials:</span>{' '}
                  admin@microerp.com / Admin@123
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-purple-200/70">Email</label>
                <Input
                  type="email"
                  placeholder="admin@microtechnique.com"
                  className="border-white/10 bg-white/[.05] text-white placeholder:text-purple-300/30 focus-visible:ring-purple-500"
                  error={errors.email?.message}
                  {...register('email')}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-purple-200/70">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    className="border-white/10 bg-white/[.05] text-white placeholder:text-purple-300/30 focus-visible:ring-purple-500 pr-10"
                    error={errors.password?.message}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-300/40 hover:text-purple-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-purple-200/50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-purple-500/30 bg-purple-900/30 accent-purple-500"
                  />
                  Remember me
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                className="mt-2 w-full rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 font-semibold text-white shadow-lg shadow-purple-600/30 hover:from-purple-500 hover:to-violet-500 transition-all"
                loading={loginMutation.isPending}
              >
                Sign In
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex-col space-y-3 border-t border-white/[.06] pt-4">
            <p className="text-xs text-purple-200/40">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-medium text-purple-400 hover:text-purple-300 transition-colors">
                Create account
              </Link>
            </p>
          </CardFooter>
        </Card>

        {/* Footer trust line */}
        <p className="mt-6 text-center text-[11px] text-purple-300/30">
          Trusted by 500+ garment manufacturers worldwide
        </p>
      </div>

      <ToastProvider>
        <Toast open={toast.open} onOpenChange={(open) => setToast((s) => ({ ...s, open }))} variant={toast.variant}>
          <div className="grid gap-1">
            <ToastTitle>{toast.title}</ToastTitle>
            <ToastDescription>{toast.description}</ToastDescription>
          </div>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    </div>
  );
}

export default function LoginPage() {
  return <LoginPageContent />;
}
