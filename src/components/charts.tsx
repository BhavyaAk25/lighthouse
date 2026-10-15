"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";

const AX = { fontSize: 11, fill: "#6B6F76" };
const TT = { contentStyle: { borderRadius: 10, border: "1px solid #E6E1D6", boxShadow: "0 8px 24px -8px rgba(16,24,40,.18)", fontSize: 12 } };

export function WeeklyOutcomes({ data }: { data: { week: string; APPROVED: number; REJECTED: number; REVISION_REQUESTED: number; OPEN: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#EFECE5" />
        <XAxis dataKey="week" tick={AX} axisLine={false} tickLine={false} minTickGap={18} />
        <YAxis tick={AX} axisLine={false} tickLine={false} />
        <Tooltip {...TT} cursor={{ fill: "#F7F5F0" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="APPROVED" name="Approved" stackId="a" fill="#3F7D5B" />
        <Bar dataKey="REVISION_REQUESTED" name="Revision" stackId="a" fill="#C9A15B" />
        <Bar dataKey="REJECTED" name="Rejected" stackId="a" fill="#C98576" />
        <Bar dataKey="OPEN" name="Open" stackId="a" fill="#8E9DB3" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const REC_COLORS: Record<string, string> = {
  PROCEED: "#3F7D5B",
  PROCEED_WITH_CONDITIONS: "#4F6D8A",
  HOLD: "#C9A15B",
  REJECT: "#C98576",
  REVIEW_REQUIRED: "#8E9DB3",
};
const REC_NAMES: Record<string, string> = {
  PROCEED: "Proceed",
  PROCEED_WITH_CONDITIONS: "With conditions",
  HOLD: "Hold",
  REJECT: "Reject",
  REVIEW_REQUIRED: "Review required",
};

export function RecDonut({ data }: { data: { rec: string; n: number }[] }) {
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="n" nameKey="rec" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.rec} fill={REC_COLORS[d.rec]} />
              ))}
            </Pie>
            <Tooltip {...TT} formatter={(v, n) => [`${v} (${((Number(v) / total) * 100).toFixed(0)}%)`, REC_NAMES[String(n)]]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="tnum text-[20px] font-semibold">{total.toLocaleString()}</div>
            <div className="text-[11px] text-muted">packets</div>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => (
          <li key={d.rec} className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="size-2.5 rounded-full" style={{ background: REC_COLORS[d.rec] }} />
              {REC_NAMES[d.rec]}
            </span>
            <span className="tnum font-medium">{((d.n / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DissentBars({ data }: { data: { agent: string; dissent: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4 }}>
        <CartesianGrid horizontal={false} stroke="#EFECE5" />
        <XAxis type="number" tick={AX} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="agent" tick={{ ...AX, fill: "#33373D" }} axisLine={false} tickLine={false} width={80} />
        <Tooltip {...TT} formatter={(v) => `${Number(v).toFixed(1)}% of runs`} cursor={{ fill: "#F7F5F0" }} />
        <Bar dataKey="dissent" name="Opposes or gates" radius={[0, 6, 6, 0]} barSize={18}>
          {data.map((d) => (
            <Cell key={d.agent} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategorySales({ data, keys }: { data: Record<string, number | string>[]; keys: { key: string; name: string; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#EFECE5" />
        <XAxis dataKey="week" tick={AX} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={AX} axisLine={false} tickLine={false} tickFormatter={(v) => money(v)} width={56} />
        <Tooltip {...TT} formatter={(v) => money(Number(v), false)} />
        {keys.map((k) => (
          <Area key={k.key} type="monotone" dataKey={k.key} name={k.name} stackId="1" stroke={k.color} fill={k.color} fillOpacity={0.55} strokeWidth={1} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DcLines({ data }: { data: Record<string, number | string>[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#EFECE5" />
        <XAxis dataKey="week" tick={AX} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={AX} axisLine={false} tickLine={false} domain={[60, "auto"]} tickFormatter={(v) => `${v}%`} />
        <Tooltip {...TT} formatter={(v) => `${Number(v).toFixed(1)}%`} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="DC-P01" stroke="#142B45" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="DC-P02" stroke="#4F6D8A" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Tornado({ data }: { data: { driver: string; low: number; high: number }[] }) {
  // pessimistic side drawn left of zero, optimistic side right of zero
  const rows = data.map((d) => ({ driver: d.driver, low: Math.min(0, d.low), high: Math.max(0, d.high) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 44)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 28, top: 4 }} stackOffset="sign">
        <CartesianGrid horizontal={false} stroke="#EFECE5" />
        <XAxis type="number" tick={AX} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)} pts`} />
        <YAxis type="category" dataKey="driver" tick={{ ...AX, fill: "#33373D" }} axisLine={false} tickLine={false} width={150} />
        <Tooltip {...TT} formatter={(v) => `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(1)} ROI pts`} cursor={{ fill: "#F7F5F0" }} />
        <ReferenceLine x={0} stroke="#9A9C9F" />
        <Bar dataKey="low" name="Pessimistic" stackId="t" fill="#C98576" barSize={18} />
        <Bar dataKey="high" name="Optimistic" stackId="t" fill="#3F7D5B" barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
