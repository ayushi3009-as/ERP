import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  Pencil,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  FolderTree,
  Landmark,
  TrendingUp,
  TrendingDown,
  Scale,
  Wallet,
} from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { Account, PaginatedResponse } from '@/types';

const accountSchema = z.object({
  code: z.string().min(1, 'Account code is required'),
  name: z.string().min(1, 'Account name is required'),
  account_type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
  parent_id: z.string(),
});

type AccountFormData = z.infer<typeof accountSchema>;

interface AccountTreeNode extends Account {
  children?: AccountTreeNode[];
}

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

const typeVariant = (type: string) => {
  switch (type) {
    case 'asset': return 'default' as const;
    case 'liability': return 'destructive' as const;
    case 'equity': return 'outline' as const;
    case 'income': return 'success' as const;
    case 'expense': return 'warning' as const;
    default: return 'secondary' as const;
  }
};

const typeIcon = (type: string) => {
  switch (type) {
    case 'asset': return Landmark;
    case 'liability': return TrendingDown;
    case 'equity': return Scale;
    case 'income': return TrendingUp;
    case 'expense': return Wallet;
    default: return FolderTree;
  }
};

function buildTree(accounts: Account[]): AccountTreeNode[] {
  const map = new Map<string, AccountTreeNode>();
  const roots: AccountTreeNode[] = [];

  accounts.forEach((acc) => {
    map.set(acc.id, { ...acc, children: [] });
  });

  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function TreeNode({ node, depth, onEdit, expanded, toggleExpand }: {
  node: AccountTreeNode;
  depth: number;
  onEdit: (acc: Account) => void;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const Icon = typeIcon(node.account_type);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors',
        )}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => hasChildren && toggleExpand(node.id)}
      >
        {hasChildren ? (
          isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-4" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
        <span className="font-medium text-sm">{node.name}</span>
        <Badge variant={typeVariant(node.account_type)} className="ml-auto text-[10px]">{node.account_type}</Badge>
        <Badge variant={node.is_active ? 'success' : 'secondary'} className="text-[10px]">{node.is_active ? 'Active' : 'Inactive'}</Badge>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); onEdit(node); }}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} onEdit={onEdit} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['accounts', { search, typeFilter }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Account>>('/v1/accounts', {
        params: {
          search,
          per_page: 500,
          ...(typeFilter !== 'all' && { account_type: typeFilter }),
        },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: AccountFormData) => {
      const { data } = await api.post('/v1/accounts', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: AccountFormData & { id: string }) => {
      const { data } = await api.put(`/v1/accounts/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      code: '',
      name: '',
      account_type: 'asset',
      parent_id: '',
    },
  });

  const accounts = data?.items || [];
  const tree = useMemo(() => buildTree(accounts), [accounts]);

  function resetForm() {
    reset({ code: '', name: '', account_type: 'asset', parent_id: '' });
    setEditingAccount(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(acc: Account) {
    setEditingAccount(acc);
    reset({
      code: acc.code,
      name: acc.name,
      account_type: acc.account_type,
      parent_id: acc.parent_id || '',
    });
    setDialogOpen(true);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(accounts.map((a) => a.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function onSubmit(values: AccountFormData) {
    if (editingAccount) {
      updateMutation.mutate({ ...values, id: editingAccount.id });
    } else {
      createMutation.mutate(values);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground">Manage your account structure</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search accounts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={expandAll}>Expand All</Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>Collapse All</Button>
              </div>
            </div>
            {data && <p className="text-sm text-muted-foreground">{data.total} account{data.total !== 1 ? 's' : ''}</p>}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm font-medium text-foreground">Failed to load accounts</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading accounts...</p>
            </div>
          ) : tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FolderTree className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">No accounts found</p>
              <p className="text-xs text-muted-foreground">Add your first account to get started.</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {tree.map((node) => (
                <TreeNode key={node.id} node={node} depth={0} onEdit={openEdit} expanded={expanded} toggleExpand={toggleExpand} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Edit Account' : 'Add Account'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Account Code" placeholder="e.g. 1001" {...register('code')} error={errors.code?.message} />
              <Input label="Account Name" placeholder="e.g. Cash in Hand" {...register('name')} error={errors.name?.message} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Account Type *</label>
              <Select value={watch('account_type')} onValueChange={(v) => setValue('account_type', v as AccountFormData['account_type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Parent Account</label>
              <Select value={watch('parent_id') || ''} onValueChange={(v) => setValue('parent_id', v)}>
                <SelectTrigger><SelectValue placeholder="None (Root account)" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => !editingAccount || a.id !== editingAccount.id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" loading={isPending}>{editingAccount ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
