import { useState } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Users, 
  Check, 
  X,
  Lock,
  Eye,
  Settings
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge
} from '@/components/ui';

// Define the hardcoded roles available in the system
const SYSTEM_ROLES = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    description: 'Full unrestricted access to all modules and system settings.',
    variant: 'destructive' as const,
    icon: ShieldAlert,
    permissions: [
      { module: 'System Settings', access: 'full' },
      { module: 'User Management', access: 'full' },
      { module: 'Role Management', access: 'full' },
      { module: 'Master Data', access: 'full' },
      { module: 'Production', access: 'full' },
      { module: 'Payroll & Payments', access: 'full' },
      { module: 'Reports', access: 'full' },
    ]
  },
  {
    id: 'company_admin',
    name: 'Company Admin',
    description: 'Administrative access to manage the company operations and users.',
    variant: 'default' as const,
    icon: ShieldCheck,
    permissions: [
      { module: 'System Settings', access: 'read' },
      { module: 'User Management', access: 'full' },
      { module: 'Role Management', access: 'read' },
      { module: 'Master Data', access: 'full' },
      { module: 'Production', access: 'full' },
      { module: 'Payroll & Payments', access: 'full' },
      { module: 'Reports', access: 'full' },
    ]
  },
  {
    id: 'hr',
    name: 'HR / Payroll',
    description: 'Manages employees, attendance, and payroll operations.',
    variant: 'warning' as const,
    icon: Users,
    permissions: [
      { module: 'System Settings', access: 'none' },
      { module: 'User Management', access: 'none' },
      { module: 'Role Management', access: 'none' },
      { module: 'Master Data (Employees)', access: 'full' },
      { module: 'Production', access: 'read' },
      { module: 'Payroll & Payments', access: 'full' },
      { module: 'Reports', access: 'read' },
    ]
  },
  {
    id: 'production_manager',
    name: 'Production Manager',
    description: 'Oversees production lots, scanning, and process tracking.',
    variant: 'success' as const,
    icon: Settings,
    permissions: [
      { module: 'System Settings', access: 'none' },
      { module: 'User Management', access: 'none' },
      { module: 'Role Management', access: 'none' },
      { module: 'Master Data (Products/Designs)', access: 'full' },
      { module: 'Production', access: 'full' },
      { module: 'Payroll & Payments', access: 'none' },
      { module: 'Reports (Production)', access: 'full' },
    ]
  },
  {
    id: 'quality',
    name: 'Quality Control',
    description: 'Responsible for checking and verifying production quality.',
    variant: 'secondary' as const,
    icon: Eye,
    permissions: [
      { module: 'System Settings', access: 'none' },
      { module: 'User Management', access: 'none' },
      { module: 'Role Management', access: 'none' },
      { module: 'Master Data', access: 'read' },
      { module: 'Production (Quality)', access: 'full' },
      { module: 'Payroll & Payments', access: 'none' },
      { module: 'Reports (Production)', access: 'read' },
    ]
  },
  {
    id: 'accountant',
    name: 'Accountant',
    description: 'Handles financial reports, ledgers, and payment tracking.',
    variant: 'secondary' as const,
    icon: Shield,
    permissions: [
      { module: 'System Settings', access: 'none' },
      { module: 'User Management', access: 'none' },
      { module: 'Role Management', access: 'none' },
      { module: 'Master Data', access: 'read' },
      { module: 'Production', access: 'read' },
      { module: 'Payroll & Payments', access: 'full' },
      { module: 'Reports (Financial)', access: 'full' },
    ]
  },
  {
    id: 'worker',
    name: 'Worker',
    description: 'Limited access primarily for barcode scanning and tracking.',
    variant: 'outline' as const,
    icon: Users,
    permissions: [
      { module: 'System Settings', access: 'none' },
      { module: 'User Management', access: 'none' },
      { module: 'Role Management', access: 'none' },
      { module: 'Master Data', access: 'none' },
      { module: 'Production (Scanning)', access: 'full' },
      { module: 'Payroll & Payments', access: 'none' },
      { module: 'Reports', access: 'none' },
    ]
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to most non-sensitive modules.',
    variant: 'outline' as const,
    icon: Eye,
    permissions: [
      { module: 'System Settings', access: 'none' },
      { module: 'User Management', access: 'none' },
      { module: 'Role Management', access: 'read' },
      { module: 'Master Data', access: 'read' },
      { module: 'Production', access: 'read' },
      { module: 'Payroll & Payments', access: 'none' },
      { module: 'Reports', access: 'read' },
    ]
  },
];

export default function RolesSettingsPage() {
  const [selectedRole, setSelectedRole] = useState(SYSTEM_ROLES[0].id);

  const activeRole = SYSTEM_ROLES.find(r => r.id === selectedRole) || SYSTEM_ROLES[0];

  const renderAccessBadge = (access: string) => {
    switch (access) {
      case 'full':
        return <Badge variant="success" className="w-24 justify-center"><Check className="mr-1 h-3 w-3" /> Full Access</Badge>;
      case 'read':
        return <Badge variant="secondary" className="w-24 justify-center"><Eye className="mr-1 h-3 w-3" /> Read Only</Badge>;
      case 'none':
      default:
        return <Badge variant="outline" className="w-24 justify-center text-muted-foreground"><X className="mr-1 h-3 w-3" /> No Access</Badge>;
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Role Management</h1>
        <p className="text-muted-foreground">
          View system roles and their module-level permissions.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-2">
          {SYSTEM_ROLES.map((role) => {
            const Icon = role.icon;
            const isSelected = selectedRole === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
                  isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card'
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isSelected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{role.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{role.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-6">
          <Card className="h-fit">
            <CardHeader className="flex flex-row items-start justify-between bg-muted/30 pb-6 border-b">
              <div>
                <div className="flex items-center gap-2">
                  <activeRole.icon className="h-6 w-6 text-primary" />
                  <CardTitle className="text-2xl">{activeRole.name}</CardTitle>
                </div>
                <CardDescription className="mt-2 text-base">
                  {activeRole.description}
                </CardDescription>
              </div>
              <Badge variant={activeRole.variant} className="capitalize px-3 py-1 text-sm">
                {activeRole.id.replace('_', ' ')}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {activeRole.permissions.map((perm, index) => (
                  <div key={index} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      {perm.access === 'full' ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/20 text-success">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                      ) : perm.access === 'read' ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                          <Eye className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Lock className="h-4 w-4" />
                        </div>
                      )}
                      <span className="font-medium">{perm.module}</span>
                    </div>
                    {renderAccessBadge(perm.access)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
            <div className="flex gap-2">
              <Shield className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">System Roles are predefined.</p>
                <p className="mt-1 opacity-90">
                  To ensure maximum security and architectural stability, custom role creation is disabled. Please assign one of these predefined roles to your users.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
