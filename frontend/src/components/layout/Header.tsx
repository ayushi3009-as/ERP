import * as React from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Search,
  Bell,
  ChevronRight,
  Menu,
  Moon,
  Sun,
  User,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

const routeLabels: Record<string, string> = {
  '': 'Home',
  masters: 'Masters',
  customers: 'Customers',
  vendors: 'Vendors',
  employees: 'Employees',
  products: 'Products',
  categories: 'Categories',
  brands: 'Brands',
  styles: 'Styles',
  designs: 'Designs',
  seasons: 'Seasons',
  fabrics: 'Fabrics',
  colors: 'Colors',
  sizes: 'Sizes',
  units: 'Units',
  warehouses: 'Warehouses',
  machines: 'Machines',
  inventory: 'Inventory',
  stock: 'Stock Overview',
  ledger: 'Inventory Ledger',
  movements: 'Stock Movements',
  purchase: 'Purchase',
  indents: 'Purchase Indents',
  orders: 'Orders',
  grn: 'GRN',
  invoices: 'Invoices',
  sales: 'Sales',
  quotations: 'Quotations',
  challans: 'Delivery Challans',
  production: 'Production',
  tracking: 'Tracking',
  bundles: 'Bundle Tracking',
  bom: 'BOM',
  list: 'List',
  quality: 'Quality',
  checks: 'Quality Checks',
  'job-work': 'Job Work',
  payroll: 'Payroll',
  attendance: 'Attendance',
  'salary-slips': 'Salary Slips',
  accounting: 'Accounting',
  accounts: 'Chart of Accounts',
  journal: 'Journal Entries',
  payments: 'Payments',
  receipts: 'Receipts',
  reports: 'Reports',
  gst: 'GST Reports',
  profit: 'Profit & Loss',
  settings: 'Settings',
  company: 'Company',
  users: 'Users',
  roles: 'Roles',
};

const pathLabels: Record<string, string> = {
  '/reports/sales': 'Sales Reports',
  '/reports/purchase': 'Purchase Reports',
  '/reports/inventory': 'Inventory Reports',
  '/reports/production': 'Production Reports',
  '/purchase/orders': 'Purchase Orders',
  '/purchase/invoices': 'Purchase Invoices',
  '/sales/orders': 'Sales Orders',
  '/sales/invoices': 'Sales Invoices',
  '/inventory/stock': 'Stock Overview',
};

function getBreadcrumbs(pathname: string): { label: string; path: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; path: string }[] = [{ label: 'Home', path: '/' }];

  let currentPath = '';
  for (const segment of segments) {
    currentPath += `/${segment}`;
    const pathLabel = pathLabels[currentPath];
    const label = pathLabel || routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    crumbs.push({ label, path: currentPath });
  }

  return crumbs;
}

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [dark, setDark] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  const breadcrumbs = getBreadcrumbs(location.pathname);
  const unreadCount = 5;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>

        <nav className="hidden items-center gap-1 text-sm md:flex">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.path}>
              {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <Link
                to={crumb.path}
                className={cn(
                  'transition-colors hover:text-foreground',
                  idx === breadcrumbs.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {crumb.label}
              </Link>
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search..."
            className={cn(
              'h-9 w-48 rounded-md border border-input bg-background pl-8 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:w-64',
              searchOpen && 'w-64 lg:w-80',
            )}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setSearchOpen(!searchOpen)}>
          <Search className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleDark}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <div className="relative">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </Button>
        </div>

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span className="hidden font-medium lg:block">{user?.name || 'User'}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-md">
              <div className="border-b border-border px-2 py-1.5 mb-1">
                <p className="text-sm font-medium">{user?.name || 'User'}</p>
                <p className="text-xs text-muted-foreground">{user?.email || 'user@company.com'}</p>
              </div>
              <button className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                <User className="mr-2 h-4 w-4" />
                Profile
              </button>
              <button className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={logout}
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
