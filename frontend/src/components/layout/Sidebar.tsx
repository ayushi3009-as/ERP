import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import Logo from '@/components/ui/Logo';
import {
  LayoutDashboard,
  Users,
  Package,
  Layers,
  Factory,
  MonitorPlay,
  FileText,
  Boxes,
  UserCheck,
  Building2,
  UserCog,
  Shield,
  Palette,
  Ruler,
  ChevronDown,
  ChevronRight,
  Barcode,
  ScanLine,
  FileBarChart,
  Banknote,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Super Admin',
    items: [
      { label: 'SaaS Tenants', to: '/super-admin/dashboard', icon: Shield },
    ],
  },
  {
    title: 'Masters',
    items: [
      { label: 'Employees', to: '/masters/employees', icon: UserCheck },
      { label: 'Products', to: '/masters/products', icon: Package },
      { label: 'Categories', to: '/masters/categories', icon: Layers },
      { label: 'Designs', to: '/masters/designs', icon: Palette },
      { label: 'Fabrics', to: '/masters/fabrics', icon: Boxes },
      { label: 'Services', to: '/masters/services', icon: Wrench },
    ],
  },
  {
    title: 'Production',
    items: [
      { label: 'Lot Management', to: '/production/lots', icon: Factory },
      { label: 'Barcode Scanner', to: '/production/scanner', icon: ScanLine },
      { label: 'Process Tracking', to: '/production/tracking', icon: MonitorPlay },
    ],
  },
  {
    title: 'Payroll',
    items: [
      { label: 'Attendance', to: '/payroll/attendance', icon: UserCheck },
      { label: 'Internal Payments', to: '/payroll/payments', icon: Banknote },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Production Reports', to: '/reports/production', icon: FileBarChart },
      { label: 'Attendance Report', to: '/reports/attendance', icon: UserCheck },
      { label: 'Scan History', to: '/reports/scans', icon: Barcode },
      { label: 'Payments Report', to: '/reports/payments', icon: Banknote },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Company', to: '/settings/company', icon: Building2 },
      { label: 'Users', to: '/settings/users', icon: UserCog },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === 'super_admin';
  const filteredNavigation = navigation.filter(section => {
    if (isSuperAdmin) {
      // Super admin sees: Overview, Super Admin, Settings
      return ['Overview', 'Super Admin', 'Settings'].includes(section.title);
    }
    // Company admin sees everything except Super Admin and Settings
    return !['Super Admin', 'Settings'].includes(section.title);
  });

  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    filteredNavigation.forEach((section) => {
      initial[section.title] = true;
    });
    return initial;
  });

  const location = useLocation();

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const isSectionActive = (section: NavSection) =>
    section.items.some((item) => {
      if (item.to === '/') return location.pathname === '/';
      return location.pathname.startsWith(item.to);
    });

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-[60px] items-center justify-between border-b border-sidebar-border px-3">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 pl-1 min-w-0">
            <Logo size={30} />
            <div className="flex flex-col leading-none min-w-0">
              <span className="text-sm font-bold tracking-tight text-foreground truncate">
                Microtechnique
              </span>
              <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[.18em] text-purple-500 dark:text-purple-400">
                MANUFACTURING
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto">
            <Logo size={26} />
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
            collapsed && 'mt-1',
          )}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-200', !collapsed && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {filteredNavigation.map((section, idx) => {
          const isExpanded = expandedSections[section.title] ?? true;
          const active = isSectionActive(section);

          return (
            <div key={section.title} className="mb-1">
              <button
                onClick={() => toggleSection(section.title)}
                className={cn(
                  'flex w-full items-center rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                  active
                    ? 'text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:text-sidebar-accent-foreground',
                  collapsed && 'justify-center',
                )}
              >
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{section.title}</span>
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    ) : (
                      <ChevronRight className="h-3 w-3 opacity-50" />
                    )}
                  </>
                )}
              </button>

              {(!collapsed && isExpanded) && (
                <div className="mt-0.5 space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center rounded-md px-2 py-1.5 text-sm transition-colors',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        )
                      }
                    >
                      <item.icon className="mr-2.5 h-4 w-4 flex-shrink-0" />
                      {!collapsed && (
                        <span className="flex-1 truncate">{item.label}</span>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
