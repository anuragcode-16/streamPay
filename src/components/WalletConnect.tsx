/**
 * WalletConnect.tsx — MetaMask / Coinbase Wallet connector
 *
 * Connects the customer's EVM wallet (MetaMask / Coinbase Wallet),
 * displays their address (truncated) and USDC balance on Base Sepolia.
 */
import { useState, useEffect, useCallback } from "react";
import { Wallet, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// Base Sepolia chain id = 84532 (hex 0x14a34)
const BASE_SEPOLIA_CHAIN_ID = "0x14a34";
const BASESCAN_URL = "https://sepolia.basescan.org/address/";

export interface WalletState {
    address: string | null;
    usdcBalance: string | null;
    connected: boolean;
}

interface Props {
    onWalletChange: (state: WalletState) => void;
}

export default function WalletConnect({ onWalletChange }: Props) {
    const { toast } = useToast();
    const [address, setAddress] = useState<string | null>(null);
    const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBalance = useCallback(async (addr: string) => {
        try {
            const r = await fetch(`${API_URL}/api/usdc-balance/${addr}`);
            const d = await r.json();
            setUsdcBalance(d.usdcBalance ?? null);
            onWalletChange({ address: addr, usdcBalance: d.usdcBalance, connected: true });
        } catch {
            setUsdcBalance(null);
        }
    }, [onWalletChange]);

    // Auto-reconnect if already connected
    useEffect(() => {
        const tryReconnect = async () => {
            const eth = (window as any).ethereum;
            if (!eth) return;
            try {
                const accounts: string[] = await eth.request({ method: "eth_accounts" });
                if (accounts.length > 0) {
                    setAddress(accounts[0]);
                    await fetchBalance(accounts[0]);
                }
            } catch { /* not connected */ }
        };
        tryReconnect();
    }, [fetchBalance]);

    async function connect() {
        const eth = (window as any).ethereum;
        if (!eth) {
            setError("MetaMask not found — install MetaMask or Coinbase Wallet extension");
            return;
        }
        setLoading(true); setError(null);
        try {
            // Request accounts
            const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });

            // Switch to Base Sepolia
            try {
                await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }] });
            } catch (switchErr: any) {
                if (switchErr.code === 4902) {
                    await eth.request({
                        method: "wallet_addEthereumChain",
                        params: [{
                            chainId: BASE_SEPOLIA_CHAIN_ID,
                            chainName: "Base Sepolia Testnet",
                            rpcUrls: ["https://sepolia.base.org"],
                            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                            blockExplorerUrls: ["https://sepolia.basescan.org"],
                        }],
                    });
                }
            }

            const addr = accounts[0].toLowerCase();
            setAddress(addr);
            await fetchBalance(addr);
            toast({ title: "🔵 Wallet connected!", description: `${addr.slice(0, 6)}…${addr.slice(-4)} on Base Sepolia` });
        } catch (e: any) {
            setError(e.message?.includes("rejected") ? "Connection rejected by user" : e.message);
        } finally { setLoading(false); }
    }

    function truncate(addr: string) {
        return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    }

    if (!address) {
        return (
            <div className="flex flex-col gap-2">
                <button
                    onClick={connect}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-xl bg-[#0052ff] px-5 py-3 font-bold text-white text-sm hover:bg-[#0040cc] active:scale-95 transition-all disabled:opacity-60"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    {loading ? "Connecting…" : "Connect Wallet"}
                </button>
                {error && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />{error}
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    Requires MetaMask or Coinbase Wallet with Base Sepolia USDC.<br />
                    Get free test USDC: <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">faucet.circle.com</a>
                </p>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 rounded-2xl border border-[#0052ff]/30 bg-[#0052ff]/5 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-[#0052ff] shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                    {truncate(address)}
                    <a href={`${BASESCAN_URL}${address}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </p>
                <p className="text-xs text-muted-foreground">
                    {usdcBalance !== null ? `${parseFloat(usdcBalance).toFixed(4)} USDC` : "Loading balance…"} · Base Sepolia
                </p>
            </div>
            <button onClick={() => fetchBalance(address)} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
        </div>
    );
}
