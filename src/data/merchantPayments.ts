/**
 * merchantPayments.ts — 500 synthetic merchant payment records
 * Used by: MerchantDashboard > Payments tab, TaxAdvisorChat
 *
 * Fields:
 *  id               — unique payment ID
 *  date             — ISO date string (Jan–Dec 2025)
 *  sessionId        — linked session
 *  customerId       — anonymised customer
 *  serviceType      — gym | ev | parking | coworking | wifi | spa | vending
 *  amountINR        — payment amount in rupees
 *  gstRate          — applicable GST % (5 | 12 | 18)
 *  gstAmountINR     — GST collected on this transaction
 *  baseAmountINR    — amount before GST
 *  paymentMethod    — wallet | razorpay | upi
 *  status           — paid | refunded | pending
 *  hsn              — HSN / SAC code for GST
 */

export interface MerchantPayment {
    id: string;
    date: string;
    sessionId: string;
    customerId: string;
    serviceType: string;
    amountINR: number;
    gstRate: number;
    gstAmountINR: number;
    baseAmountINR: number;
    paymentMethod: string;
    status: string;
    hsn: string;
}

const SERVICES: Array<{ type: string; gst: number; hsn: string; minINR: number; maxINR: number }> = [
    { type: "gym", gst: 18, hsn: "999312", minINR: 20, maxINR: 300 },
    { type: "ev", gst: 5, hsn: "998714", minINR: 30, maxINR: 200 },
    { type: "parking", gst: 18, hsn: "996521", minINR: 10, maxINR: 150 },
    { type: "coworking", gst: 18, hsn: "997212", minINR: 50, maxINR: 500 },
    { type: "wifi", gst: 18, hsn: "998431", minINR: 15, maxINR: 100 },
    { type: "spa", gst: 18, hsn: "999314", minINR: 80, maxINR: 600 },
    { type: "vending", gst: 12, hsn: "211069", minINR: 10, maxINR: 80 },
];

const METHODS = ["wallet", "razorpay", "upi"] as const;
const STATUSES = ["paid", "paid", "paid", "paid", "refunded", "pending"] as const;

function rnd(min: number, max: number) {
    return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

function randomDate(): string {
    const month = Math.floor(Math.random() * 12) + 1; // Jan–Dec 2025
    const daysInMonth = new Date(2025, month, 0).getDate();
    const day = Math.floor(Math.random() * daysInMonth) + 1;
    const hour = Math.floor(Math.random() * 16) + 7;
    const min = Math.floor(Math.random() * 60);
    return `2025-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(min)}:00+05:30`;
}

// Deterministic seed for reproducibility
const seed = 42;
function seededRandom(index: number): number {
    const x = Math.sin(seed + index) * 10000;
    return x - Math.floor(x);
}

export const merchantPayments: MerchantPayment[] = Array.from({ length: 500 }, (_, i) => {
    const svcIndex = Math.floor(seededRandom(i * 7) * SERVICES.length);
    const svc = SERVICES[svcIndex];
    const amountINR = rnd(svc.minINR, svc.maxINR);
    const gstRate = svc.gst;
    const baseAmount = Math.round((amountINR / (1 + gstRate / 100)) * 100) / 100;
    const gstAmount = Math.round((amountINR - baseAmount) * 100) / 100;
    const methodIndex = Math.floor(seededRandom(i * 13) * METHODS.length);
    const statusIndex = Math.floor(seededRandom(i * 17) * STATUSES.length);

    return {
        id: `pay_${String(i + 1).padStart(4, "0")}`,
        date: randomDate(),
        sessionId: `sess_${String(i + 1).padStart(4, "0")}`,
        customerId: `cust_${String(Math.floor(seededRandom(i * 3) * 120) + 1).padStart(4, "0")}`,
        serviceType: svc.type,
        amountINR,
        gstRate,
        gstAmountINR: gstAmount,
        baseAmountINR: baseAmount,
        paymentMethod: METHODS[methodIndex],
        status: STATUSES[statusIndex],
        hsn: svc.hsn,
    };
});

export default merchantPayments;
