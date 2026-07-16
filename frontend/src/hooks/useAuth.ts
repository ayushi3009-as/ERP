import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  full_name: string;
  email: string;
  username: string;
  password: string;
  phone?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

async function loginApi(payload: LoginPayload): Promise<{ user: User; access_token: string; refresh_token: string }> {
  const { data } = await api.post<TokenResponse>('/v1/auth/login', payload);
  // Fetch user details
  const { data: user } = await api.get<User>('/v1/auth/me', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  return { user, access_token: data.access_token, refresh_token: data.refresh_token };
}

async function registerApi(payload: RegisterPayload): Promise<{ user: User; access_token: string; refresh_token: string }> {
  const { data: user } = await api.post<User>('/v1/auth/register', payload);
  // Auto-login after registration
  const { data: tokens } = await api.post<TokenResponse>('/v1/auth/login', {
    email: payload.email,
    password: payload.password,
  });
  return { user, access_token: tokens.access_token, refresh_token: tokens.refresh_token };
}

async function getCurrentUserApi(): Promise<User> {
  const { data } = await api.get<User>('/v1/auth/me');
  return data;
}

async function logoutApi(): Promise<void> {
  try {
    await api.post('/v1/auth/logout');
  } catch (e) {
    // Ignore logout errors
  }
}

export function useLogin() {
  const authStore = useAuthStore();

  return useMutation({
    mutationFn: loginApi,
    onSuccess: (data) => {
      const userForStore: User = {
        ...data.user,
        id: String(data.user.id),
        name: (data.user as any).full_name || (data.user as any).username || data.user.email || 'User',
        is_active: true,
        created_at: data.user.created_at || '',
        updated_at: data.user.updated_at || '',
      };
      authStore.login(userForStore, data.access_token, data.refresh_token);
    },
  });
}

export function useRegister() {
  const authStore = useAuthStore();

  return useMutation({
    mutationFn: registerApi,
    onSuccess: (data) => {
      const userForStore: User = {
        ...data.user,
        id: String(data.user.id),
        name: (data.user as any).full_name || (data.user as any).username || data.user.email || 'User',
        is_active: true,
        created_at: data.user.created_at || '',
        updated_at: data.user.updated_at || '',
      };
      authStore.login(userForStore, data.access_token, data.refresh_token);
    },
  });
}

export function useLogout() {
  const authStore = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutApi,
    onSettled: () => {
      authStore.logout();
      queryClient.clear();
    },
  });
}

export function useGetCurrentUser() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUserApi,
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });
}
