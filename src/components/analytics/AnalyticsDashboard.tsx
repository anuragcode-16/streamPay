/**
 * AnalyticsDashboard.tsx
 * Merchant analytics page powered by Chart.js + react-chartjs-2
 * Data source: merchantAnalytics.json (200 transactions)
 */

import { useMemo, useEffect, useState } from "react";
import { Chart as ChartJS, registerables } from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import { motion } from "framer-motion";
import { TrendingUp, Users, Clock, DollarSign, PieChart } from "lucide-react";
import { transactions } from "@/data/merchantAnalytics";

// Live data structures from MerchantDashboard
interface Payment { sessionId: string; paymentId?: string; amountPaise: number; method: string; receivedAt: string; }
interface LiveSession { userId: string; serviceType: string; elapsedSec: number; }

export interface AnalyticsProps {
    payments?: Payment[];
    liveSessions?: Map<string, LiveSession>;
}

interface Transaction {
    id: string;
    date: string;
    hour: number;
    customerId: string;
    customerType: string;
    serviceType: string;
    durationMin: number;
    amountPaise: number;
    paymentMethod: string;
}

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: { color: "rgba(255,255,255,0.7)", font: { family: "Inter, sans-serif", size: 12 } },
        },
        tooltip: {
            backgroundColor: "rgba(10,10,20,0.95)",
            titleColor: "#a78bfa",
            bodyColor: "rgba(255,255,255,0.85)",
            borderColor: "rgba(139,92,246,0.3)",
            borderWidth: 1,
            cornerRadius: 10,
        },
    },
    scales: {
        x: {
            ticks: { color: "rgba(255,255,255,0.5)", font: { size: 11 } },
            grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
            ticks: { color: "rgba(255,255,255,0.5)", font: { size: 11 } },
            grid: { color: "rgba(255,255,255,0.06)" },
        },
    },
} as const;

const NEON_PURPLE = "rgba(139,92,246,1)";
const NEON_CYAN = "rgba(34,211,238,1)";
const NEON_PINK = "rgba(236,72,153,1)";
const NEON_GREEN = "rgba(52,211,153,1)";
const NEON_ORANGE = "rgba(251,146,60,1)";

function bg(hex: string, a = 0.18) {
    return hex.replace("1)", `${a})`);
}

