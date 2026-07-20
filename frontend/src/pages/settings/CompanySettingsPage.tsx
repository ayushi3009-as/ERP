import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Save,
  AlertCircle,
  Building2,
  Hash,
  Mail,
  Printer,
  X,
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
import type { Company } from '@/types';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  gstin: z.string(),
  pan: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  phone: z.string(),
  email: z.string(),
  financial_year_start: z.string(),
  financial_year_end: z.string(),
});

const numberSeriesSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  prefix: z.string().min(1, 'Prefix is required'),
  current_number: z.coerce.number().min(0),
  suffix: z.string(),
});

const emailSchema = z.object({
  smtp_host: z.string(),
  smtp_port: z.coerce.number().min(1).max(65535),
  smtp_username: z.string(),
  smtp_password: z.string(),
  from_email: z.string(),
  from_name: z.string(),
});

const whatsappSchema = z.object({
  api_key: z.string(),
  phone_number_id: z.string(),
  webhook_url: z.string(),
});

const printerSchema = z.object({
  name: z.string().min(1, 'Printer name is required'),
  paper_size: z.string(),
  is_default: z.boolean(),
});

type CompanyFormData = z.infer<typeof companySchema>;
type NumberSeriesFormData = z.infer<typeof numberSeriesSchema>;
type EmailFormData = z.infer<typeof emailSchema>;
type WhatsappFormData = z.infer<typeof whatsappSchema>;
type PrinterFormData = z.infer<typeof printerSchema>;

const PAPER_SIZES = ['A4', 'A5', 'Letter', 'Thermal 80mm', 'Thermal 58mm'];

const TABS = ['company', 'number-series', 'email', 'whatsapp', 'printer'] as const;
type Tab = (typeof TABS)[number];

