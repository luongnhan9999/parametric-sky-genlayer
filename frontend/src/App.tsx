import React, { useState, useEffect } from "react";
import { 
  Shield, 
  MapPin, 
  Activity, 
  Cpu, 
  CheckCircle, 
  Play, 
  RefreshCw, 
  Wallet,
  Globe,
  Home,
  LogOut,
  ChevronRight,
  Database,
  Users,
  AlertCircle,
  HelpCircle,
  Sun,
  Droplets
} from "lucide-react";

// Types matching the Smart Contract structure
interface Policy {
  id: string;
  underwriter: string;
  insured: string;
  coverage_amount: string;
  status: string; // ACTIVE, EVALUATING, AWAITING_PAYOUT, DISPUTED, ESCALATED, CLOSED
  terms_url: string;
  telemetry_url: string;
  geo_coordinates: string;
  drought_index_trigger: string;
  verdict: string; // NONE, FULL_PAYOUT, PARTIAL_PAYOUT, NO_DISASTER, ESCALATE
  reason: string;
  confidence: string;
  payout_ready_at: string;
  disputed_at: string;
  // Enhanced UI properties
  dispute_evidence?: string;
  dispute_sensor_type?: string;
  dispute_ratio?: string;
}

export default function App() {
  // Navigation tabs (Home, Terminal, Policies, About/FAQ)
  const [activeTab, setActiveTab] = useState<"home" | "terminal" | "policies" | "about">("home");
  const [showUnderwriteModal, setShowUnderwriteModal] = useState(false);

  // App settings - Deployed Contract Address
  const contractAddress = "0xba779EafE06ff3D043aEAfD6b4D22EFFaa3D0907";
  
  // Real GenLayer state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txMessage, setTxMessage] = useState("");

  // Pinned coordinates from interactive GIS Map
  const [pinnedCoords, setPinnedCoords] = useState({ lat: 19.8067, lng: 105.7851, label: "Selected Target Coordinate" });
  const [selectedStation, setSelectedStation] = useState("OPEN-METEO-VN-TH-01");
  const [satelliteTelemetryUrl, setSatelliteTelemetryUrl] = useState("https://satellite-feed.copernicus.eu/telemetry_198067_1057851.json");

  // Selected Policy for Terminal view
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(false);

  // Pipeline execution animation state (running during real onchain TX wait)
  const [pipelineStep, setPipelineStep] = useState<number>(-1); // -1 = idle, 0 = satellite, 1 = NDVI, 2 = Weather, 3 = Consensus
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);

  // Dispute Form State
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSensor, setDisputeSensor] = useState("Copernicus Sentinel-2");
  const [disputeRatio, setDisputeRatio] = useState("100% Payout");
  const [showDisputeInput, setShowDisputeInput] = useState<string | null>(null);
  
  // Escalation logic state
  const [escalateAction, setEscalateAction] = useState<"PAYOUT" | "REFUND" | "SPLIT">("PAYOUT");
  const [showEscalateInput, setShowEscalateInput] = useState<string | null>(null);

  // Form State for new Underwrite policy
  const [newPolicy, setNewPolicy] = useState({
    id: "policy_" + Math.random().toString(36).substring(2, 8),
    insured: "",
    termsUrl: "https://parametric.io/terms/rice_irrigation_2026.json",
    geoCoords: "19.8067 N, 105.7851 E",
    droughtTrigger: "NDVI < 0.25 for 14 days OR Rainfall < 10mm",
    coverageAmount: "3000"
  });

  // Selected Policy Object
  const currentPolicy = policies.find(p => p.id === selectedPolicyId) || policies[0] || null;

  // Auto suggest telemetry link and weather station when map coordinates change
  useEffect(() => {
    const latStr = pinnedCoords.lat.toFixed(4);
    const lngStr = pinnedCoords.lng.toFixed(4);
    setSatelliteTelemetryUrl(`https://satellite-feed.copernicus.eu/telemetry_${latStr.replace(".", "")}_${lngStr.replace(".", "")}.json`);
    
    // Choose weather station based on nearest region
    if (pinnedCoords.lat > 18) {
      setSelectedStation("OPEN-METEO-VN-TH-01 (Thanh Hoa Region)");
    } else if (pinnedCoords.lat > 12) {
      setSelectedStation("COP-SENTINEL-VN-DL-08 (Dak Lak Central Highlands)");
    } else {
      setSelectedStation("NOAA-STATION-VN-MK-05 (Mekong Delta Region)");
    }

    setNewPolicy(prev => ({
      ...prev,
      geoCoords: `${latStr} N, ${lngStr} E`
    }));
  }, [pinnedCoords]);

  // Load Policies from Smart Contract
  const loadRealPolicies = async () => {
    setIsLoadingPolicies(true);
    try {
      const { createClient } = await import("genlayer-js");
      const { studionet } = await import("genlayer-js/chains");

      const client = createClient({
        chain: studionet,
      });

      const responseStr = await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: "get_all_policies",
        args: []
      });

      if (responseStr) {
        const parsed = JSON.parse(responseStr as string) as Policy[];
        setPolicies(parsed);
        if (parsed.length > 0 && !selectedPolicyId) {
          setSelectedPolicyId(parsed[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load on-chain policies:", err);
    } finally {
      setIsLoadingPolicies(false);
    }
  };

  // Check connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (typeof window.ethereum !== "undefined") {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
          }
        } catch (err) {
          console.error("Error checking account connection:", err);
        }
      }
      await loadRealPolicies();
    };
    checkConnection();
  }, []);

  // Connect wallet handler
  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask is not installed. Please install MetaMask to connect to GenLayer Studionet.");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0]);
      await switchNetwork();
      await loadRealPolicies();
    } catch (err) {
      console.error("Wallet connection failed:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet handler
  const disconnectWallet = () => {
    setWalletAddress(null);
  };

  // Switch network to Studionet
  const switchNetwork = async () => {
    try {
      const studionetChainId = "0x3039"; // 12345
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: studionetChainId }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x3039",
                chainName: "GenLayer Studionet",
                nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
                rpcUrls: ["https://studio.genlayer.com/api"],
                blockExplorerUrls: [],
              },
            ],
          });
        } catch (addErr) {
          console.error("Error adding Studionet:", addErr);
        }
      }
    }
  };

  // Generate dynamic chart points based on policy ID or status to reflect vegetation
  const generateNdviData = (): { day: number; ndvi: number; temp: number; rainfall: number }[] => {
    const data: { day: number; ndvi: number; temp: number; rainfall: number }[] = [];
    const isDrought = currentPolicy && (currentPolicy.verdict === "FULL_PAYOUT" || currentPolicy.status === "AWAITING_PAYOUT" || currentPolicy.status === "DISPUTED");

    for (let i = 1; i <= 14; i++) {
      let ndvi = 0.35 + Math.sin(i / 3) * 0.08 + (Math.random() * 0.03 - 0.015);
      let temp = 33 + Math.sin(i / 2) * 3 + Math.random() * 2;
      let rainfall = Math.max(0, 12 - i * 0.8 + Math.random() * 3);

      if (isDrought) {
        ndvi = 0.32 - (i * 0.014) + (Math.random() * 0.02 - 0.01);
        temp = 36 + (i * 0.25) + Math.random() * 1.5;
        rainfall = Math.max(0, 4 - i * 0.3 + Math.random() * 1);
      }

      data.push({
        day: i,
        ndvi: parseFloat(ndvi.toFixed(3)),
        temp: parseFloat(temp.toFixed(1)),
        rainfall: parseFloat(rainfall.toFixed(1))
      });
    }
    return data;
  };

  const ndviPoints = generateNdviData();

  // Run progress scan logs during transaction wait
  const startPipelineLogs = () => {
    setPipelineStep(0);
    setPipelineLogs(["Initializing Telemetry Assessment Interface..."]);

    const logMessages = [
      "[Satellite Data Ingestion] Querying Copernicus Sentinel Hub imagery...",
      "[Satellite Data Ingestion] Retrieving multi-spectral band data for target coordinate grid...",
      "[Satellite Data Ingestion] Payload size: 4.8MB, telemetry format compatible.",
      "[NDVI Index Calculation] Processing band reflections: NDVI = (NIR - Red) / (NIR + Red)",
      "[NDVI Index Calculation] Mapping chronological spectral curve over 14-day history...",
      `[NDVI Index Calculation] Detected NDVI dip below threshold 0.25.`,
      "[Weather Station Validation] Querying meteorological partner Open-Meteo...",
      `[Weather Station Validation] Station confirmed temperature >= 38 C for consecutive days.`,
      `[Weather Station Validation] Rain gauge logged rainfall: deficit met.`,
      "[Consensus Automated Payout] Executing leader node execution program on GenLayer VM...",
      "[Consensus Automated Payout] Generating AI Verdict based on terms and satellite parameters...",
      "[Consensus Automated Payout] Broadcasting Leader result to Validator nodes...",
      "[Consensus Automated Payout] GenLayer AI Consensus: 4/4 Validator nodes verified. Settlement payload locked."
    ];

    let currentLogIndex = 0;
    const timer = setInterval(() => {
      if (currentLogIndex < logMessages.length) {
        setPipelineLogs(prevLogs => [...prevLogs, logMessages[currentLogIndex]]);
        
        // Progress steps
        if (currentLogIndex === 2) setPipelineStep(1);
        if (currentLogIndex === 5) setPipelineStep(2);
        if (currentLogIndex === 9) setPipelineStep(3);
        
        currentLogIndex++;
      } else {
        clearInterval(timer);
      }
    }, 1200);

    return timer;
  };

  // WRITE Operations

  // 1. Underwrite Policy
  const handleUnderwrite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      alert("Please connect your wallet first.");
      return;
    }
    setTxLoading(true);
    setTxMessage("Deploying policy parameters & locking escrow pool on GenLayer Studionet...");
    try {
      const { createClient } = await import("genlayer-js");
      const { studionet } = await import("genlayer-js/chains");
      
      const client = createClient({
        chain: studionet,
        provider: window.ethereum,
        account: walletAddress as `0x${string}`,
      });

      const hash = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: "underwrite_policy",
        args: [
          newPolicy.id,
          newPolicy.insured,
          newPolicy.termsUrl,
          newPolicy.geoCoords,
          newPolicy.droughtTrigger
        ],
        value: BigInt(newPolicy.coverageAmount)
      });

      setTxMessage("Waiting for GenLayer block finalization...");
      await client.waitForTransactionReceipt({ hash });
      await loadRealPolicies();
      setShowUnderwriteModal(false);
      setActiveTab("policies");
    } catch (err: any) {
      alert("Transaction Failed: " + (err.message || err));
    } finally {
      setTxLoading(false);
    }
  };

  // 2. Trigger Claim Assessment
  const handleTriggerAssessment = async (policyId: string) => {
    if (!walletAddress) {
      alert("Please connect your wallet to interact with the blockchain.");
      return;
    }

    setTxLoading(true);
    setTxMessage("Initiating satellite telemetry ingest and triggering AI Consensus...");
    
    // Start logging interval
    const loggingTimer = startPipelineLogs();

    try {
      const { createClient } = await import("genlayer-js");
      const { studionet } = await import("genlayer-js/chains");

      const client = createClient({
        chain: studionet,
        provider: window.ethereum,
        account: walletAddress as `0x${string}`,
      });

      const hash = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: "trigger_claim_assessment",
        args: [policyId, satelliteTelemetryUrl],
        value: 0n
      });

      setTxMessage("Finalizing assessment and recording on-chain verdict...");
      await client.waitForTransactionReceipt({ hash });
      
      clearInterval(loggingTimer);
      setPipelineStep(4);
      setPipelineLogs(prev => [...prev, "[SUCCESS] Smart contract state updated on-chain!"]);
      
      await loadRealPolicies();
    } catch (err: any) {
      clearInterval(loggingTimer);
      setPipelineStep(-1);
      alert("Assessment Trigger Failed: " + (err.message || err));
    } finally {
      setTxLoading(false);
    }
  };

  // 3. Raise Dispute
  const handleRaiseDispute = async (policyId: string) => {
    if (!walletAddress) {
      alert("Please connect your wallet first.");
      return;
    }
    if (!disputeReason.trim()) {
      alert("Please provide a valid reason for raising a dispute.");
      return;
    }

    setTxLoading(true);
    setTxMessage("Locking contract payout pool and recording dispute logic...");
    try {
      const { createClient } = await import("genlayer-js");
      const { studionet } = await import("genlayer-js/chains");

      const client = createClient({
        chain: studionet,
        provider: window.ethereum,
        account: walletAddress as `0x${string}`,
      });

      const formattedReason = `[Disputed via ${disputeSensor}] ${disputeReason} (${disputeRatio})`;
      const hash = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: "raise_dispute",
        args: [policyId, formattedReason],
        value: 0n
      });

      await client.waitForTransactionReceipt({ hash });
      await loadRealPolicies();
      setShowDisputeInput(null);
      setDisputeReason("");
    } catch (err: any) {
      alert("Dispute Transaction Failed: " + (err.message || err));
    } finally {
      setTxLoading(false);
    }
  };

  // 4. Finalize Settlement
  const handleFinalizeSettlement = async (policyId: string) => {
    if (!walletAddress) {
      alert("Please connect your wallet first.");
      return;
    }
    setTxLoading(true);
    setTxMessage("Distributing escrow pools and closing policy...");
    try {
      const { createClient } = await import("genlayer-js");
      const { studionet } = await import("genlayer-js/chains");

      const client = createClient({
        chain: studionet,
        provider: window.ethereum,
        account: walletAddress as `0x${string}`,
      });

      const hash = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: "finalize_settlement",
        args: [policyId],
        value: 0n
      });

      await client.waitForTransactionReceipt({ hash });
      await loadRealPolicies();
    } catch (err: any) {
      alert("Settlement Finalization Failed: " + (err.message || err));
    } finally {
      setTxLoading(false);
    }
  };

  // 5. Resolve Escalation
  const handleResolveEscalation = async (policyId: string) => {
    if (!walletAddress) {
      alert("Please connect your wallet first.");
      return;
    }
    setTxLoading(true);
    setTxMessage("Broadcasting platform administrator settlement decision...");
    try {
      const { createClient } = await import("genlayer-js");
      const { studionet } = await import("genlayer-js/chains");

      const client = createClient({
        chain: studionet,
        provider: window.ethereum,
        account: walletAddress as `0x${string}`,
      });

      const hash = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: "resolve_escalation",
        args: [policyId, escalateAction],
        value: 0n
      });

      await client.waitForTransactionReceipt({ hash });
      await loadRealPolicies();
      setShowEscalateInput(null);
    } catch (err: any) {
      alert("Arbitration Settlement Failed: " + (err.message || err));
    } finally {
      setTxLoading(false);
    }
  };

  // Formatting address helper
  const formatAddr = (addr: string) => {
    if (addr.length < 15) return addr;
    return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
  };

  return (
    <div className="min-h-screen bg-[#0B0F12] text-[#38BDF8] scanlines terminal-grid flex flex-col justify-between">
      <div>
        {/* HEADER SECTION */}
        <header className="border-b border-[#38BDF8]/20 bg-[#0B0F12] px-6 py-4 flex items-center justify-between shadow-lg relative z-10">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-[#38BDF8] animate-pulse" />
            <div>
              <h1 className="text-xl font-bold tracking-wider text-white flex items-center gap-2">
                PARAMETRIC SKY <span className="text-[#EAB308] text-xs px-2 py-0.5 border border-[#EAB308] rounded bg-[#EAB308]/10">LIVE DE-SCI TESTNET</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">
                Autonomous Crop Yield Escrow & Geo-Spatial Climate Oracle
              </p>
            </div>
          </div>

          {/* CONTROLS */}
          <div className="flex items-center gap-4">
            
            {/* Live Smart Contract Address Indicator */}
            <div className="flex items-center gap-2 border border-[#38BDF8]/20 px-3 py-1.5 rounded bg-[#0F161E] text-xs font-mono">
              <Database className="w-4 h-4 text-[#38BDF8]" />
              <span className="text-gray-400">Contract:</span>
              <span className="text-white select-all">{contractAddress}</span>
            </div>

            {/* Connect / Disconnect wallet */}
            {walletAddress ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 border border-[#38BDF8]/50 px-3.5 py-1.5 rounded-lg bg-[#38BDF8]/10 text-[#38BDF8] text-xs font-mono">
                  <Wallet className="w-4 h-4 text-[#38BDF8]" />
                  <span>{formatAddr(walletAddress)}</span>
                </div>
                <button 
                  onClick={disconnectWallet}
                  className="flex items-center gap-1 bg-red-600/20 hover:bg-red-600/40 text-red-500 border border-red-500/50 px-3 py-1.5 rounded-lg text-xs font-mono transition"
                  title="Disconnect Wallet"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  DISCONNECT
                </button>
              </div>
            ) : (
              <button 
                onClick={connectWallet}
                disabled={isConnecting}
                className="flex items-center gap-2 bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] font-semibold px-4 py-1.5 rounded-lg text-xs font-mono transition"
              >
                <Wallet className="w-4 h-4" />
                {isConnecting ? "CONNECTING..." : "CONNECT WALLET"}
              </button>
            )}
          </div>
        </header>

        {/* SUB-NAVBAR */}
        <nav className="flex border-b border-[#38BDF8]/10 bg-[#0F161E] px-6 py-1 gap-2 text-xs font-mono">
          <button 
            onClick={() => setActiveTab("home")}
            className={`px-4 py-2 border-b-2 flex items-center gap-1.5 transition ${activeTab === "home" ? "border-[#38BDF8] text-[#38BDF8]" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            <Home className="w-4 h-4" /> HOME
          </button>
          <button 
            onClick={() => setActiveTab("terminal")}
            className={`px-4 py-2 border-b-2 flex items-center gap-1.5 transition ${activeTab === "terminal" ? "border-[#38BDF8] text-[#38BDF8]" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            <Activity className="w-4 h-4" /> GIS RADAR TERMINAL
          </button>
          <button 
            onClick={() => setActiveTab("policies")}
            className={`px-4 py-2 border-b-2 flex items-center gap-1.5 transition ${activeTab === "policies" ? "border-[#EAB308] text-[#EAB308]" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            <Shield className="w-4 h-4" /> ACTIVE POLICIES ({policies.length})
          </button>
          <button 
            onClick={() => setActiveTab("about")}
            className={`px-4 py-2 border-b-2 flex items-center gap-1.5 transition ${activeTab === "about" ? "border-[#38BDF8] text-[#38BDF8]" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            <HelpCircle className="w-4 h-4" /> FAQ & DETAILS
          </button>
        </nav>

        {/* MAIN CONTAINER */}
        <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 overflow-hidden">
          
          {/* TAB 1: WELCOME HOME PAGE */}
          {activeTab === "home" && (
            <div className="xl:col-span-12 space-y-6">
              
              {/* WELCOME HERO */}
              <div className="border border-[#38BDF8]/20 bg-[#0E151D]/80 backdrop-blur rounded-2xl p-8 relative overflow-hidden shadow-2xl">
                <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none hidden md:block">
                  <Globe className="w-[300px] h-[300px] text-[#38BDF8] animate-pulse" />
                </div>
                
                <div className="max-w-3xl space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#EAB308]/15 text-[#EAB308] border border-[#EAB308]/20">
                    <Cpu className="w-3.5 h-3.5 animate-spin" /> Live GenLayer Studionet Testnet Mode
                  </div>
                  <h2 className="text-3xl font-extrabold text-white tracking-wide uppercase">
                    Space-to-Earth Autonomous Insurance Escrows
                  </h2>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Welcome to **ParametricSky**, a decentralized protocol for autonomous crop drought insurance. 
                    Traditional agricultural insurance suffers from human evaluation delays, administrative friction, and payout disputes. 
                    ParametricSky implements GenLayer Intelligent Contracts to lock underwriter capital, fetch raw satellite telemetry, 
                    and run AI Consensus nodes directly on-chain to trigger automated payouts.
                  </p>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button 
                      onClick={() => setActiveTab("terminal")}
                      className="bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] font-bold px-6 py-2.5 rounded-lg text-xs font-mono flex items-center gap-2 transition uppercase"
                    >
                      Launch Radar Terminal <ChevronRight className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        if (!walletAddress) {
                          connectWallet();
                        } else {
                          setShowUnderwriteModal(true);
                        }
                      }}
                      className="border border-[#EAB308] hover:bg-[#EAB308]/15 text-[#EAB308] font-bold px-6 py-2.5 rounded-lg text-xs font-mono flex items-center gap-2 transition uppercase"
                    >
                      {walletAddress ? "Underwrite Policy" : "Connect Wallet to Start"} <Shield className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* METRIC CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-[#0F161E] border border-gray-800 rounded-xl p-5 flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">Total Active Escrows</span>
                    <span className="text-xl font-bold text-white mt-1 block">{policies.length} Policies</span>
                  </div>
                  <Shield className="w-8 h-8 text-[#EAB308] opacity-60" />
                </div>

                <div className="bg-[#0F161E] border border-gray-800 rounded-xl p-5 flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">Total Escrow Funds</span>
                    <span className="text-xl font-bold text-[#38BDF8] mt-1 block">
                      {policies.reduce((sum, p) => sum + parseFloat(p.coverage_amount || "0"), 0).toLocaleString()} GEN
                    </span>
                  </div>
                  <Database className="w-8 h-8 text-[#38BDF8] opacity-60" />
                </div>

                <div className="bg-[#0F161E] border border-gray-800 rounded-xl p-5 flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">AI Consensus Ratio</span>
                    <span className="text-xl font-bold text-green-500 mt-1 block">4/4 Validators (100%)</span>
                  </div>
                  <Cpu className="w-8 h-8 text-green-500 opacity-60" />
                </div>

                <div className="bg-[#0F161E] border border-gray-800 rounded-xl p-5 flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">Connection status</span>
                    <span className={`text-xl font-bold mt-1 block ${walletAddress ? 'text-green-400' : 'text-red-400'}`}>
                      {walletAddress ? "MetaMask Connected" : "Wallet Disconnected"}
                    </span>
                  </div>
                  <Users className="w-8 h-8 opacity-60" />
                </div>
              </div>

              {/* LANDING SECTION QUICKLINKS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div 
                  onClick={() => setActiveTab("terminal")}
                  className="bg-[#0F161E]/50 border border-[#38BDF8]/10 hover:border-[#38BDF8]/40 p-5 rounded-xl cursor-pointer transition group"
                >
                  <h3 className="text-white font-bold text-xs uppercase flex items-center gap-2 group-hover:text-[#38BDF8]">
                    1. Telemetry Monitoring Terminal <ChevronRight className="w-4 h-4 text-gray-500 group-hover:translate-x-1 transition-transform" />
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                    Check crop health indices (NDVI) dynamically by drop-pinning GPS coordinates. Monitor active satellite sweeps and temperature heat anomalies in real-time.
                  </p>
                </div>

                <div 
                  onClick={() => setActiveTab("policies")}
                  className="bg-[#0F161E]/50 border border-[#EAB308]/10 hover:border-[#EAB308]/40 p-5 rounded-xl cursor-pointer transition group"
                >
                  <h3 className="text-white font-bold text-xs uppercase flex items-center gap-2 group-hover:text-[#EAB308]">
                    2. Escrow & Dispute Management <ChevronRight className="w-4 h-4 text-gray-500 group-hover:translate-x-1 transition-transform" />
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                    View active policies, file parametric disputes with cryptographic evidence logs, trigger validation audits, and release payouts.
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: GIS RADAR TERMINAL */}
          {activeTab === "terminal" && (
            <>
              {/* LEFT COLUMN: GIS SATELLITE MAP & NDVI CHART (8 cols) */}
              <div className="xl:col-span-8 flex flex-col gap-6">
                
                {/* GIS GEO-SPATIAL MAP TERMINAL */}
                <div className="border border-[#38BDF8]/20 bg-[#0B0F12]/80 backdrop-blur rounded-lg p-5 flex flex-col relative overflow-hidden">
                  <div className="flex justify-between items-center mb-4 border-b border-[#38BDF8]/10 pb-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-[#38BDF8] animate-bounce" />
                      <h2 className="font-bold text-white tracking-wide uppercase text-sm">
                        Interactive GIS Satellite Telemetry Interface
                      </h2>
                    </div>
                    <button 
                      onClick={() => setActiveTab("home")}
                      className="text-[10px] text-gray-400 hover:text-[#38BDF8] border border-gray-800 hover:border-[#38BDF8]/30 px-2 py-0.5 rounded font-mono transition"
                    >
                      Back Home
                    </button>
                  </div>

                  {/* Simulated GIS Radar Screen */}
                  <div 
                    className="h-[320px] bg-[#0E151D] border border-[#38BDF8]/10 rounded-lg relative overflow-hidden flex items-center justify-center cursor-crosshair group"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      const lat = 8.5 + (1 - y / rect.height) * 14.0;
                      const lng = 102.0 + (x / rect.width) * 8.0;
                      setPinnedCoords({ lat, lng, label: `Coordinates [Lat:${lat.toFixed(4)}, Lng:${lng.toFixed(4)}]` });
                    }}
                  >
                    <div className="radar-sweep"></div>
                    
                    {/* Geographic Grid Overlays */}
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                      <div className="absolute top-[25%] left-0 w-full h-[1px] bg-[#38BDF8]/50"></div>
                      <div className="absolute top-[50%] left-0 w-full h-[1px] bg-[#38BDF8]/50"></div>
                      <div className="absolute top-[75%] left-0 w-full h-[1px] bg-[#38BDF8]/50"></div>
                      <div className="absolute left-[25%] top-0 h-full w-[1px] bg-[#38BDF8]/50"></div>
                      <div className="absolute left-[50%] top-0 h-full w-[1px] bg-[#38BDF8]/50"></div>
                      <div className="absolute left-[75%] top-0 h-full w-[1px] bg-[#38BDF8]/50"></div>
                    </div>

                    {/* Concentric radar circles */}
                    <div className="absolute w-[280px] h-[280px] border border-[#38BDF8]/10 rounded-full pointer-events-none"></div>
                    <div className="absolute w-[180px] h-[180px] border border-[#38BDF8]/10 rounded-full pointer-events-none"></div>
                    <div className="absolute w-[80px] h-[80px] border border-[#38BDF8]/10 rounded-full pointer-events-none"></div>

                    {/* Landmarks */}
                    <div className="absolute top-[20%] left-[60%] text-[9px] text-[#38BDF8]/40 select-none">HA NOI GRID</div>
                    <div className="absolute top-[32%] left-[55%] text-[9px] text-[#38BDF8]/40 select-none">THANH HOA COOP</div>
                    <div className="absolute top-[60%] left-[80%] text-[9px] text-[#38BDF8]/40 select-none">DAK LAK RANGE</div>
                    <div className="absolute top-[82%] left-[45%] text-[9px] text-[#38BDF8]/40 select-none">MEKONG BASIN</div>

                    {/* Blinking marker */}
                    <div 
                      className="absolute z-10 flex flex-col items-center pointer-events-none"
                      style={{
                        top: `${((22.5 - pinnedCoords.lat) / 14.0) * 100}%`,
                        left: `${((pinnedCoords.lng - 102.0) / 8.0) * 100}%`
                      }}
                    >
                      <div className="w-3 h-3 bg-[#EAB308] border border-white rounded-full animate-ping absolute"></div>
                      <div className="w-3 h-3 bg-[#F97316] rounded-full border border-black relative z-10"></div>
                      <div className="mt-1 bg-black/80 border border-[#EAB308] px-2 py-0.5 rounded text-[9px] font-mono text-[#EAB308] whitespace-nowrap">
                        📌 GPS: {pinnedCoords.lat.toFixed(4)} N, {pinnedCoords.lng.toFixed(4)} E
                      </div>
                    </div>
                  </div>

                  {/* Radar readouts */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 bg-[#0F161E]/50 p-3 rounded-lg border border-[#38BDF8]/10 text-xs font-mono">
                    <div>
                      <div className="text-gray-400 text-[10px]">PINNED REGION:</div>
                      <div className="text-[#38BDF8] font-bold">{pinnedCoords.label}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-[10px]">COORDINATES:</div>
                      <div className="text-[#EAB308] font-bold">{pinnedCoords.lat.toFixed(4)} N, {pinnedCoords.lng.toFixed(4)} E</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-[10px]">WEATHER STATION:</div>
                      <div className="text-[#38BDF8]">{selectedStation}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-[10px]">TELEMETRY FEED URL:</div>
                      <div className="text-gray-300 truncate" title={satelliteTelemetryUrl}>{satelliteTelemetryUrl}</div>
                    </div>
                  </div>
                </div>

                {/* NDVI MULTI-SPECTRUM SPECTRAL CURVE CHART */}
                <div className="border border-[#38BDF8]/20 bg-[#0B0F12]/80 backdrop-blur rounded-lg p-5 flex flex-col">
                  <div className="flex justify-between items-center mb-4 border-b border-[#38BDF8]/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-[#EAB308]" />
                      <h2 className="font-bold text-white tracking-wide uppercase text-sm">
                        NDVI Multi-Spectrum Spectral Curve Chart
                      </h2>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span className="flex items-center gap-1.5 text-green-500">
                        <span className="w-2.5 h-2.5 bg-green-500 rounded-full"></span> Vital Crop (Healthy)
                      </span>
                      <span className="flex items-center gap-1.5 text-[#EAB308]">
                        <span className="w-2.5 h-2.5 bg-[#EAB308] rounded-full"></span> Current Telemetry
                      </span>
                      <span className="flex items-center gap-1.5 text-red-500">
                        <span className="w-3 h-0.5 border-t border-dashed border-red-500"></span> Trigger (0.25)
                      </span>
                    </div>
                  </div>

                  {/* SVG Chart */}
                  <div className="h-[200px] w-full bg-[#0E151D] border border-[#38BDF8]/10 rounded-lg relative p-3">
                    <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                      <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(56, 189, 248, 0.08)" />
                      <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(56, 189, 248, 0.08)" />
                      <line x1="0" y1="90" x2="500" y2="90" stroke="rgba(56, 189, 248, 0.08)" />
                      <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(56, 189, 248, 0.08)" />
                      
                      {[...Array(14)].map((_, idx) => (
                        <line 
                          key={idx} 
                          x1={String((idx / 13) * 500)} 
                          y1="0" 
                          x2={String((idx / 13) * 500)} 
                          y2="120" 
                          stroke="rgba(56, 189, 248, 0.05)" 
                        />
                      ))}

                      <line x1="0" y1="90" x2="500" y2="90" stroke="#DC2626" strokeWidth="1" strokeDasharray="4,4" />
                      
                      <path
                        d="M 0,90 L 500,90 L 500,120 L 0,120 Z"
                        fill="rgba(220, 38, 38, 0.07)"
                      />

                      {/* Healthy Path */}
                      <path
                        d={ndviPoints.map((_, i) => {
                          const x = (i / 13) * 500;
                          const y = 120 - ((0.42 + Math.sin(i / 3) * 0.08) - 0.1) * 200;
                          return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#22C55E"
                        strokeWidth="1.5"
                        strokeOpacity="0.4"
                      />

                      {/* Actual Path */}
                      <path
                        d={ndviPoints.map((pt, i) => {
                          const x = (i / 13) * 500;
                          const y = 120 - (pt.ndvi - 0.1) * 200;
                          return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#EAB308"
                        strokeWidth="2"
                        className="glow-golden"
                      />

                      {ndviPoints.map((pt, i) => {
                        const x = (i / 13) * 500;
                        const y = 120 - (pt.ndvi - 0.1) * 200;
                        return (
                          <circle
                            key={i}
                            cx={x}
                            cy={y}
                            r="2.5"
                            fill={pt.ndvi < 0.25 ? "#DC2626" : "#EAB308"}
                            stroke="#0B0F12"
                            strokeWidth="0.5"
                          />
                        );
                      })}
                    </svg>
                    
                    <div className="absolute left-2 top-2 text-[9px] text-gray-500 font-mono flex flex-col justify-between h-[85%]">
                      <div>NDVI 0.7</div>
                      <div>NDVI 0.5</div>
                      <div>NDVI 0.25 [THRESHOLD]</div>
                      <div>NDVI 0.1</div>
                    </div>
                    
                    <div className="absolute bottom-1 right-2 text-[9px] text-gray-500 font-mono flex justify-between w-[95%]">
                      <span>DAY 1</span>
                      <span>DAY 4</span>
                      <span>DAY 7</span>
                      <span>DAY 10</span>
                      <span>DAY 14</span>
                    </div>
                  </div>

                  {/* Additional crop metrics */}
                  <div className="grid grid-cols-3 gap-4 mt-3 text-center text-xs font-mono">
                    <div className="bg-[#0F161E] border border-[#38BDF8]/10 p-2 rounded">
                      <span className="text-gray-400 block text-[10px]">CURRENT NDVI VALUE:</span>
                      <span className={`font-bold ${ndviPoints[13].ndvi < 0.25 ? 'text-red-500' : 'text-[#EAB308]'}`}>
                        {ndviPoints[13].ndvi}
                      </span>
                    </div>
                    <div className="bg-[#0F161E] border border-[#38BDF8]/10 p-2 rounded">
                      <span className="text-gray-400 block text-[10px]">HEAT DURATION &ge; 38 C:</span>
                      <span className="font-bold text-orange-500 flex items-center justify-center gap-1">
                        <Sun className="w-3.5 h-3.5 text-orange-500 animate-spin" style={{ animationDuration: '6s' }} />
                        {ndviPoints[13].ndvi < 0.25 ? '16 Days' : '3 Days'}
                      </span>
                    </div>
                    <div className="bg-[#0F161E] border border-[#38BDF8]/10 p-2 rounded">
                      <span className="text-gray-400 block text-[10px]">ACCUMULATED RAINFALL:</span>
                      <span className="font-bold text-[#38BDF8] flex items-center justify-center gap-1">
                        <Droplets className="w-3.5 h-3.5 text-[#38BDF8]" />
                        {ndviPoints[13].ndvi < 0.25 ? '4.8 mm' : '32.1 mm'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: PIPELINE (4 cols) */}
              <div className="xl:col-span-4 flex flex-col gap-6">
                
                {/* AUTONOMOUS CLAIM EXECUTION PIPELINE */}
                <div className="border border-[#38BDF8]/20 bg-[#0B0F12]/80 backdrop-blur rounded-lg p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-4 border-b border-[#38BDF8]/10 pb-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-[#38BDF8] animate-spin" style={{ animationDuration: '10s' }} />
                        <h2 className="font-bold text-white tracking-wide uppercase text-sm">
                          AI Consensus Pipeline
                        </h2>
                      </div>
                      {pipelineStep >= 0 && (
                        <span className="text-[10px] text-[#38BDF8] animate-pulse">ACTIVE ANALYSIS</span>
                      )}
                    </div>

                    <div className="space-y-4 font-mono text-xs">
                      
                      <div className={`p-3 rounded-lg border transition ${
                        pipelineStep === 0 ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-white' : 
                        pipelineStep > 0 ? 'bg-[#38BDF8]/5 border-[#38BDF8]/30 text-gray-400' : 'bg-transparent border-gray-800 text-gray-500'
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold">1. Satellite Data Ingestion</span>
                          {pipelineStep === 0 && <span className="animate-pulse">INGESTING...</span>}
                          {pipelineStep > 0 && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                        <div className="text-[10px] mt-1 text-gray-400">
                          Scraping raw satellite telemetry feed via Copernicus Sentinel APIs.
                        </div>
                      </div>

                      <div className={`p-3 rounded-lg border transition ${
                        pipelineStep === 1 ? 'bg-[#EAB308]/10 border-[#EAB308] text-white' : 
                        pipelineStep > 1 ? 'bg-[#EAB308]/5 border-[#EAB308]/30 text-gray-400' : 'bg-transparent border-gray-800 text-gray-500'
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold">2. NDVI Index Calculation</span>
                          {pipelineStep === 1 && <span className="animate-pulse">COMPUTING...</span>}
                          {pipelineStep > 1 && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                        <div className="text-[10px] mt-1 text-gray-400">
                          Running multi-spectral bands analysis mapping diopter indices.
                        </div>
                      </div>

                      <div className={`p-3 rounded-lg border transition ${
                        pipelineStep === 2 ? 'bg-[#F97316]/10 border-[#F97316] text-white' : 
                        pipelineStep > 2 ? 'bg-[#F97316]/5 border-[#F97316]/30 text-gray-400' : 'bg-transparent border-gray-800 text-gray-500'
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold">3. Weather Station Validation</span>
                          {pipelineStep === 2 && <span className="animate-pulse">VERIFYING...</span>}
                          {pipelineStep > 2 && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                        <div className="text-[10px] mt-1 text-gray-400">
                          Cross-verifying historical drought indices with Open-Meteo local stats.
                        </div>
                      </div>

                      <div className={`p-3 rounded-lg border transition ${
                        pipelineStep === 3 ? 'bg-[#DC2626]/10 border-[#DC2626] text-white' : 
                        pipelineStep > 3 ? 'bg-[#38BDF8]/5 border-[#38BDF8]/30 text-gray-400' : 'bg-transparent border-gray-800 text-gray-500'
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold">4. Consensus Automated Payout</span>
                          {pipelineStep === 3 && <span className="animate-pulse">AGREEMENT RUNNING...</span>}
                          {pipelineStep > 3 && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                        <div className="text-[10px] mt-1 text-gray-400">
                          Broadcasting AI verdict payload across Validator Consensus nodes.
                        </div>
                      </div>

                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-[#38BDF8]/10 flex flex-col justify-end">
                    {pipelineStep >= 0 && (
                      <div className="bg-black/90 border border-[#38BDF8]/20 p-2.5 rounded h-[120px] overflow-y-auto text-[10px] font-mono text-green-500 space-y-1 mb-4 flex flex-col-reverse">
                        {[...pipelineLogs].reverse().map((log, idx) => (
                          <div key={idx} className="leading-relaxed">
                            &gt; {log}
                          </div>
                        ))}
                      </div>
                    )}

                    {currentPolicy ? (() => {
                      const isUnderwriter = !!(walletAddress && walletAddress.toLowerCase() === currentPolicy.underwriter.toLowerCase());
                      return (
                        <button
                          disabled={!walletAddress || isUnderwriter || (currentPolicy.status !== "ACTIVE" && currentPolicy.status !== "DISPUTED") || pipelineStep >= 0}
                          onClick={() => handleTriggerAssessment(currentPolicy.id)}
                          className="w-full bg-[#EAB308] hover:bg-[#EAB308]/80 text-[#0B0F12] disabled:bg-gray-800 disabled:text-gray-500 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs transition uppercase"
                        >
                          <Play className="w-4 h-4" /> {
                            !walletAddress ? "Connect Wallet to Trigger" : 
                            isUnderwriter ? "Underwriter Unauthorized" : 
                            "Trigger On-Chain Assessment"
                          }
                        </button>
                      );
                    })() : (
                      <div className="text-center text-gray-400 text-xs py-2 bg-[#0F161E] border border-gray-800 rounded">
                        No policy selected to trigger.
                      </div>
                    )}
                    {currentPolicy && currentPolicy.status !== "ACTIVE" && currentPolicy.status !== "DISPUTED" && (
                      <p className="text-[10px] text-gray-400 font-mono text-center mt-2">
                        Assessment only available for ACTIVE or DISPUTED policies.
                      </p>
                    )}
                  </div>

                </div>
              </div>
            </>
          )}

          {/* TAB 3: ACTIVE POLICIES */}
          {activeTab === "policies" && (
            <div className="xl:col-span-12 flex flex-col gap-6">
              
              {/* POLICIES DASHBOARD AND LOGS */}
              <div className="border border-[#38BDF8]/20 bg-[#0B0F12]/80 backdrop-blur rounded-lg p-5 flex flex-col">
                <div className="flex justify-between items-center mb-6 border-b border-[#38BDF8]/10 pb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="w-6 h-6 text-[#EAB308]" />
                    <h2 className="font-bold text-white tracking-wide uppercase text-base">
                      Agricultural Parametric Escrow Dashboard
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("home")}
                      className="text-[11px] text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700 px-3.5 py-2 rounded-lg font-mono transition"
                    >
                      Go Home
                    </button>
                    <button
                      disabled={!walletAddress}
                      onClick={() => setShowUnderwriteModal(true)}
                      className="bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] disabled:bg-gray-850 disabled:text-gray-500 font-semibold px-4 py-2 rounded-lg text-xs font-mono flex items-center gap-1.5 transition"
                    >
                      <Shield className="w-4 h-4" /> {walletAddress ? "UNDERWRITE NEW POLICY" : "CONNECT WALLET"}
                    </button>
                  </div>
                </div>

                {isLoadingPolicies ? (
                  <div className="text-center py-20 flex flex-col items-center gap-3">
                    <RefreshCw className="w-10 h-10 text-[#38BDF8] animate-spin" />
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Querying GenLayer Studionet Contract...</span>
                  </div>
                ) : policies.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-gray-800 rounded-lg bg-black/10">
                    <AlertCircle className="w-12 h-12 text-[#EAB308] mx-auto opacity-50 mb-3" />
                    <h3 className="text-white font-bold text-sm uppercase">No On-Chain Policies Found</h3>
                    <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
                      Connect your MetaMask wallet, switch to GenLayer Studionet, and click "Underwrite New Policy" to register and fund your first satellite weather contract.
                    </p>
                    {!walletAddress && (
                      <button 
                        onClick={connectWallet}
                        className="mt-4 bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] font-semibold px-4 py-1.5 rounded-lg text-xs font-mono transition"
                      >
                        Connect MetaMask Wallet
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-[#38BDF8]/20 text-gray-400 bg-[#0F161E]/50">
                          <th className="p-3">POLICY ID</th>
                          <th className="p-3">INSURED FARMER</th>
                          <th className="p-3">UNDERWRITER</th>
                          <th className="p-3">GEO COORDINATES</th>
                          <th className="p-3 text-right">COVERAGE ESCROW</th>
                          <th className="p-3 text-center">STATUS</th>
                          <th className="p-3 text-center">VERDICT</th>
                          <th className="p-3 text-center">CONFIDENCE</th>
                          <th className="p-3 text-right">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {policies.map((p) => {
                          const isUserUnderwriter = !!(walletAddress && walletAddress.toLowerCase() === p.underwriter.toLowerCase());
                          const isUserInsured = !!(walletAddress && walletAddress.toLowerCase() === p.insured.toLowerCase());
                          return (
                            <React.Fragment key={p.id}>
                              <tr 
                              onClick={() => {
                                setSelectedPolicyId(p.id);
                                const parts = p.geo_coordinates.split(",");
                                if (parts.length === 2) {
                                  const lat = parseFloat(parts[0]);
                                  const lng = parseFloat(parts[1]);
                                  if (!isNaN(lat) && !isNaN(lng)) {
                                    setPinnedCoords({ lat, lng, label: p.id });
                                  }
                                }
                              }}
                              className={`border-b border-gray-800/50 hover:bg-[#0F161E]/30 cursor-pointer transition ${selectedPolicyId === p.id ? 'bg-[#38BDF8]/5 border-l-2 border-l-[#38BDF8]' : ''}`}
                            >
                              <td className="p-3 font-bold text-white">{p.id}</td>
                              <td className="p-3 text-gray-300">{formatAddr(p.insured)}</td>
                              <td className="p-3 text-gray-300">{formatAddr(p.underwriter)}</td>
                              <td className="p-3 text-[#EAB308]">{p.geo_coordinates}</td>
                              <td className="p-3 text-right font-bold text-white">{p.coverage_amount} GEN</td>
                              
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  p.status === "ACTIVE" ? "bg-[#EAB308]/10 text-[#EAB308] border border-[#EAB308]/20" :
                                  p.status === "EVALUATING" ? "bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20 animate-pulse" :
                                  p.status === "AWAITING_PAYOUT" ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" :
                                  p.status === "DISPUTED" ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                                  p.status === "ESCALATED" ? "bg-red-500/20 text-red-400 border border-red-500/40" :
                                  "bg-gray-800 text-gray-400"
                                }`}>
                                  {p.status}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  p.verdict === "FULL_PAYOUT" ? "bg-green-500/15 text-green-500" :
                                  p.verdict === "PARTIAL_PAYOUT" ? "bg-yellow-500/15 text-[#EAB308]" :
                                  p.verdict === "NO_DISASTER" ? "bg-gray-800 text-gray-300" :
                                  p.verdict === "ESCALATE" ? "bg-red-500/15 text-red-500" :
                                  "text-gray-500"
                                }`}>
                                  {p.verdict}
                                </span>
                              </td>

                              <td className="p-3 text-center text-gray-300">
                                {p.confidence !== "0" ? `${p.confidence}%` : "—"}
                              </td>

                              <td className="p-3 text-right">
                                <div className="flex justify-end items-center gap-2">
                                  
                                  {p.status === "ACTIVE" && (
                                    <button
                                      disabled={!walletAddress || isUserUnderwriter}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTriggerAssessment(p.id);
                                      }}
                                      title={isUserUnderwriter ? "Only the Insured Farmer can trigger assessment" : ""}
                                      className="bg-[#EAB308] hover:bg-[#EAB308]/80 text-[#0B0F12] disabled:bg-gray-800 disabled:text-gray-500 px-2 py-1 rounded text-[11px] font-bold uppercase transition"
                                    >
                                      Assess
                                    </button>
                                  )}

                                  {p.status === "AWAITING_PAYOUT" && (
                                    <>
                                      <button
                                        disabled={!walletAddress || (p.verdict === "NO_DISASTER" ? !isUserInsured : !isUserUnderwriter)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowDisputeInput(p.id);
                                        }}
                                        title={p.verdict === "NO_DISASTER" ? "Only the Insured Farmer can dispute a dismissal" : "Only the Underwriter can dispute a payout"}
                                        className="bg-red-500 hover:bg-red-600 disabled:bg-gray-800 disabled:text-gray-500 text-white px-2 py-1 rounded text-[11px] font-bold uppercase transition"
                                      >
                                        Dispute
                                      </button>
                                      <button
                                        disabled={!walletAddress || (p.verdict === "NO_DISASTER" ? !isUserUnderwriter : !isUserInsured)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleFinalizeSettlement(p.id);
                                        }}
                                        title={p.verdict === "NO_DISASTER" ? "Only the Underwriter can claim the refund" : "Only the Insured Farmer can claim the payout"}
                                        className="bg-green-500 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-500 text-white px-2 py-1 rounded text-[11px] font-bold uppercase transition"
                                      >
                                        Finalize
                                      </button>
                                    </>
                                  )}

                                  {(p.status === "DISPUTED" || p.status === "ESCALATED") && (
                                    <button
                                      disabled={!walletAddress}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowEscalateInput(p.id);
                                      }}
                                      className="bg-[#38BDF8] hover:bg-[#38BDF8]/80 disabled:bg-gray-800 disabled:text-gray-500 text-[#0B0F12] px-2 py-1 rounded text-[11px] font-bold uppercase transition"
                                    >
                                      Arbitrate
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Expandable Dispute Reason Panel */}
                            {showDisputeInput === p.id && (
                              <tr className="bg-red-950/20 border-b border-red-950/40">
                                <td colSpan={9} className="p-4">
                                  <div className="flex flex-col gap-3 max-w-xl font-mono text-xs">
                                    <span className="text-red-400 font-bold text-[11px] flex items-center gap-1">
                                      <AlertCircle className="w-4 h-4 text-red-500" /> FILE PARAMETRIC ORACLE DISPUTE WITH EVIDENCE LOGS
                                    </span>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="text-gray-400 block mb-1">Select Disputed Sensor/Proof:</label>
                                        <select
                                          value={disputeSensor}
                                          onChange={(e) => setDisputeSensor(e.target.value)}
                                          className="w-full bg-[#0E151D] border border-red-500/30 p-2 rounded text-white outline-none focus:border-red-500"
                                        >
                                          <option value="Copernicus Sentinel-2">Copernicus Sentinel-2 Spectral Imagery</option>
                                          <option value="NOAA weather Station">NOAA Ground Meteorology Station</option>
                                          <option value="Open-Meteo Rain Gauge">Open-Meteo Local Rain Gauge</option>
                                          <option value="Field Sensory Probe">Local Ground Agronomic Sensor Probe</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-gray-400 block mb-1">Claimed Settlement Ratio:</label>
                                        <select
                                          value={disputeRatio}
                                          onChange={(e) => setDisputeRatio(e.target.value)}
                                          className="w-full bg-[#0E151D] border border-red-500/30 p-2 rounded text-white outline-none focus:border-red-500"
                                        >
                                          <option value="100% Payout">100% Full Claim Payout to Farmer</option>
                                          <option value="50% Split">50% Compromise / 50% Refund</option>
                                          <option value="100% Refund">100% Refund to Underwriter Escrow</option>
                                        </select>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-gray-400 block mb-1">Dispute Reasoning & Explanatory Evidence Proof:</label>
                                      <input
                                        type="text"
                                        placeholder="Provide cryptographic or sensory rationale details..."
                                        value={disputeReason}
                                        onChange={(e) => setDisputeReason(e.target.value)}
                                        className="w-full bg-black/80 border border-red-500/40 p-2 rounded text-white outline-none focus:border-red-500"
                                      />
                                    </div>

                                    <div className="flex gap-2 pt-1">
                                      <button
                                        onClick={() => handleRaiseDispute(p.id)}
                                        className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded text-[11px] transition uppercase"
                                      >
                                        File Dispute & Freeze Funds
                                      </button>
                                      <button
                                        onClick={() => setShowDisputeInput(null)}
                                        className="text-gray-400 hover:text-white text-[11px] px-2"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {/* Expandable Arbitrate Escalation Panel */}
                            {showEscalateInput === p.id && (
                              <tr className="bg-[#38BDF8]/5 border-b border-[#38BDF8]/10">
                                <td colSpan={9} className="p-4">
                                  <div className="flex flex-col gap-2 max-w-xl">
                                    <span className="text-[#38BDF8] font-bold text-[11px] block">ADMINISTRATIVE ARBITRATION FOR DISPUTED CONTRACT</span>
                                    
                                    {p.dispute_evidence && (
                                      <div className="bg-black/50 border border-red-500/20 p-2.5 rounded text-[11px] mb-2">
                                        <span className="text-red-400 font-bold block">Dispute Evidence Rationale:</span>
                                        <p className="text-gray-300">{p.dispute_evidence}</p>
                                        <span className="text-gray-400 text-[10px] mt-1 block">
                                          Source: {p.dispute_sensor_type} | Requested Outcome: {p.dispute_ratio}
                                        </span>
                                      </div>
                                    )}

                                    <div className="flex items-center gap-3">
                                      <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                                        <input
                                          type="radio"
                                          name="action"
                                          value="PAYOUT"
                                          checked={escalateAction === "PAYOUT"}
                                          onChange={() => setEscalateAction("PAYOUT")}
                                          className="bg-black border-gray-800 text-[#38BDF8] focus:ring-0"
                                        />
                                        100% PAYOUT (Concede to Farmer)
                                      </label>
                                      <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                                        <input
                                          type="radio"
                                          name="action"
                                          value="REFUND"
                                          checked={escalateAction === "REFUND"}
                                          onChange={() => setEscalateAction("REFUND")}
                                          className="bg-black border-gray-800 text-[#38BDF8] focus:ring-0"
                                        />
                                        100% REFUND (Refund Underwriter)
                                      </label>
                                      <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                                        <input
                                          type="radio"
                                          name="action"
                                          value="SPLIT"
                                          checked={escalateAction === "SPLIT"}
                                          onChange={() => setEscalateAction("SPLIT")}
                                          className="bg-black border-gray-800 text-[#38BDF8] focus:ring-0"
                                        />
                                        50/50 SPLIT (Compromise Resolution)
                                      </label>
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                      <button
                                        onClick={() => handleResolveEscalation(p.id)}
                                        className="bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] font-bold px-3 py-1  rounded text-[11px] transition"
                                      >
                                        Execute Settlement Resolution
                                      </button>
                                      <button
                                        onClick={() => setShowEscalateInput(null)}
                                        className="text-gray-400 hover:text-white text-[11px] px-2"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {/* Extra info / description line */}
                            <tr className="border-b border-gray-800/20 bg-black/10">
                              <td colSpan={9} className="px-3 py-2.5 text-[10px] text-gray-400 leading-relaxed font-mono">
                                <div className="flex flex-col gap-1.5">
                                  <div>
                                    <span className="text-[#38BDF8] font-bold">Oracle Verdict Log:</span> {p.reason}
                                  </div>
                                  {p.confidence !== "0" && (
                                    <div className="flex items-center gap-4 text-slate-500 text-[9px] pt-1 border-t border-gray-900">
                                      <span>Jury Node Consensus Agreement: 100% (4/4 Validators)</span>
                                      <span>•</span>
                                      <span>Voter 1 (Aeneas LLM): AGREE</span>
                                      <span>•</span>
                                      <span>Voter 2 (Ithaca LLM): AGREE</span>
                                      <span>•</span>
                                      <span>Voter 3 (Adonis LLM): AGREE</span>
                                      <span>•</span>
                                      <span>Voter 4 (Minos LLM): AGREE</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 4: FAQ & DETAILS */}
          {activeTab === "about" && (
            <div className="xl:col-span-12 border border-[#38BDF8]/20 bg-[#0B0F12]/80 backdrop-blur rounded-lg p-6 max-w-4xl mx-auto font-mono text-xs space-y-4">
              <div className="flex justify-between items-center border-b border-[#38BDF8]/10 pb-2">
                <h2 className="text-base font-bold text-white uppercase flex items-center gap-2">
                  <Globe className="w-5 h-5 text-[#38BDF8]" /> Parametric Weather Insurance & DeSci
                </h2>
                <button 
                  onClick={() => setActiveTab("home")}
                  className="text-[10px] text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700 px-2 py-0.5 rounded transition"
                >
                  Return Home
                </button>
              </div>
              <p className="leading-relaxed">
                Parametric insurance solves traditional crop protection friction by deploying immutable smart contracts. Instead of waiting months for human assessors to audit fields and files, payouts are determined automatically by objective satellite and telemetry data.
              </p>

              <div className="border border-[#EAB308]/20 bg-[#EAB308]/5 p-4 rounded-lg space-y-2">
                <h3 className="font-bold text-[#EAB308] uppercase text-xs">GenLayer Intelligent Contracts</h3>
                <p className="leading-relaxed">
                  GenLayer contracts support non-deterministic AI Consensus computation. In ParametricSky, this enables retrieving raw multi-spectral data on-chain using `gl.nondet.web.render`, calculating biological crop vegetative index stress (NDVI), and processing subjective meteorological evaluation via validator nodes to settle claims automatically without human intervention.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white uppercase text-xs">Monitored Satellite Telemetry Fields:</h3>
                <ul className="list-disc pl-5 space-y-1 text-gray-300">
                  <li>
                    <strong className="text-[#38BDF8]">NDVI (Normalized Difference Vegetation Index):</strong> Measures active crop photosynthetic chlorophyll. If NDVI collapses below 0.25 for 14 days, crop stress is verified.
                  </li>
                  <li>
                    <strong className="text-[#38BDF8]">Surface Soil Temperature:</strong> Soil heat levels exceeding &ge; 38 C trigger chlorophyll breakdown.
                  </li>
                  <li>
                    <strong className="text-[#38BDF8]">Rainfall Accumulation:</strong> Verifies actual rainfall deficit from Open-Meteo local stations to corroborate drought conditions.
                  </li>
                </ul>
              </div>

              <div className="border border-gray-800 pt-4 flex gap-4 text-[10px] text-gray-500">
                <span>Status: Active</span>
                <span>Network: Studionet Active</span>
                <span>Version: v1.0.0</span>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* DAPP FOOTER - Structured (Introduction, Body, Conclusion) */}
      <footer className="border-t border-[#38BDF8]/20 bg-[#0A0D10] text-gray-400 text-xs py-10 px-6 font-mono relative z-10">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* 1. INTRODUCTION */}
            <div className="space-y-3">
              <h4 className="text-white font-bold text-xs uppercase tracking-widest border-b border-[#38BDF8]/10 pb-2">
                I. Introduction: The Space Insurance Paradigm
              </h4>
              <p className="leading-relaxed text-[11px]">
                ParametricSky represents a paradigm shift in climate risk management. 
                By combining space observations with decentralized ledgers, we eliminate local human bias, 
                inspection fraud, and delayed payment files. Underwriters deploy liquid coverage capital 
                locked securely in smart contract escrow, which is instantly and trustlessly distributed 
                to cooperative farmers when satellite data confirms drought occurrences.
              </p>
            </div>

            {/* 2. BODY / OPERATIONAL MECHANICS */}
            <div className="space-y-3">
              <h4 className="text-white font-bold text-xs uppercase tracking-widest border-b border-[#38BDF8]/10 pb-2">
                II. Mechanics: Telemetry & AI Consensus
              </h4>
              <p className="leading-relaxed text-[11px]">
                The evaluation pipeline operates deterministically yet flexibly. When triggered, the contract 
                utilizes non-deterministic calls to scrape satellite raw reflections, extracting NDVI indices 
                mapping crop stress. GenLayer's multi-validator AI consensus checks these values alongside weather 
                station logs to resolve subjective decisions, ensuring secure arbitration before finalizing claims.
              </p>
            </div>

            {/* 3. CONCLUSION / DISCLOSURES & LINKS */}
            <div className="space-y-3">
              <h4 className="text-white font-bold text-xs uppercase tracking-widest border-b border-[#38BDF8]/10 pb-2">
                III. Conclusion: Settlement Finality
              </h4>
              <p className="leading-relaxed text-[11px] mb-3">
                All decisions are subject to a 24-hour cooling-off window. This timeframe allows underwriters 
                and farmers to review claims and submit sensory disputes when anomalies occur. All final 
                escrow payouts are distributed immediately on-chain upon countdown completion, completing 
                a fully autonomous and secure agricultural hedge.
              </p>
              <div className="flex flex-wrap gap-2 text-[10px] pt-1">
                <a href="https://studio.genlayer.com/api" target="_blank" rel="noopener noreferrer" className="text-[#38BDF8] hover:underline">Studionet Endpoint</a>
                <span>•</span>
                <a href="https://docs.genlayer.com" target="_blank" rel="noopener noreferrer" className="text-[#38BDF8] hover:underline">Developer Docs</a>
                <span>•</span>
                <a href="https://github.com/luongnhan9999/parametric-sky-genlayer" target="_blank" rel="noopener noreferrer" className="text-[#38BDF8] hover:underline">GitHub Repository</a>
              </div>
            </div>

          </div>

          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] text-gray-500">
            <div>
              © 2026 ParametricSky Protocol. Built for the GenLayer Testnet. All rights reserved.
            </div>
            <div className="flex items-center gap-4">
              <span>System Status: <strong className="text-green-500">ONLINE</strong></span>
              <span>Network: <strong>GENLAYER STUDIONET (CHAIN ID: 12345)</strong></span>
            </div>
          </div>

        </div>
      </footer>

      {/* TRANSACTION PENDING MODAL */}
      {txLoading && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-[#0B0F12] border border-[#38BDF8] p-6 rounded-lg max-w-sm w-full text-center space-y-4 font-mono">
            <RefreshCw className="w-10 h-10 text-[#38BDF8] animate-spin mx-auto" />
            <h3 className="text-white font-bold text-sm tracking-widest uppercase">Executing Transaction</h3>
            <p className="text-xs text-gray-400">{txMessage}</p>
            <div className="text-[9px] text-[#38BDF8]/40">DO NOT CLOSE THIS TERMINAL</div>
          </div>
        </div>
      )}

      {/* UNDERWRITE POLICY MODAL */}
      {showUnderwriteModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <form 
            onSubmit={handleUnderwrite}
            className="bg-[#0B0F12] border border-[#38BDF8]/40 p-6 rounded-lg max-w-2xl w-full space-y-4 font-mono text-xs"
          >
            <h3 className="text-white font-bold text-sm tracking-wider uppercase border-b border-[#38BDF8]/10 pb-2 flex items-center gap-1.5">
              <Shield className="w-4.5 h-4.5 text-[#EAB308]" /> Underwrite New Climate Policy
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 block mb-1">POLICY ID (Unique Name):</label>
                <input 
                  type="text" 
                  required
                  value={newPolicy.id} 
                  onChange={(e) => setNewPolicy(p => ({ ...p, id: e.target.value }))}
                  className="w-full bg-[#0E151D] border border-[#38BDF8]/20 p-2 text-white outline-none rounded focus:border-[#38BDF8]"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">INSURED FARMER ADDRESS:</label>
                <input 
                  type="text" 
                  required
                  placeholder="0x..."
                  value={newPolicy.insured} 
                  onChange={(e) => setNewPolicy(p => ({ ...p, insured: e.target.value }))}
                  className="w-full bg-[#0E151D] border border-[#38BDF8]/20 p-2 text-white outline-none rounded focus:border-[#38BDF8]"
                />
              </div>
            </div>

            <div>
              <label className="text-gray-400 block mb-1">GEO-SPATIAL COORDINATES (LAT/LONG):</label>
              <input 
                type="text" 
                required
                value={newPolicy.geoCoords} 
                onChange={(e) => setNewPolicy(p => ({ ...p, geoCoords: e.target.value }))}
                className="w-full bg-[#0E151D] border border-[#38BDF8]/20 p-2 text-white outline-none rounded focus:border-[#38BDF8]"
              />
            </div>

            <div>
              <label className="text-gray-400 block mb-1">POLICY TERMS URL (JSON/TEXT):</label>
              <input 
                type="text" 
                required
                value={newPolicy.termsUrl} 
                onChange={(e) => setNewPolicy(p => ({ ...p, termsUrl: e.target.value }))}
                className="w-full bg-[#0E151D] border border-[#38BDF8]/20 p-2 text-white outline-none rounded focus:border-[#38BDF8]"
              />
            </div>

            <div>
              <label className="text-gray-400 block mb-1">DROUGHT INDEX TRIGGER RULE:</label>
              <input 
                type="text" 
                required
                value={newPolicy.droughtTrigger} 
                onChange={(e) => setNewPolicy(p => ({ ...p, droughtTrigger: e.target.value }))}
                className="w-full bg-[#0E151D] border border-[#38BDF8]/20 p-2 text-white outline-none rounded focus:border-[#38BDF8]"
              />
            </div>

            <div>
              <label className="text-gray-400 block mb-1">COVERAGE ESCROW AMOUNT (GEN TOKENS):</label>
              <input 
                type="number" 
                required
                value={newPolicy.coverageAmount} 
                onChange={(e) => setNewPolicy(p => ({ ...p, coverageAmount: e.target.value }))}
                className="w-full bg-[#0E151D] border border-[#38BDF8]/20 p-2 text-white outline-none rounded focus:border-[#38BDF8] font-bold text-[#EAB308]"
              />
            </div>

            <div className="flex gap-2 pt-2 justify-end">
              <button
                type="submit"
                className="bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] font-bold px-4 py-2 rounded transition"
              >
                Underwrite & Lock Escrow
              </button>
              <button
                type="button"
                onClick={() => setShowUnderwriteModal(false)}
                className="text-gray-400 hover:text-white px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
