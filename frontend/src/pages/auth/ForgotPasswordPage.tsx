import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
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
import api from '@/lib/api';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', values);
      setSubmitted(true);
    } catch {
      setError('Failed to send reset link. Please check your email and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
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
          </div>
          <Card className="shadow-xl">
            <CardContent className="flex flex-col items-center py-12 pt-10">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <MailCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-foreground">Check Your Email</h2>
              <p className="mb-6 max-w-xs text-center text-sm text-muted-foreground">
                We&apos;ve sent a password reset link to your email address. Please check your inbox and follow the instructions.
              </p>
              <Link to="/login">
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
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
          <p className="mt-1 text-sm text-muted-foreground">Password Recovery</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Forgot Password</CardTitle>
            <CardDescription>
              Enter your email address and we&apos;ll send you a link to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="admin@company.com"
                error={errors.email?.message}
                {...register('email')}
              />

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" loading={loading}>
                Send Reset Link
              </Button>
            </form>
          </CardContent>
          <CardFooter className="border-t pt-4">
            <Link to="/login" className="flex items-center text-sm text-primary hover:underline">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Login
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