export default function AnalyticsDashboard({ payments = [], liveSessions = new Map() }: AnalyticsProps) {
    const [isChartReady, setIsChartReady] = useState(false);

    useEffect(() => {
        ChartJS.register(...registerables);
        setIsChartReady(true);
    }, []);

    try {
        const data = useMemo<Transaction[]>(() => {
            const base = [...transactions];
            payments.forEach(p => {
                const ls = liveSessions.get(p.sessionId);
                const ts = new Date(p.receivedAt);
                base.push({
                    id: p.paymentId || p.sessionId || Math.random().toString(),
                    date: ts.toISOString().split("T")[0],
                    hour: ts.getHours(),
                    customerId: ls?.userId || "user_live",
                    customerType: "new",
                    serviceType: ls?.serviceType || "gym",
                    durationMin: ls ? Math.max(1, Math.ceil(ls.elapsedSec / 60)) : 1,
                    amountPaise: p.amountPaise,
                    paymentMethod: p.method || "wallet",
                });
            });
            return base;
        }, [payments, liveSessions]);

        // ── KPI numbers ──────────────────────────────────────────────────────────────
        const kpis = useMemo(() => {
            const totalRevenue = data.reduce((s, t) => s + t.amountPaise, 0) / 100;
            const uniqueCustomers = new Set(data.map(t => t.customerId)).size;
            const hourCounts: Record<number, number> = {};
            data.forEach(t => { hourCounts[t.hour] = (hourCounts[t.hour] || 0) + 1; });
            const peakHour = Object.entries(hourCounts).sort((a, b) => +b[1] - +a[1])[0];
            const dailyRevenue: Record<string, number> = {};
            data.forEach(t => { dailyRevenue[t.date] = (dailyRevenue[t.date] || 0) + t.amountPaise / 100; });
            const dates = Object.keys(dailyRevenue).sort();
            const estMonthly = (Object.values(dailyRevenue).reduce((a, b) => a + b, 0) / dates.length * 30).toFixed(0);

            return { totalRevenue, uniqueCustomers, peakHour, estMonthly };
        }, [data]);

        // ── Revenue trend (line, per day) ────────────────────────────────────────────
        const revenueChart = useMemo(() => {
            const daily: Record<string, number> = {};
            data.forEach(t => { daily[t.date] = (daily[t.date] || 0) + t.amountPaise / 100; });
            const sorted = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b));
            return {
                labels: sorted.map(([d]) => d.slice(5)),
                datasets: [{
                    label: "Revenue (₹)",
                    data: sorted.map(([, v]) => v),
                    borderColor: NEON_PURPLE,
                    backgroundColor: bg(NEON_PURPLE, 0.15),
                    fill: true,
                    tension: 0.45,
                    pointRadius: 4,
                    pointBackgroundColor: NEON_PURPLE,
                    borderWidth: 2,
                }],
            };
        }, [data]);

        // ── Peak hours (bar) ──────────────────────────────────────────────────────────
        const peakChart = useMemo(() => {
            const counts: Record<number, number> = {};
            const rev: Record<number, number> = {};
            data.forEach(t => {
                counts[t.hour] = (counts[t.hour] || 0) + 1;
                rev[t.hour] = (rev[t.hour] || 0) + t.amountPaise / 100;
            });
            const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6am–11pm
            return {
                labels: hours.map(h => `${h}:00`),
                datasets: [
                    {
                        label: "Transactions",
                        data: hours.map(h => counts[h] || 0),
                        backgroundColor: hours.map(h =>
                            (counts[h] || 0) === Math.max(...Object.values(counts))
                                ? NEON_CYAN
                                : bg(NEON_CYAN, 0.55)
                        ),
                        borderRadius: 6,
                        yAxisID: "y",
                    },
                    {
                        label: "Revenue (₹)",
                        data: hours.map(h => rev[h] || 0),
                        backgroundColor: bg(NEON_ORANGE, 0.7),
                        borderRadius: 6,
                        yAxisID: "y1",
                    },
                ],
            };
        }, [data]);

        // ── Customer type breakdown (doughnut) ────────────────────────────────────────
        const customerChart = useMemo(() => {
            const counts: Record<string, number> = { new: 0, regular: 0, vip: 0 };
            data.forEach(t => { counts[t.customerType] = (counts[t.customerType] || 0) + 1; });
            return {
                labels: ["New", "Regular", "VIP"],
                datasets: [{
                    data: [counts.new, counts.regular, counts.vip],
                    backgroundColor: [bg(NEON_GREEN, 0.8), bg(NEON_PURPLE, 0.8), bg(NEON_PINK, 0.8)],
                    borderColor: [NEON_GREEN, NEON_PURPLE, NEON_PINK],
                    borderWidth: 2,
                    hoverOffset: 10,
                }],
            };
        }, [data]);

        // ── Service type revenue (bar) ────────────────────────────────────────────────
        const serviceChart = useMemo(() => {
            const rev: Record<string, number> = {};
            const cnt: Record<string, number> = {};
            data.forEach(t => {
                rev[t.serviceType] = (rev[t.serviceType] || 0) + t.amountPaise / 100;
                cnt[t.serviceType] = (cnt[t.serviceType] || 0) + 1;
            });
            const services = Object.keys(rev).sort((a, b) => rev[b] - rev[a]);
            const colors = [NEON_PURPLE, NEON_CYAN, NEON_PINK, NEON_GREEN, NEON_ORANGE, "rgba(250,204,21,1)", "rgba(167,139,250,1)"];
            return {
                labels: services.map(s => s.charAt(0).toUpperCase() + s.slice(1)),
                datasets: [
                    {
                        label: "Revenue (₹)",
                        data: services.map(s => rev[s]),
                        backgroundColor: services.map((_, i) => bg(colors[i % colors.length], 0.75)),
                        borderColor: services.map((_, i) => colors[i % colors.length]),
                        borderWidth: 2,
                        borderRadius: 8,
                        yAxisID: "y",
                    },
                    {
                        label: "Sessions",
                        data: services.map(s => cnt[s]),
                        backgroundColor: services.map((_, i) => bg(colors[i % colors.length], 0.3)),
                        borderColor: services.map((_, i) => colors[i % colors.length]),
                        borderWidth: 1,
                        borderRadius: 8,
                        yAxisID: "y1",
                    },
                ],
            };
        }, [data]);

        // ── Payment method split (doughnut) ──────────────────────────────────────────
        const paymentChart = useMemo(() => {
            const counts: Record<string, number> = {};
            const revMap: Record<string, number> = {};
            data.forEach(t => {
                counts[t.paymentMethod] = (counts[t.paymentMethod] || 0) + 1;
                revMap[t.paymentMethod] = (revMap[t.paymentMethod] || 0) + t.amountPaise / 100;
            });
            const methods = Object.keys(counts);
            const palette = [NEON_CYAN, NEON_ORANGE];
            return {
                labels: methods.map(m => m.toUpperCase()),
                datasets: [{
                    data: methods.map(m => revMap[m]),
                    backgroundColor: methods.map((_, i) => bg(palette[i % palette.length], 0.8)),
                    borderColor: methods.map((_, i) => palette[i % palette.length]),
                    borderWidth: 2,
                    hoverOffset: 10,
                }],
            };
        }, [data]);

        // ── Common scale configs ──────────────────────────────────────────────────────
        const dualYScales = {
            ...CHART_DEFAULTS.scales,
            y: { ...CHART_DEFAULTS.scales.y, position: "left" as const, title: { display: true, text: "Revenue (₹)", color: "rgba(255,255,255,0.4)" } },
            y1: { ...CHART_DEFAULTS.scales.y, position: "right" as const, grid: { display: false }, title: { display: true, text: "Count", color: "rgba(255,255,255,0.4)" } },
        };

        const donutOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                ...CHART_DEFAULTS.plugins,
                legend: { ...CHART_DEFAULTS.plugins.legend, position: "bottom" as const },
            },
        };

        const kpiCards = [
            { label: "Total Revenue", value: `₹${kpis.totalRevenue.toLocaleString("en-IN")}`, icon: DollarSign, color: NEON_GREEN },
            { label: "Unique Customers", value: String(kpis.uniqueCustomers), icon: Users, color: NEON_CYAN },
            { label: "Peak Hour", value: `${kpis.peakHour?.[0] || "-"}:00`, icon: Clock, color: NEON_ORANGE },
            { label: "Est. Monthly Revenue", value: `₹${Number(kpis.estMonthly).toLocaleString("en-IN")}`, icon: TrendingUp, color: NEON_PURPLE },
        ];

        if (!isChartReady) {
            return (
                <div className="flex h-96 items-center justify-center text-muted-foreground">
                    <div className="animate-pulse flex items-center gap-2">
                        <PieChart className="w-5 h-5 animate-spin" />
                        <span>Loading Analytics Engine...</span>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {/* Header */}
                <div>
                    <h1 className="font-display text-3xl font-bold text-foreground">Analytics</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Insights from {data.length} transactions · Jan 28 – Feb 16, 2026
                    </p>
                </div>

                {/* KPI Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {kpiCards.map((k, i) => (
                        <motion.div
                            key={k.label}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.07 }}
                            className="glass rounded-2xl p-5"
                            style={{ borderTop: `2px solid ${k.color}` }}
                        >
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-xl mb-3"
                                style={{ background: bg(k.color, 0.15) }}
                            >
                                <k.icon className="h-5 w-5" style={{ color: k.color }} />
                            </div>
                            <p className="font-display text-2xl font-bold text-foreground">{k.value}</p>
                            <p className="text-sm text-muted-foreground">{k.label}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Revenue Trend */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass rounded-2xl p-6"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <h3 className="font-display font-semibold text-foreground">Daily Revenue Trend</h3>
                    </div>
                    <div style={{ height: 220 }}>
                        <Line
                            data={revenueChart}
                            options={{
                                ...CHART_DEFAULTS,
                                plugins: {
                                    ...CHART_DEFAULTS.plugins,
                                    legend: { display: false },
                                },
                            }}
                        />
                    </div>
                </motion.div>

                {/* Peak Hours */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="glass rounded-2xl p-6"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <Clock className="h-4 w-4" style={{ color: NEON_CYAN }} />
                        <h3 className="font-display font-semibold text-foreground">Peak Hours Analysis</h3>
                        <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                            Peak: {kpis.peakHour?.[0]}:00 ({kpis.peakHour?.[1]} sessions)
                        </span>
                    </div>
                    <div style={{ height: 230 }}>
                        <Bar
                            data={peakChart}
                            options={{
                                ...CHART_DEFAULTS,
                                scales: dualYScales,
                            }}
                        />
                    </div>
                </motion.div>

                {/* Bottom row: 3 charts */}
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Customer Type */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="glass rounded-2xl p-6 flex flex-col"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <Users className="h-4 w-4" style={{ color: NEON_PURPLE }} />
                            <h3 className="font-display font-semibold text-foreground text-sm">Customer Types</h3>
                        </div>
                        <div className="flex-1" style={{ height: 200 }}>
                            <Doughnut data={customerChart} options={donutOptions} />
                        </div>
                    </motion.div>

                    {/* Service Breakdown */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="glass rounded-2xl p-6 lg:col-span-1 flex flex-col"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <PieChart className="h-4 w-4" style={{ color: NEON_PINK }} />
                            <h3 className="font-display font-semibold text-foreground text-sm">Service Revenue</h3>
                        </div>
                        <div className="flex-1" style={{ height: 200 }}>
                            <Bar
                                data={serviceChart}
                                options={{
                                    ...CHART_DEFAULTS,
                                    indexAxis: "y" as const,
                                    scales: {
                                        ...dualYScales,
                                        x: dualYScales.y,
                                        x1: dualYScales.y1,
                                        y: { ...CHART_DEFAULTS.scales.x },
                                    },
                                    plugins: {
                                        ...CHART_DEFAULTS.plugins,
                                        legend: { ...CHART_DEFAULTS.plugins.legend, position: "bottom" as const },
                                    },
                                }}
                            />
                        </div>
                    </motion.div>

                    {/* Payment Methods */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="glass rounded-2xl p-6 flex flex-col"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <DollarSign className="h-4 w-4" style={{ color: NEON_ORANGE }} />
                            <h3 className="font-display font-semibold text-foreground text-sm">Payment Methods</h3>
                        </div>
                        <div className="flex-1" style={{ height: 200 }}>
                            <Doughnut data={paymentChart} options={donutOptions} />
                        </div>
                    </motion.div>
                </div>

                {/* Summary insight strip */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 }}
                    className="glass rounded-2xl p-4 border border-primary/20 bg-primary/5 text-sm text-muted-foreground"
                >
                    💡 <strong className="text-foreground">AI Insight:</strong> Your busiest hour is{" "}
                    <span className="text-primary font-semibold">{kpis.peakHour ? kpis.peakHour[0] : "-"}:00</span>. VIP customers
                    generate the highest per-session revenue. Estimated monthly revenue projection is{" "}
                    <span className="text-green-400 font-semibold">₹{Number(kpis.estMonthly || 0).toLocaleString("en-IN")}</span>.
                </motion.div>
            </div>
        );
    } catch (err: any) {
        return (
            <div className="p-8 glass rounded-2xl border border-destructive/50 text-destructive text-sm font-mono whitespace-pre-wrap">
                <h2 className="text-lg font-bold mb-4">Analytics Crash</h2>
                {err.message}
                {"\n"}
                {err.stack}
            </div>
        );
    }
}
