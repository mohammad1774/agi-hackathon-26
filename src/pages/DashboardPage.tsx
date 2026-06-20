import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Compass, TrendingUp } from "lucide-react";
import {
  FUNNEL,
  IMPACT_STATS,
  PLATFORM_KPIS,
  TIME_TO_CARE,
  VOLUME_BY_SPECIALTY,
} from "@/data/stats";
import { Button, Card, SectionTitle } from "@/components/ui";

export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Hero / thesis */}
      <Card className="overflow-hidden bg-gradient-to-br from-lavender-600 to-primary-600 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <Compass className="h-3.5 w-3.5" /> The intelligence layer before referral intake
            </div>
            <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl">
              Send the right patient to the right specialist — with the right documents, through the
              fastest realistic pathway.
            </h2>
            <p className="mt-2 text-sm text-white/80">
              We optimise for <span className="font-semibold">time-to-accepted-care</span>, not just
              the shortest wait — and we close the loop after the referral is sent.
            </p>
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <Button
                variant="primary"
                className="w-full bg-white !text-lavender-700 hover:bg-white/90 sm:w-auto"
                onClick={() => navigate("/workbench")}
              >
                Open the Workbench <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                className="w-full !text-white hover:bg-white/10 sm:w-auto"
                onClick={() => navigate("/tracker")}
              >
                See closed-loop tracking
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* The problem */}
      <div>
        <SectionTitle
          eyebrow="The problem"
          title="Referrals are healthcare's last broken handoff"
          subtitle="Published industry figures the product is built to fix."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {IMPACT_STATS.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="h-full">
                <div className="flex items-start justify-between">
                  <div className="text-3xl font-extrabold text-rose-500">{s.value}</div>
                  {s.trend && <ArrowDownRight className="h-5 w-5 text-rose-300" />}
                </div>
                <div className="mt-1 text-sm font-semibold text-sand-800">{s.label}</div>
                <p className="mt-1 text-xs text-sand-400">{s.sub}</p>
                {s.source && (
                  <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-sand-300">
                    {s.source}
                  </p>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* KPIs with Referral GPS */}
      <div>
        <SectionTitle
          eyebrow="With Referral GPS"
          title="What changes when routing happens before intake"
          right={
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600">
              <TrendingUp className="h-4 w-4" /> projected impact
            </span>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_KPIS.map((s) => (
            <Card key={s.id} className="h-full">
              <div className="flex items-center gap-1 text-3xl font-extrabold text-primary-600">
                {s.value}
                <ArrowUpRight className="h-5 w-5 text-primary-400" />
              </div>
              <div className="mt-1 text-sm font-semibold text-sand-800">{s.label}</div>
              <p className="mt-1 text-xs text-sand-400">{s.sub}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle
            title="Referral survival through the pipeline"
            subtitle="% of referrals still alive at each stage"
          />
          <div className="scroll-soft -mx-2 overflow-x-auto px-2 pb-2">
            <div className="min-w-[520px]">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={FUNNEL} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ece6" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#857a69" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#a99d8b" }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={chartTooltip}
                    cursor={{ fill: "rgba(132,114,238,0.06)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="baseline" name="Today" fill="#e3ddd4" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="withGps" name="With Referral GPS" fill="#1fb88e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Wait time vs realistic time-to-accepted-care"
            subtitle="The metric that actually matters (weeks)"
          />
          <div className="scroll-soft -mx-2 overflow-x-auto px-2 pb-2">
            <div className="min-w-[520px]">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={TIME_TO_CARE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ece6" vertical={false} />
                  <XAxis dataKey="route" tick={{ fontSize: 11, fill: "#857a69" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#a99d8b" }} axisLine={false} tickLine={false} unit="w" />
                  <Tooltip contentStyle={chartTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="rawWait"
                    name="Advertised wait"
                    stroke="#bfbcfa"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="realistic"
                    name="Realistic time-to-care"
                    stroke="#7152e0"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="Referral volume by specialty"
          subtitle="Last 30 days across the practice"
        />
        <div className="scroll-soft -mx-2 overflow-x-auto px-2 pb-2">
          <div className="min-w-[520px]">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={VOLUME_BY_SPECIALTY} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ece6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#a99d8b" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="specialty"
                  tick={{ fontSize: 12, fill: "#857a69" }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip contentStyle={chartTooltip} cursor={{ fill: "rgba(31,184,142,0.06)" }} />
                <Bar dataKey="referrals" radius={[0, 6, 6, 0]}>
                  {VOLUME_BY_SPECIALTY.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? "#1fb88e" : "#8472ee"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </div>
  );
}

const chartTooltip = {
  borderRadius: 12,
  border: "1px solid #f0ece6",
  boxShadow: "0 8px 24px -8px rgba(80,55,158,0.18)",
  fontSize: 12,
} as const;