export default function CompanySettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<NumberSeriesFormData | null>(null);

  const { data: company, isLoading: companyLoading, isError: companyError } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await api.get<Company>('/v1/company/');
      return data;
    },
  });

  const { data: numberSeries, isLoading: seriesLoading } = useQuery({
    queryKey: ['number-series'],
    queryFn: async () => {
      const { data } = await api.get<NumberSeriesFormData[]>('/v1/number-series/');
      return data;
    },
    enabled: activeTab === 'number-series',
  });

  const { data: emailSettings } = useQuery({
    queryKey: ['settings', 'email'],
    queryFn: async () => {
      const { data } = await api.get<EmailFormData>('/v1/settings/email/');
      return data;
    },
    enabled: activeTab === 'email',
  });

  const { data: whatsappSettings } = useQuery({
    queryKey: ['settings', 'whatsapp'],
    queryFn: async () => {
      const { data } = await api.get<WhatsappFormData>('/v1/settings/whatsapp/');
      return data;
    },
    enabled: activeTab === 'whatsapp',
  });

  const { data: printerSettings } = useQuery({
    queryKey: ['settings', 'printers'],
    queryFn: async () => {
      const { data } = await api.get<PrinterFormData[]>('/v1/settings/printers/');
      return data;
    },
    enabled: activeTab === 'printer',
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (values: CompanyFormData) => {
      const { data } = await api.put('/v1/company/', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
    },
  });

  const saveSeriesMutation = useMutation({
    mutationFn: async (values: NumberSeriesFormData[]) => {
      const { data } = await api.put('/v1/number-series', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['number-series'] });
      setSeriesDialogOpen(false);
    },
  });

  const saveEmailMutation = useMutation({
    mutationFn: async (values: EmailFormData) => {
      const { data } = await api.put('/v1/settings/email', values);
      return data;
    },
  });

  const saveWhatsappMutation = useMutation({
    mutationFn: async (values: WhatsappFormData) => {
      const { data } = await api.put('/v1/settings/whatsapp', values);
      return data;
    },
  });

  const savePrinterMutation = useMutation({
    mutationFn: async (values: PrinterFormData[]) => {
      const { data } = await api.put('/v1/settings/printers', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'printers'] });
    },
  });

  const {
    register: regCompany,
    handleSubmit: handleSubmitCompany,
    reset: resetCompany,
    formState: { errors: companyErrors },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    values: company ? {
      name: company.name || '',
      gstin: company.gstin || '',
      pan: company.pan || '',
      address: company.address || '',
      city: company.city || '',
      state: company.state || '',
      pincode: company.pincode || '',
      phone: company.phone || '',
      email: company.email || '',
      financial_year_start: '',
      financial_year_end: '',
    } : undefined,
  });

  const {
    register: regEmail,
    handleSubmit: handleSubmitEmail,
    formState: { errors: emailErrors },
  } = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    values: emailSettings || undefined,
  });

  const {
    register: regWhatsapp,
    handleSubmit: handleSubmitWhatsapp,
    formState: { errors: whatsappErrors },
  } = useForm<WhatsappFormData>({
    resolver: zodResolver(whatsappSchema),
    values: whatsappSettings || undefined,
  });

  const {
    register: regSeries,
    handleSubmit: handleSubmitSeries,
    reset: resetSeries,
    control: controlSeries,
    formState: { errors: seriesErrors },
  } = useForm<{ items: NumberSeriesFormData[] }>({
    defaultValues: { items: numberSeries || [] },
    values: { items: numberSeries || [] },
  });

  const { fields: seriesFields, append: appendSeries, remove: removeSeries } = useFieldArray({
    control: controlSeries,
    name: 'items',
  });

  const {
    register: regPrinter,
    control: controlPrinter,
    handleSubmit: handleSubmitPrinter,
    formState: { errors: printerErrors },
  } = useForm<{ items: PrinterFormData[] }>({
    defaultValues: { items: printerSettings || [] },
    values: { items: printerSettings || [] },
  });

  const { fields: printerFields, append: appendPrinter, remove: removePrinter } = useFieldArray({
    control: controlPrinter,
    name: 'items',
  });

  const tabConfig = [
    { id: 'company' as const, label: 'Company Profile', icon: Building2 },
    { id: 'number-series' as const, label: 'Number Series', icon: Hash },
    { id: 'email' as const, label: 'Email Settings', icon: Mail },
    { id: 'whatsapp' as const, label: 'WhatsApp', icon: Mail },
    { id: 'printer' as const, label: 'Printers', icon: Printer },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Company Settings</h2>
        <p className="text-sm text-muted-foreground">Manage company profile and system settings</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabConfig.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {activeTab === 'company' && (
        <Card>
          <CardHeader>
            <CardTitle>Company Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {companyError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium text-foreground">Failed to load company profile</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitCompany((v) => updateCompanyMutation.mutate(v))} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Company Name" {...regCompany('name')} error={companyErrors.name?.message} />
                  <Input label="GSTIN" placeholder="22AAAAA0000A1Z5" {...regCompany('gstin')} />
                  <Input label="PAN" placeholder="AAAAA0000A" {...regCompany('pan')} />
                  <Input label="Phone" {...regCompany('phone')} />
                  <Input label="Email" type="email" {...regCompany('email')} />
                </div>
                <Input label="Address" {...regCompany('address')} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Input label="City" {...regCompany('city')} />
                  <Input label="State" {...regCompany('state')} />
                  <Input label="Pincode" {...regCompany('pincode')} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Financial Year Start" type="date" {...regCompany('financial_year_start')} />
                  <Input label="Financial Year End" type="date" {...regCompany('financial_year_end')} />
                </div>
                <Button type="submit" loading={updateCompanyMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />Save Changes
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'number-series' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Number Series</CardTitle>
            <Button size="sm" onClick={() => appendSeries({ key: '', prefix: '', current_number: 0, suffix: '' })}>
              <Plus className="mr-1 h-3.5 w-3.5" />Add Series
            </Button>
          </CardHeader>
          <CardContent>
            {seriesLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : (
              <form onSubmit={handleSubmitSeries((v) => saveSeriesMutation.mutate(v.items))} className="space-y-4">
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Key</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Prefix</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Current #</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Suffix</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Example</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {seriesFields.map((field, index) => (
                        <tr key={field.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2"><Input className="w-32" {...regSeries(`items.${index}.key`)} placeholder="e.g. sales_order" /></td>
                          <td className="px-3 py-2"><Input className="w-20" {...regSeries(`items.${index}.prefix`)} placeholder="SO-" /></td>
                          <td className="px-3 py-2"><Input type="number" className="w-20" {...regSeries(`items.${index}.current_number`, { valueAsNumber: true })} /></td>
                          <td className="px-3 py-2"><Input className="w-20" {...regSeries(`items.${index}.suffix`)} placeholder="" /></td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {field.prefix}{String(field.current_number + 1).padStart(4, '0')}{field.suffix}
                          </td>
                          <td className="px-3 py-2">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeSeries(index)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {seriesFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No number series configured.</p>}
                <Button type="submit" loading={saveSeriesMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />Save
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'email' && (
        <Card>
          <CardHeader><CardTitle>Email Settings</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitEmail((v) => saveEmailMutation.mutate(v))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="SMTP Host" placeholder="smtp.gmail.com" {...regEmail('smtp_host')} />
                <Input label="SMTP Port" type="number" placeholder="587" {...regEmail('smtp_port')} error={emailErrors.smtp_port?.message} />
                <Input label="SMTP Username" {...regEmail('smtp_username')} />
                <Input label="SMTP Password" type="password" {...regEmail('smtp_password')} />
                <Input label="From Email" type="email" placeholder="noreply@company.com" {...regEmail('from_email')} />
                <Input label="From Name" placeholder="Company Name" {...regEmail('from_name')} />
              </div>
              <Button type="submit" loading={saveEmailMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />Save
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === 'whatsapp' && (
        <Card>
          <CardHeader><CardTitle>WhatsApp Settings</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitWhatsapp((v) => saveWhatsappMutation.mutate(v))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="API Key" type="password" {...regWhatsapp('api_key')} />
                <Input label="Phone Number ID" {...regWhatsapp('phone_number_id')} />
              </div>
              <Input label="Webhook URL" placeholder="https://..." {...regWhatsapp('webhook_url')} />
              <Button type="submit" loading={saveWhatsappMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />Save
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === 'printer' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Printer Settings</CardTitle>
            <Button size="sm" onClick={() => appendPrinter({ name: '', paper_size: 'A4', is_default: false })}>
              <Plus className="mr-1 h-3.5 w-3.5" />Add Printer
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitPrinter((v) => savePrinterMutation.mutate(v.items))} className="space-y-4">
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Printer Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Paper Size</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Default</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {printerFields.map((field, index) => (
                      <tr key={field.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2"><Input className="w-48" {...regPrinter(`items.${index}.name`)} placeholder="Printer name" /></td>
                        <td className="px-3 py-2">
                          <Select defaultValue={field.paper_size} onValueChange={() => {}}>
                            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PAPER_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="checkbox" {...regPrinter(`items.${index}.is_default`)} className="h-4 w-4 rounded border-border" />
                        </td>
                        <td className="px-3 py-2">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removePrinter(index)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {printerFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No printers configured.</p>}
              <Button type="submit" loading={savePrinterMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />Save
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
