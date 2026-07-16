import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface ProductionDataPoint {
  day: string;
  produced: number;
  target: number;
}

interface ProductionChartProps {
  data: ProductionDataPoint[];
  height?: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md">
      <p className="mb-1 text-sm font-medium text-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-xs text-muted-foreground">
          {entry.dataKey === 'produced' ? 'Produced' : 'Target'}:{' '}
          <span className="font-medium text-foreground">{entry.value.toLocaleString('en-IN')}</span>
        </p>
      ))}
    </div>
  );
}

export default function ProductionChart({ data, height = 350 }: ProductionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="target" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((_, index) => (
            <Cell key={`target-${index}`} fill="hsl(var(--muted-foreground))" opacity={0.2} />
          ))}
        </Bar>
        <Bar dataKey="produced" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
