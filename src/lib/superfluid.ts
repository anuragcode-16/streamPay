import { ethers } from "ethers";

// Superfluid on Polygon Mumbai testnet (now Amoy)
const SUPERFLUID_HOST = "0x22ff293e14F1EC3A09B137e9e06084AFd63adDF9";
const CFAV1_ADDRESS = "0xEd6BcbF6907D4feEEe8a8875543249bEa9D308E8";
const fDAIx_ADDRESS = "0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f"; // fake DAI super token on testnet

// Minimal CFA ABI for creating/deleting flows
const CFA_ABI = [
  "function createFlow(address token, address receiver, int96 flowRate, bytes ctx) external returns (bytes memory newCtx)",
  "function deleteFlow(address token, address sender, address receiver, bytes ctx) external returns (bytes memory newCtx)",
  "function getFlow(address token, address sender, address receiver) external view returns (uint256 timestamp, int96 flowRate, uint256 deposit, uint256 owedDeposit)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export interface StreamInfo {
  timestamp: number;
  flowRate: bigint;
  deposit: bigint;
  owedDeposit: bigint;
}

export class SuperfluidService {
  private provider: ethers.providers.Web3Provider | null = null;
  private signer: ethers.Signer | null = null;

  async connect(): Promise<string> {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      throw new Error("Please install MetaMask or another Web3 wallet");
    }

    this.provider = new ethers.providers.Web3Provider((window as any).ethereum);

    // Request Polygon Amoy testnet
    try {
      await (window as any).ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13882" }], // 80002 = Amoy
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await (window as any).ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x13882",
            chainName: "Polygon Amoy Testnet",
            nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
            rpcUrls: ["https://rpc-amoy.polygon.technology"],
            blockExplorerUrls: ["https://amoy.polygonscan.com"],
          }],
        });
      }
    }

    this.signer = this.provider.getSigner();
    return await this.signer.getAddress();
  }

  async getBalance(): Promise<string> {
    if (!this.provider || !this.signer) throw new Error("Not connected");
    const address = await this.signer.getAddress();
    const token = new ethers.Contract(fDAIx_ADDRESS, ERC20_ABI, this.provider);
    const balance = await token.balanceOf(address);
    return ethers.utils.formatEther(balance);
  }

  async startStream(receiverAddress: string, flowRatePerSecond: string): Promise<string> {
    if (!this.signer) throw new Error("Not connected");

    const cfa = new ethers.Contract(CFAV1_ADDRESS, CFA_ABI, this.signer);
    const tx = await cfa.createFlow(
      fDAIx_ADDRESS,
      receiverAddress,
      ethers.utils.parseUnits(flowRatePerSecond, 0), // flow rate in wei/sec
      "0x"
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async stopStream(receiverAddress: string): Promise<string> {
    if (!this.signer) throw new Error("Not connected");
    const senderAddress = await this.signer.getAddress();

    const cfa = new ethers.Contract(CFAV1_ADDRESS, CFA_ABI, this.signer);
    const tx = await cfa.deleteFlow(
      fDAIx_ADDRESS,
      senderAddress,
      receiverAddress,
      "0x"
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async getFlow(senderAddress: string, receiverAddress: string): Promise<StreamInfo> {
    if (!this.provider) throw new Error("Not connected");
    const cfa = new ethers.Contract(CFAV1_ADDRESS, CFA_ABI, this.provider);
    const [timestamp, flowRate, deposit, owedDeposit] = await cfa.getFlow(
      fDAIx_ADDRESS,
      senderAddress,
      receiverAddress
    );
    return { timestamp, flowRate, deposit, owedDeposit };
  }

  async getAddress(): Promise<string> {
    if (!this.signer) throw new Error("Not connected");
    return this.signer.getAddress();
  }
}

export const superfluidService = new SuperfluidService();
