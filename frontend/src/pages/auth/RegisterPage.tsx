import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
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
import { useRegister } from '@/hooks/useAuth';

const registerSchema = z
  .object({
    name: z.string().min(1, 'Full name is required').min(2, 'Name must be at least 2 characters'),
    email: z.string().min(1, 'Email is required').email('Invalid email address'),
    username: z
      .string()
      .min(1, 'Username is required')
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must not exceed 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    phone: z
      .string()
      .min(1, 'Phone number is required')
      .regex(/^[+]?[0-9]{10,15}$/, 'Invalid phone number'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const registerMutation = useRegister();
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant?: 'default' | 'destructive' | 'success';
  }>({ open: false, title: '', description: '' });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      username: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      await registerMutation.mutateAsync({
        full_name: values.name,
        username: values.email.split('@')[0],
        email: values.email,
        password: values.password,
      });
      setSuccess(true);
      setToast({ open: true, title: 'Account Created', description: 'Your account has been registered successfully.', variant: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setToast({ open: true, title: 'Registration Failed', description: message, variant: 'destructive' });
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="flex flex-col items-center py-12 pt-10">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Registration Successful!</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Your account has been created. You have been logged in and redirected.
            </p>
            <Link to="/">
              <Button>Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 rounded-2xl bg-purple-100 dark:bg-purple-900/30 p-4">
            <Logo size={40} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Microtechnique <span className="text-brand-gradient">ERP</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Create your account</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Register</CardTitle>
            <CardDescription>Fill in the details below to create your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Full Name"
                placeholder="John Doe"
                error={errors.name?.message}
                {...register('name')}
              />

              <Input
                label="Email"
                type="email"
                placeholder="john@company.com"
                error={errors.email?.message}
                {...register('email')}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Username"
                  placeholder="johndoe"
                  error={errors.username?.message}
                  {...register('username')}
                />
                <Input
                  label="Phone"
                  type="tel"
                  placeholder="+919876543210"
                  error={errors.phone?.message}
                  {...register('phone')}
                />
              </div>

              <Input
                label="Password"
                type="password"
                placeholder="Min 8 characters"
                error={errors.password?.message}
                {...register('password')}
              />

              <Input
                label="Confirm Password"
                type="password"
                placeholder="Re-enter password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />

              <Button type="submit" className="w-full" loading={registerMutation.isPending}>
                Create Account
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex-col space-y-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
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
