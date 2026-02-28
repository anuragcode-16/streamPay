/**
 * TaxAdvisorChat.tsx — Gemini-powered Indian Tax Advisor Chatbot
 *
 * GUARDRAIL: Strictly responds ONLY to Indian tax, GST, ITR, TDS,
 * MSME compliance, and accounting questions for merchants.
 * Any off-topic query is politely deflected.
 *
 * Context injected into every prompt:
 *  - Merchant's 500 payment records summary (total revenue, GST collected, by service)
 *  - Current financial year (FY 2024–25)
 *  - Applicable Indian tax rules for service businesses
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Send, Bot, User, Loader2, FileText, AlertTriangle,
    TrendingUp, IndianRupee, Shield, ChevronDown,
} from "lucide-react";
import { merchantPayments, MerchantPayment } from "@/data/merchantPayments";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

// ── Compute summary from the 500 records ─────────────────────────────────────
function computeSummary(payments: MerchantPayment[]) {
    const paid = payments.filter(p => p.status === "paid");
    const totalRev = paid.reduce((s, p) => s + p.baseAmountINR, 0);
    const totalGST = paid.reduce((s, p) => s + p.gstAmountINR, 0);
    const totalBill = paid.reduce((s, p) => s + p.amountINR, 0);

    const byService: Record<string, { rev: number; gst: number; count: number }> = {};
    paid.forEach(p => {
        if (!byService[p.serviceType]) byService[p.serviceType] = { rev: 0, gst: 0, count: 0 };
        byService[p.serviceType].rev += p.baseAmountINR;
        byService[p.serviceType].gst += p.gstAmountINR;
        byService[p.serviceType].count += 1;
    });

    const byMonth: Record<string, number> = {};
    paid.forEach(p => {
        const m = p.date.slice(0, 7);
        byMonth[m] = (byMonth[m] || 0) + p.amountINR;
    });

    const refunds = payments.filter(p => p.status === "refunded").reduce((s, p) => s + p.amountINR, 0);

    return { totalRev, totalGST, totalBill, byService, byMonth, refunds, count: paid.length };
}

const summary = computeSummary(merchantPayments);

// ── System context injected into every Gemini call ───────────────────────────
function buildSystemPrompt(): string {
    const svcLines = Object.entries(summary.byService)
        .map(([svc, d]) => `  - ${svc}: ₹${d.rev.toFixed(0)} base revenue, ₹${d.gst.toFixed(0)} GST collected (${d.count} txns)`)
        .join("\n");

    const monthLines = Object.entries(summary.byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, amt]) => `  - ${m}: ₹${amt.toFixed(0)}`)
        .join("\n");

    return `You are a strict Indian Tax Compliance Advisor AI embedded in the Stream Pay merchant dashboard.

MERCHANT FINANCIAL SUMMARY (FY 2024-25):
- Total transactions (paid): ${summary.count}
- Gross billing (incl. GST): ₹${summary.totalBill.toFixed(2)}
- Base revenue (excl. GST):  ₹${summary.totalRev.toFixed(2)}
- Total GST collected:       ₹${summary.totalGST.toFixed(2)}
- Total refunds issued:      ₹${summary.refunds.toFixed(2)}

Revenue by service type:
${svcLines}

Monthly revenue:
${monthLines}

YOUR ROLE:
You help this merchant with:
1. GST filing (GSTR-1, GSTR-3B, GSTR-9) under Indian GST law
2. Income Tax Return (ITR-3 / ITR-4 for businesses)
3. TDS obligations and deductions
4. MSME/Startup tax benefits and exemptions
5. Section 44AD/44ADA presumptive taxation
6. Legitimate expense deductions to reduce tax liability
7. Advance tax payment schedule
8. GST registration thresholds and compliance
9. HSN/SAC code classification for their services
10. How to maximize profit through legal tax optimization

GUARDRAIL (STRICTLY ENFORCED):
- If the user asks ANYTHING unrelated to Indian taxes, GST, ITR, TDS, accounting, or business finance compliance, respond with:
  "I'm your dedicated Indian Tax Advisor. I can only help with GST filing, income tax, TDS, and business compliance questions. Please ask me something related to your merchant taxes."
- Never answer questions about politics, entertainment, coding, medicine, general chat, or any non-tax topic.
- Always cite the relevant Indian law section, GST Act, or CBDT circular when giving advice.
- Add a disclaimer: "This is AI-generated guidance. Please verify with a CA before filing."

Provide clear, actionable advice with specific numbers from the merchant's data above.`;
}

// ── Suggested quick questions ─────────────────────────────────────────────────
const QUICK_QUESTIONS = [
    "How much GST do I need to file this quarter?",
    "Am I eligible for Section 44ADA presumptive taxation?",
    "What expenses can I deduct to reduce my taxable income?",
    "Which ITR form should I file?",
    "How do I minimise GST liability legally?",
    "What is my advance tax liability this FY?",
    "Should I register under Composition Scheme?",
    "What TDS do I need to deduct on payments?",
];

interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

export default function TaxAdvisorChat() {
    const [messages, setMessages] = useState<Message[]>([{
        role: "assistant",
        content: `👋 Namaste! I'm your **Indian Tax Compliance Advisor** powered by Gemini AI.\n\nI've analysed your **${summary.count} paid transactions** from FY 2024-25:\n- 💰 Gross Revenue: **₹${summary.totalBill.toFixed(0)}**\n- 🏛️ GST Collected: **₹${summary.totalGST.toFixed(0)}**\n- 📊 Net Revenue: **₹${summary.totalRev.toFixed(0)}**\n\nAsk me anything about GST filing, ITR, TDS, or how to legally minimize your tax!`,
        timestamp: new Date(),
    }]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [showSuggested, setShowSuggested] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    async function sendMessage(text?: string) {
        const msg = (text || input).trim();
        if (!msg || loading) return;
        setInput("");
        setShowSuggested(false);

        const userMsg: Message = { role: "user", content: msg, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            // Build conversation history for Gemini
            const history = messages.map(m => ({
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: m.content }],
            }));

            const body = {
                system_instruction: { parts: [{ text: buildSystemPrompt() }] },
                contents: [
                    ...history,
                    { role: "user", parts: [{ text: msg }] },
                ],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 1024,
                    topP: 0.8,
                },
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                ],
            };

            const res = await fetch(GEMINI_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();

            if (!res.ok) {
                const errMsg = data?.error?.message || "Gemini API error";
                throw new Error(errMsg);
            }

            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
                || "I couldn't generate a response. Please try again.";

            setMessages(prev => [...prev, { role: "assistant", content: reply, timestamp: new Date() }]);
        } catch (err: any) {
            setMessages(prev => [...prev, {
                role: "assistant",
                content: `⚠️ Error: ${err.message}. Please check your API key or try again.`,
                timestamp: new Date(),
            }]);
        } finally {
            setLoading(false);
        }
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    // Simple markdown renderer (bold, bullet, newlines)
    function renderMarkdown(text: string) {
        const lines = text.split("\n");
        return lines.map((line, i) => {
            // Bold: **text**
            const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
                part.startsWith("**") && part.endsWith("**")
                    ? <strong key={j} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
                    : <span key={j}>{part}</span>
            );
            return (
                <p key={i} className={`${line.startsWith("-") || line.startsWith("•") ? "ml-3" : ""} ${i > 0 ? "mt-1" : ""}`}>
                    {parts}
                </p>
            );
        });
    }

    return (
        <div className="flex flex-col h-[75vh] glass rounded-2xl overflow-hidden">
            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 border-b border-border p-4 bg-primary/5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
                    <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                    <h3 className="font-display font-bold text-foreground">Indian Tax Advisor AI</h3>
                    <p className="text-xs text-muted-foreground">Powered by Gemini · GST · ITR · TDS · MSME Compliance</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs font-medium text-green-400">Online</span>
                </div>
            </div>

            {/* ── KPI strip ──────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2 border-b border-border px-4 py-3 bg-card/40">
                {[
                    { label: "Gross Revenue", value: `₹${(summary.totalBill / 1000).toFixed(1)}K`, icon: IndianRupee, color: "text-green-400" },
                    { label: "GST Collected", value: `₹${(summary.totalGST / 1000).toFixed(1)}K`, icon: Shield, color: "text-blue-400" },
                    { label: "Net Revenue", value: `₹${(summary.totalRev / 1000).toFixed(1)}K`, icon: TrendingUp, color: "text-primary" },
                ].map(kpi => (
                    <div key={kpi.label} className="text-center">
                        <kpi.icon className={`h-4 w-4 mx-auto mb-0.5 ${kpi.color}`} />
                        <p className={`font-bold text-sm ${kpi.color}`}>{kpi.value}</p>
                        <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Messages ───────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AnimatePresence initial={false}>
                    {messages.map((msg, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.2 }}
                            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                        >
                            {/* Avatar */}
                            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${msg.role === "assistant" ? "bg-primary/20" : "bg-secondary"}`}>
                                {msg.role === "assistant" ? <Bot className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-muted-foreground" />}
                            </div>

                            {/* Bubble */}
                            <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "assistant"
                                    ? "bg-card border border-border text-foreground rounded-tl-none"
                                    : "bg-primary text-primary-foreground rounded-tr-none"
                                }`}>
                                {msg.role === "assistant" ? renderMarkdown(msg.content) : <p>{msg.content}</p>}
                                <p className={`mt-2 text-xs ${msg.role === "assistant" ? "text-muted-foreground" : "text-primary-foreground/60"}`}>
                                    {msg.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Typing indicator */}
                {loading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                            <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-none bg-card border border-border px-4 py-3">
                            {[0, 1, 2].map(i => (
                                <span key={i} className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Suggested questions */}
                <AnimatePresence>
                    {showSuggested && messages.length === 1 && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <button
                                onClick={() => setShowSuggested(s => !s)}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 hover:text-foreground"
                            >
                                <ChevronDown className="h-3 w-3" />Suggested questions
                            </button>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {QUICK_QUESTIONS.map(q => (
                                    <button
                                        key={q}
                                        onClick={() => sendMessage(q)}
                                        className="text-left rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-all"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div ref={bottomRef} />
            </div>

            {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
            <div className="px-4 py-2 bg-yellow-500/5 border-t border-yellow-500/20">
                <p className="text-xs text-yellow-400/80 flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    AI-generated guidance only. Verify with a Chartered Accountant before filing. Not a substitute for professional tax advice.
                </p>
            </div>

            {/* ── Input bar ──────────────────────────────────────────────────────── */}
            <div className="border-t border-border p-3 bg-card/60">
                <div className="flex gap-2 items-end">
                    <div className="flex flex-1 items-end gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5">
                        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground mb-0.5" />
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKey}
                            placeholder="Ask about GST, ITR, TDS, deductions… (Shift+Enter for new line)"
                            rows={1}
                            style={{ resize: "none" }}
                            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-24 overflow-y-auto"
                        />
                    </div>
                    <button
                        onClick={() => sendMessage()}
                        disabled={loading || !input.trim()}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:neon-glow disabled:opacity-40 transition-all"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                </div>
                <p className="mt-1 text-center text-xs text-muted-foreground">
                    Strictly for Indian tax compliance · Off-topic questions are blocked
                </p>
            </div>
        </div>
    );
}
