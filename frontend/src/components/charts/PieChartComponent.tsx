import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface PieDataPoint {
  name: string;
  value: number;
  color?: string;
}

interface PieChartComponentProps {
  data: PieDataPoint[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
}

const DEFAULT_COLORS = [
  'hsl(var(--primary))',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md">
      <p className="text-sm font-medium text-foreground">{payload[0].name}</p>
      <p className="text-xs text-muted-foreground">
        Count: <span className="font-medium text-foreground">{payload[0].value}</span>
      </p>
    </div>
  );
}

export default function PieChartComponent({
  data,
  height = 300,
  innerRadius = 60,
  outerRadius = 100,
  showLegend = true,
}: PieChartComponentProps) {
  const colors = data.map((d, i) => d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground text-2xl font-bold"
          >
            {total}
          </text>
        </RechartsPieChart>
      </ResponsiveContainer>

      {showLegend && (
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {data.map((entry, index) => (
            <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index] }} />
              {entry.name} ({entry.value})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
