import React, { useState, useEffect } from "react";
import { 
  Shield, 
  MapPin, 
  Activity, 
  Cpu, 
  CheckCircle, 
  Clock, 
  Play, 
  RefreshCw, 
  Wallet,
  Settings,
  HelpCircle,
  Sun,
  Droplets,
  Globe
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
}

// Initial seed policies for Mock Simulator mode
const INITIAL_MOCK_POLICIES: Policy[] = [
  {
    id: "policy_thanh_hoa_rice_01",
    underwriter: "0xunderwriter_pool_alpha",
    insured: "0xfarmer_cooperative_thanh_hoa",
    coverage_amount: "5000",
    status: "ACTIVE",
    terms_url: "https://parametric.io/terms/drought_rice_2026.json",
    telemetry_url: "",
    geo_coordinates: "19.8067 N, 105.7851 E",
    drought_index_trigger: "NDVI < 0.25 for 14 days OR Rainfall < 10mm",
    verdict: "NONE",
    reason: "Policy active. Monitoring satellite parameters.",
    confidence: "0",
    payout_ready_at: "0",
    disputed_at: "0"
  },
  {
    id: "policy_mekong_delta_durian_05",
    underwriter: "0xunderwriter_pool_beta",
    insured: "0xfarmer_mekong_delta",
    coverage_amount: "8000",
    status: "AWAITING_PAYOUT",
    terms_url: "https://parametric.io/terms/durian_stress_2026.json",
    telemetry_url: "https://satellite-feed.copernicus.eu/telemetry_0940_10530.json",
    geo_coordinates: "9.4072 N, 105.3082 E",
    drought_index_trigger: "NDVI < 0.22 for 10 days OR Temperature >= 38 C for 14 days",
    verdict: "FULL_PAYOUT",
    reason: "Severe vegetation collapse detected (NDVI = 0.17 for 15 consecutive days, temperature exceeded 38.5 C for 17 days)",
    confidence: "98",
    payout_ready_at: String(Math.floor(Date.now() / 1000) + 72000), // ~20 hours remaining
    disputed_at: "0"
  },
  {
    id: "policy_dak_lak_coffee_08",
    underwriter: "0xunderwriter_pool_coffee",
    insured: "0xfarmer_dak_lak_coop",
    coverage_amount: "6500",
    status: "CLOSED",
    terms_url: "https://parametric.io/terms/coffee_drought_2026.json",
    telemetry_url: "https://satellite.org/data/daklak_coffee_telemetry.json",
    geo_coordinates: "12.6689 N, 108.0382 E",
    drought_index_trigger: "Rainfall < 15mm in dry season",
    verdict: "NO_DISASTER",
    reason: "Normal climate parameters observed, coffee crop vitality index stable at NDVI = 0.38",
    confidence: "92",
    payout_ready_at: "0",
    disputed_at: "0"
  }
];

export default function App() {
  // Navigation / Modal state
  const [activeTab, setActiveTab] = useState<"terminal" | "policies" | "about">("terminal");
  const [showUnderwriteModal, setShowUnderwriteModal] = useState(false);

  // App settings
  const [isSimulatorMode, setIsSimulatorMode] = useState(true);
  const [contractAddress, setContractAddress] = useState("0x7f4D2883017a151EFbB94E51016B61623190A956");
  
  // Real GenLayer state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txMessage, setTxMessage] = useState("");

  // GIS Coordinates State (pinned coordinates)
  const [pinnedCoords, setPinnedCoords] = useState({ lat: 19.8067, lng: 105.7851, label: "Thanh Hóa Rice Farm" });
  const [selectedStation, setSelectedStation] = useState("OPEN-METEO-VN-TH-01");
  const [mockTelemetryUrl, setMockTelemetryUrl] = useState("https://satellite-feed.copernicus.eu/telemetry_198067_1057851.json");

  // Selected Policy for Terminal view
  const [selectedPolicyId, setSelectedPolicyId] = useState("policy_thanh_hoa_rice_01");
  const [policies, setPolicies] = useState<Policy[]>(INITIAL_MOCK_POLICIES);

  // Pipeline execution animation state
  const [pipelineStep, setPipelineStep] = useState<number>(-1); // -1 = idle, 0 = satellite, 1 = NDVI, 2 = Weather, 3 = Consensus
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);

  // Dispute logic state
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeInput, setShowDisputeInput] = useState<string | null>(null);
  
  // Escalation logic state
  const [escalateAction, setEscalateAction] = useState<"PAYOUT" | "REFUND" | "SPLIT">("PAYOUT");
  const [showEscalateInput, setShowEscalateInput] = useState<string | null>(null);

  // Form State for new Underwrite policy
  const [newPolicy, setNewPolicy] = useState({
    id: "policy_" + Math.random().toString(36).substring(2, 8),
    insured: "0xfarmer_" + Math.random().toString(36).substring(2, 6),
    termsUrl: "https://parametric.io/terms/rice_irrigation_2026.json",
    geoCoords: "19.8067 N, 105.7851 E",
    droughtTrigger: "NDVI < 0.25 for 14 days OR Rainfall < 10mm",
    coverageAmount: "3000"
  });

  // Current system timestamp in seconds (for mock clock)
  const [currentMockTimeOffset, setCurrentMockTimeOffset] = useState<number>(0);
  const getSystemTime = () => Math.floor(Date.now() / 1000) + currentMockTimeOffset;

  // Selected Policy Object
  const currentPolicy = policies.find(p => p.id === selectedPolicyId) || policies[0];

  // Auto suggest telemetry link and weather station when map coordinates change
  useEffect(() => {
    const latStr = pinnedCoords.lat.toFixed(4);
    const lngStr = pinnedCoords.lng.toFixed(4);
    setMockTelemetryUrl(`https://satellite-feed.copernicus.eu/telemetry_${latStr.replace(".", "")}_${lngStr.replace(".", "")}.json`);
    
    // Choose weather station based on nearest region
    if (pinnedCoords.lat > 18) {
      setSelectedStation("OPEN-METEO-VN-TH-01 (Thanh Hóa Region)");
    } else if (pinnedCoords.lat > 12) {
      setSelectedStation("COP-SENTINEL-VN-DL-08 (Đắk Lắk Central Highlands)");
    } else {
      setSelectedStation("NOAA-STATION-VN-MK-05 (Mekong Delta Region)");
    }

    setNewPolicy(prev => ({
      ...prev,
      geoCoords: `${latStr} N, ${lngStr} E`
    }));
  }, [pinnedCoords]);

  // Connect wallet handler
  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask is not installed. Please install MetaMask to connect to live network.");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0]);
      setIsSimulatorMode(false); // Disable mock mode when wallet successfully connects
      await switchNetwork();
    } catch (err) {
      console.error("Wallet connection failed:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  // Switch network to Studionet
  const switchNetwork = async () => {
    try {
      // Studionet chain details
      const studionetChainId = "0x3039"; // Mock or actual chainId. We'll attempt to switch
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: studionetChainId }],
      });
    } catch (err: any) {
      // If chain is not added, we try to add it
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x3039", // 12345
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

  // Dynamic NDVI mock curve mapping
  // Generates 14 points of data representing index values. Dips for EVALUATING or FULL_PAYOUT.
  const generateNdviData = (): { day: number; ndvi: number; temp: number; rainfall: number }[] => {
    const data: { day: number; ndvi: number; temp: number; rainfall: number }[] = [];
    
    // Seed randomized data based on the policy state
    const isDrought = 
      (currentPolicy.status === "AWAITING_PAYOUT" && currentPolicy.verdict === "FULL_PAYOUT") || 
      currentPolicy.status === "EVALUATING" ||
      currentPolicy.id.includes("thanh_hoa");

    for (let i = 1; i <= 14; i++) {
      let ndvi = 0.35 + Math.sin(i / 3) * 0.08 + (Math.random() * 0.03 - 0.015);
      let temp = 33 + Math.sin(i / 2) * 3 + Math.random() * 2;
      let rainfall = Math.max(0, 12 - i * 0.8 + Math.random() * 3);

      if (isDrought) {
        // Curve dips below the 0.25 trigger threshold
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

  // Run execution pipeline animation
  const runClaimPipelineAnimation = (onFinish: () => void) => {
    setPipelineStep(0);
    setPipelineLogs(["Initializing Telemetry Assessment Interface..."]);

    const logMessages = [
      // Step 0: Ingestion
      "[Satellite Data Ingestion] Querying Copernicus Sentinel Hub imagery...",
      "[Satellite Data Ingestion] Retrieving multi-spectral band data for target coordinate grid...",
      "[Satellite Data Ingestion] Payload size: 4.8MB, telemetry format compatible.",
      // Step 1: NDVI Calculation
      "[NDVI Index Calculation] Processing band reflections: NDVI = (NIR - Red) / (NIR + Red)",
      "[NDVI Index Calculation] Mapping chronological spectral curve over 14-day history...",
      `[NDVI Index Calculation] Detected NDVI dip below threshold 0.25 starting from Day 3.`,
      // Step 2: Weather Station Validation
      "[Weather Station Validation] Querying meteorological partner Open-Meteo...",
      `[Weather Station Validation] Station confirmed temperature >= 38 C for consecutive days.`,
      `[Weather Station Validation] Rain gauge logged rainfall: deficit met.`,
      // Step 3: Consensus Payout
      "[Consensus Automated Payout] Executing leader node execution program on GenLayer VM...",
      "[Consensus Automated Payout] Generating AI Verdict based on terms and satellite parameters...",
      "[Consensus Automated Payout] Broadcasting Leader result to Validator nodes...",
      "[Consensus Automated Payout] GenLayer AI Consensus: 4/4 Validator nodes verified. Settlement payload locked."
    ];

    let currentLogIndex = 0;
    let progress = 0;
    
    // Animate through stages
    const timer = setInterval(() => {
      progress += 8;
      if (progress >= 100) {
        clearInterval(timer);
        setPipelineStep(4);
        onFinish();
        return;
      }

      // Increment steps and log entries dynamically
      if (progress > 25 && progress <= 50) {
        setPipelineStep(1);
      } else if (progress > 50 && progress <= 75) {
        setPipelineStep(2);
      } else if (progress > 75) {
        setPipelineStep(3);
      }

      // Add logs
      if (currentLogIndex < logMessages.length && Math.random() > 0.4) {
        setPipelineLogs(prevLogs => [...prevLogs, logMessages[currentLogIndex]]);
        currentLogIndex++;
      }
    }, 400);
  };

  // WRITE Operations

  // 1. Underwrite Policy
  const handleUnderwrite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSimulatorMode) {
      const p: Policy = {
        id: newPolicy.id,
        underwriter: walletAddress || "0xmock_underwriter",
        insured: newPolicy.insured.toLowerCase(),
        coverage_amount: newPolicy.coverageAmount,
        status: "ACTIVE",
        terms_url: newPolicy.termsUrl,
        telemetry_url: "",
        geo_coordinates: newPolicy.geoCoords,
        drought_index_trigger: newPolicy.droughtTrigger,
        verdict: "NONE",
        reason: "Policy active. Monitoring satellite parameters.",
        confidence: "0",
        payout_ready_at: "0",
        disputed_at: "0"
      };
      setPolicies(prev => [...prev, p]);
      setSelectedPolicyId(p.id);
      setShowUnderwriteModal(false);
      // Reset form
      setNewPolicy({
        id: "policy_" + Math.random().toString(36).substring(2, 8),
        insured: "0xfarmer_" + Math.random().toString(36).substring(2, 6),
        termsUrl: "https://parametric.io/terms/rice_irrigation_2026.json",
        geoCoords: `${pinnedCoords.lat.toFixed(4)} N, ${pinnedCoords.lng.toFixed(4)} E`,
        droughtTrigger: "NDVI < 0.25 for 14 days OR Rainfall < 10mm",
        coverageAmount: "3000"
      });
    } else {
      // Real GenLayer Write
      setTxLoading(true);
      setTxMessage("Deploying policy parameters & locking escrow pool on GenLayer Studionet...");
      try {
        const { createClient } = await import("genlayer-js");
        const { studionet } = await import("genlayer-js/chains");
        
        const client = createClient({
          chain: studionet,
          provider: window.ethereum,
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
        
        // Refresh policies list
        await loadRealPolicies();
        setShowUnderwriteModal(false);
      } catch (err: any) {
        alert("Transaction Failed: " + (err.message || err));
      } finally {
        setTxLoading(false);
      }
    }
  };

  // 2. Trigger Claim Assessment
  const handleTriggerAssessment = async (policyId: string) => {
    const policy = policies.find(p => p.id === policyId);
    if (!policy) return;

    if (isSimulatorMode) {
      // 1. Set policy state to Evaluating
      setPolicies(prev => prev.map(p => {
        if (p.id === policyId) {
          return { ...p, status: "EVALUATING", telemetry_url: mockTelemetryUrl };
        }
        return p;
      }));

      // 2. Run simulation pipeline animation
      runClaimPipelineAnimation(() => {
        // 3. Final verdict logic simulation after animation completes
        setPolicies(prev => prev.map(p => {
          if (p.id === policyId) {
            const isDrought = p.id.includes("rice") || p.id.includes("thanh_hoa") || p.id.includes("durian");
            const verdict = isDrought ? "FULL_PAYOUT" : "NO_DISASTER";
            const reason = isDrought 
              ? "Severe crop vegetative degradation confirmed via NDVI multi-spectral analysis. Vegetation index fell to 0.18 over 14 consecutive days. Meteorological records verified 5mm rainfall."
              : "Normalized Difference Vegetation Index stable at 0.38, indicating crop vitality is within safe agricultural limits. Claims dismissed.";
            
            return {
              ...p,
              status: "AWAITING_PAYOUT",
              verdict: verdict,
              reason: reason,
              confidence: "95",
              payout_ready_at: String(getSystemTime() + 86400) // 24h cooling-off window
            };
          }
          return p;
        }));
      });
    } else {
      // Real GenLayer Write
      setTxLoading(true);
      setTxMessage("Initiating satellite telemetry ingest and triggering AI Consensus...");
      try {
        const { createClient } = await import("genlayer-js");
        const { studionet } = await import("genlayer-js/chains");

        const client = createClient({
          chain: studionet,
          provider: window.ethereum,
        });

        const hash = await client.writeContract({
          address: contractAddress as `0x${string}`,
          functionName: "trigger_claim_assessment",
          args: [policyId, mockTelemetryUrl],
          value: 0n
        });

        // Run animations while block is mining
        runClaimPipelineAnimation(async () => {
          setTxMessage("Finalizing assessment and recording on-chain verdict...");
          await client.waitForTransactionReceipt({ hash });
          await loadRealPolicies();
        });
      } catch (err: any) {
        alert("Assessment Trigger Failed: " + (err.message || err));
        setTxLoading(false);
      }
    }
  };

  // 3. Raise Dispute
  const handleRaiseDispute = async (policyId: string) => {
    if (!disputeReason.trim()) {
      alert("Please provide a valid reason for raising a dispute.");
      return;
    }

    if (isSimulatorMode) {
      setPolicies(prev => prev.map(p => {
        if (p.id === policyId) {
          return {
            ...p,
            status: "DISPUTED",
            reason: `[DISPUTED by Underwriter] ${disputeReason}`,
            disputed_at: String(getSystemTime())
          };
        }
        return p;
      }));
      setShowDisputeInput(null);
      setDisputeReason("");
    } else {
      setTxLoading(true);
      setTxMessage("Locking contract payout pool and recording dispute logic...");
      try {
        const { createClient } = await import("genlayer-js");
        const { studionet } = await import("genlayer-js/chains");

        const client = createClient({
          chain: studionet,
          provider: window.ethereum,
        });

        const hash = await client.writeContract({
          address: contractAddress as `0x${string}`,
          functionName: "raise_dispute",
          args: [policyId, disputeReason],
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
    }
  };

  // 4. Finalize Settlement
  const handleFinalizeSettlement = async (policyId: string) => {
    const policy = policies.find(p => p.id === policyId);
    if (!policy) return;

    // Check cooling off
    const now = getSystemTime();
    const readyAt = parseInt(policy.payout_ready_at);
    if (now < readyAt) {
      const remaining = readyAt - now;
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      alert(`Settlement Locked: 24h cooling-off window is active. Remaining: ${hours}h ${minutes}m. Try 'Fast Forward Time' to test finalization.`);
      return;
    }

    if (isSimulatorMode) {
      setPolicies(prev => prev.map(p => {
        if (p.id === policyId) {
          return {
            ...p,
            status: "CLOSED",
            reason: `Claim closed successfully. Verdict [${p.verdict}] executed. Escrow distribution executed.`
          };
        }
        return p;
      }));
    } else {
      setTxLoading(true);
      setTxMessage("Distributing escrow pools and closing policy...");
      try {
        const { createClient } = await import("genlayer-js");
        const { studionet } = await import("genlayer-js/chains");

        const client = createClient({
          chain: studionet,
          provider: window.ethereum,
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
    }
  };

  // 5. Resolve Escalation
  const handleResolveEscalation = async (policyId: string) => {
    if (isSimulatorMode) {
      setPolicies(prev => prev.map(p => {
        if (p.id === policyId) {
          return {
            ...p,
            status: "CLOSED",
            verdict: escalateAction,
            reason: `[ADMIN ARBITRATED] Resolved via arbitration action: ${escalateAction}. Escrow distribution finalized.`,
          };
        }
        return p;
      }));
      setShowEscalateInput(null);
    } else {
      setTxLoading(true);
      setTxMessage("Broadcasting platform administrator settlement decision...");
      try {
        const { createClient } = await import("genlayer-js");
        const { studionet } = await import("genlayer-js/chains");

        const client = createClient({
          chain: studionet,
          provider: window.ethereum,
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
    }
  };

  // READ Operation - load policies from live smart contract
  const loadRealPolicies = async () => {
    if (isSimulatorMode) return;
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
        const parsed = JSON.parse(responseStr as string);
        setPolicies(parsed);
      }
    } catch (err) {
      console.error("Failed to load on-chain policies:", err);
    }
  };

  // Reload policies list when contract address changes or simulator mode is toggled
  useEffect(() => {
    if (!isSimulatorMode && contractAddress) {
      loadRealPolicies();
    } else if (isSimulatorMode) {
      setPolicies(INITIAL_MOCK_POLICIES);
    }
  }, [isSimulatorMode, contractAddress]);

  // Fast forward mock time offset helper
  const handleFastForwardTime = () => {
    // Offset time by 25 hours (90000s) to bypass cooling-off window
    setCurrentMockTimeOffset(prev => prev + 90000);
    alert("Simulator time fast forwarded by 25 hours. Dispute periods and cooling-off timers elapsed!");
  };

  // Formatting address helper
  const formatAddr = (addr: string) => {
    if (addr.length < 15) return addr;
    return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
  };

  // Render countdown timers for policies awaiting payouts
  const renderTimeRemaining = (policy: Policy) => {
    if (policy.status !== "AWAITING_PAYOUT") return null;
    const now = getSystemTime();
    const readyAt = parseInt(policy.payout_ready_at);
    if (now >= readyAt) {
      return <span className="text-[#EAB308] border border-[#EAB308] px-2 py-0.5 rounded text-[10px] animate-pulse">SETTLEMENT AVAILABLE</span>;
    }
    const remaining = readyAt - now;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return (
      <span className="text-[#38BDF8] border border-[#38BDF8]/30 bg-[#38BDF8]/10 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-mono">
        <Clock className="w-3 h-3 text-[#38BDF8] animate-spin" />
        {hours}h {minutes}m {seconds}s LOCKED
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0F12] text-[#38BDF8] scanlines terminal-grid flex flex-col">
      {/* HEADER SECTION */}
      <header className="border-b border-[#38BDF8]/20 bg-[#0B0F12] px-6 py-4 flex items-center justify-between shadow-lg relative z-10">
        <div className="flex items-center gap-3">
          <Globe className="w-8 h-8 text-[#38BDF8] animate-pulse" />
          <div>
            <h1 className="text-xl font-bold tracking-wider text-white flex items-center gap-2">
              PARAMETRIC SKY <span className="text-[#EAB308] text-xs px-2 py-0.5 border border-[#EAB308] rounded bg-[#EAB308]/10">DE-SCI TELEMETRY</span>
            </h1>
            <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">
              Autonomous Crop Yield Escrow & Geo-Spatial Climate Oracle
            </p>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-4">
          {/* Mock simulator toggle */}
          <div className="flex items-center gap-2 border border-[#38BDF8]/30 px-3 py-1.5 rounded-lg bg-[#0F161E]">
            <label className="text-[11px] text-gray-400 font-mono flex items-center gap-1.5 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isSimulatorMode} 
                onChange={(e) => setIsSimulatorMode(e.target.checked)}
                className="rounded border-[#38BDF8] text-[#38BDF8] focus:ring-0 cursor-pointer bg-[#0B0F12]"
              />
              MOCK SIMULATOR MODE
            </label>
            {isSimulatorMode && (
              <button 
                onClick={handleFastForwardTime}
                className="text-[10px] bg-[#EAB308]/20 text-[#EAB308] border border-[#EAB308]/50 hover:bg-[#EAB308]/40 px-2 py-0.5 rounded font-mono transition"
                title="Fast forward 25 hours to bypass locks"
              >
                FF 24H
              </button>
            )}
          </div>

          {/* Smart Contract Input Address */}
          {!isSimulatorMode && (
            <div className="flex items-center gap-2 border border-[#38BDF8]/20 px-2.5 py-1 rounded bg-[#0F161E]">
              <Settings className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="GenLayer Contract Address"
                className="bg-transparent text-[11px] font-mono border-none outline-none text-white w-[300px]"
              />
            </div>
          )}

          {/* Connect wallet */}
          {walletAddress ? (
            <div className="flex items-center gap-2 border border-[#38BDF8]/50 px-3.5 py-1.5 rounded-lg bg-[#38BDF8]/10 text-[#38BDF8] text-xs font-mono">
              <Wallet className="w-4 h-4 text-[#38BDF8]" />
              <span>{formatAddr(walletAddress)}</span>
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
          className={`px-4 py-2 border-b-2 flex items-center gap-1.5 transition ${activeTab === "about" ? "border-transparent text-gray-400 hover:text-gray-200" : "border-transparent text-gray-400 hover:text-gray-200"}`}
        >
          <HelpCircle className="w-4 h-4" /> PARAMETRIC FAQ
        </button>
      </nav>

      {/* MAIN CONTAINER */}
      <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 overflow-hidden">
        
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
                  <div className="text-[11px] font-mono text-gray-400">
                    PIN DROP LOCATION TO TRIGGER ORACLE ANALYTICS
                  </div>
                </div>

                {/* Simulated GIS Radar Screen */}
                <div 
                  className="h-[320px] bg-[#0E151D] border border-[#38BDF8]/10 rounded-lg relative overflow-hidden flex items-center justify-center cursor-crosshair group"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    // Map click to Vietnamese coordinates
                    const lat = 8.5 + (1 - y / rect.height) * 14.0;
                    const lng = 102.0 + (x / rect.width) * 8.0;
                    setPinnedCoords({ lat, lng, label: `Telemetry Grid Point [x:${x.toFixed(0)}, y:${y.toFixed(0)}]` });
                  }}
                >
                  {/* Radar sweep layer */}
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
                  <div className="absolute top-[20%] left-[60%] text-[9px] text-[#38BDF8]/40 select-none">HÀ NỘI GRID</div>
                  <div className="absolute top-[32%] left-[55%] text-[9px] text-[#38BDF8]/40 select-none">THANH HÓA COOP</div>
                  <div className="absolute top-[60%] left-[80%] text-[9px] text-[#38BDF8]/40 select-none">ĐẮK LẮK RANGE</div>
                  <div className="absolute top-[82%] left-[45%] text-[9px] text-[#38BDF8]/40 select-none">MEKONG BASIN</div>

                  {/* Blinking marker for the active pinned coordinates */}
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
                    <div className="text-gray-300 truncate" title={mockTelemetryUrl}>{mockTelemetryUrl}</div>
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

                {/* Custom Responsive SVG Chart */}
                <div className="h-[200px] w-full bg-[#0E151D] border border-[#38BDF8]/10 rounded-lg relative p-3">
                  <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                    {/* Gridlines */}
                    <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(56, 189, 248, 0.08)" />
                    <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(56, 189, 248, 0.08)" />
                    <line x1="0" y1="90" x2="500" y2="90" stroke="rgba(56, 189, 248, 0.08)" />
                    <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(56, 189, 248, 0.08)" />
                    
                    {/* Verticals */}
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

                    {/* Trigger Threshold NDVI = 0.25 */}
                    <line x1="0" y1="90" x2="500" y2="90" stroke="#DC2626" strokeWidth="1" strokeDasharray="4,4" />
                    
                    {/* Drought Deficit Zone Shaded Area */}
                    <path
                      d="M 0,90 L 500,90 L 500,120 L 0,120 Z"
                      fill="rgba(220, 38, 38, 0.07)"
                    />

                    {/* Path 1: Healthy Reference NDVI (Green) */}
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

                    {/* Path 2: Actual Measured NDVI (Wheat Golden) */}
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

                    {/* Circles on data points */}
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
                  
                  {/* Y Axis Labels */}
                  <div className="absolute left-2 top-2 text-[9px] text-gray-500 font-mono flex flex-col justify-between h-[85%]">
                    <div>NDVI 0.7</div>
                    <div>NDVI 0.5</div>
                    <div>NDVI 0.25 [THRESHOLD]</div>
                    <div>NDVI 0.1</div>
                  </div>
                  
                  {/* X Axis Labels */}
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
                    <span className="text-gray-400 block text-[10px]">MIN NDVI VALUE:</span>
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

            {/* RIGHT COLUMN: PIPELINE & REGISTRATION FORM (4 cols) */}
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

                  {/* 4 Pipeline Steps */}
                  <div className="space-y-4 font-mono text-xs">
                    
                    {/* Stage 1 */}
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
                        Cào dữ liệu thô viễn thám Sentinel từ vệ tinh.
                      </div>
                    </div>

                    {/* Stage 2 */}
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
                        Đo đạc chỉ số thực vật viễn thám NDVI và lập bản đồ suy giảm.
                      </div>
                    </div>

                    {/* Stage 3 */}
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
                        Đối chiếu lượng mưa & trạm đo khí tượng mở vùng.
                      </div>
                    </div>

                    {/* Stage 4 */}
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
                        AI Consensus phán quyết bồi thường tự động và phân giải.
                      </div>
                    </div>

                  </div>
                </div>

                {/* Pipeline logs or controls */}
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

                  <button
                    disabled={(currentPolicy.status !== "ACTIVE" && currentPolicy.status !== "DISPUTED") || pipelineStep >= 0}
                    onClick={() => handleTriggerAssessment(currentPolicy.id)}
                    className="w-full bg-[#EAB308] hover:bg-[#EAB308]/80 text-[#0B0F12] disabled:bg-gray-800 disabled:text-gray-500 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs transition uppercase"
                  >
                    <Play className="w-4 h-4" /> Trigger Satellite Assessment
                  </button>
                  {currentPolicy.status !== "ACTIVE" && currentPolicy.status !== "DISPUTED" && (
                    <p className="text-[10px] text-gray-400 font-mono text-center mt-2">
                      Assessment only available for ACTIVE or DISPUTED policies.
                    </p>
                  )}
                </div>

              </div>
            </div>
          </>
        )}

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
                <button
                  onClick={() => setShowUnderwriteModal(true)}
                  className="bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] font-semibold px-4 py-2 rounded-lg text-xs font-mono flex items-center gap-1.5 transition"
                >
                  <Shield className="w-4 h-4" /> UNDERWRITE NEW POLICY
                </button>
              </div>

              {/* Policy Table */}
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
                    {policies.map((p) => (
                      <React.Fragment key={p.id}>
                        <tr 
                          onClick={() => {
                            setSelectedPolicyId(p.id);
                            // Extract coords if possible
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
                          
                          {/* Status */}
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

                          {/* Verdict */}
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

                          {/* Confidence */}
                          <td className="p-3 text-center text-gray-300">
                            {p.confidence !== "0" ? `${p.confidence}%` : "—"}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right">
                            <div className="flex justify-end items-center gap-2">
                              {/* 24h timer render */}
                              {renderTimeRemaining(p)}

                              {p.status === "ACTIVE" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTriggerAssessment(p.id);
                                  }}
                                  className="bg-[#EAB308] hover:bg-[#EAB308]/80 text-[#0B0F12] px-2 py-1 rounded text-[11px] font-bold uppercase transition"
                                >
                                  Assess
                                </button>
                              )}

                              {p.status === "AWAITING_PAYOUT" && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowDisputeInput(p.id);
                                    }}
                                    className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-[11px] font-bold uppercase transition"
                                  >
                                    Dispute
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFinalizeSettlement(p.id);
                                    }}
                                    className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-[11px] font-bold uppercase transition"
                                  >
                                    Finalize
                                  </button>
                                </>
                              )}

                              {(p.status === "DISPUTED" || p.status === "ESCALATED") && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowEscalateInput(p.id);
                                  }}
                                  className="bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] px-2 py-1 rounded text-[11px] font-bold uppercase transition"
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
                              <div className="flex flex-col gap-2 max-w-xl">
                                <span className="text-red-400 font-bold text-[11px]">RAISE PARAMETRIC ORACLE DISPUTE</span>
                                <input
                                  type="text"
                                  placeholder="Enter specific telemetry dispute reason (e.g. Irrigation canal offset, local gauge discrepancy)..."
                                  value={disputeReason}
                                  onChange={(e) => setDisputeReason(e.target.value)}
                                  className="bg-black/80 border border-red-500/40 p-2 text-xs rounded text-white outline-none focus:border-red-500"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleRaiseDispute(p.id)}
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded text-[11px] transition"
                                  >
                                    File Dispute (Escrow Locked)
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
                                <span className="text-[#38BDF8] font-bold text-[11px]">ADMINISTRATIVE RESOLUTION FOR DISPUTED CONTRACT</span>
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
                                    className="bg-[#38BDF8] hover:bg-[#38BDF8]/80 text-[#0B0F12] font-bold px-3 py-1 rounded text-[11px] transition"
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
                          <td colSpan={9} className="px-3 py-2 text-[10px] text-gray-400 leading-relaxed font-mono">
                            <span className="text-[#38BDF8]">Oracle Verdict Log:</span> {p.reason}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {activeTab === "about" && (
          <div className="xl:col-span-12 border border-[#38BDF8]/20 bg-[#0B0F12]/80 backdrop-blur rounded-lg p-6 max-w-4xl mx-auto font-mono text-xs space-y-4">
            <h2 className="text-base font-bold text-white uppercase border-b border-[#38BDF8]/10 pb-2 flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#38BDF8]" /> Parametric Weather Insurance & DeSci
            </h2>
            <p className="leading-relaxed">
              Bảo hiểm tham số (Parametric Insurance) giải quyết triệt để sự chậm trễ và tranh chấp của bảo hiểm truyền thống bằng cách sử dụng các chỉ số khách quan đo được từ xa thay vì giám định trực tiếp.
            </p>

            <div className="border border-[#EAB308]/20 bg-[#EAB308]/5 p-4 rounded-lg space-y-2">
              <h3 className="font-bold text-[#EAB308] uppercase text-xs">GenLayer Intelligent Contracts</h3>
              <p className="leading-relaxed">
                Hợp đồng thông minh của GenLayer cho phép nhúng **AI Consensus** để đánh giá dữ liệu phi cấu trúc và các phép tính không xác định. Khi farmer yêu cầu đền bù, hợp đồng sẽ sử dụng `gl.nondet.web.render` để cào dữ liệu viễn thám thực tế, chạy LLM đánh giá thông số hạn hán, và đạt đồng thuận đa số giữa các nút mạng trước khi phân phối quỹ ký quỹ.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white uppercase text-xs">Các tham số viễn thám được sử dụng:</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-300">
                <li>
                  <strong className="text-[#38BDF8]">NDVI (Normalized Difference Vegetation Index):</strong> Chỉ số đo lượng diệp lục quang hợp. Nếu NDVI liên tục sụt giảm dưới mức 0.25 trong 14 ngày, cây trồng đang gặp stress sinh học nghiêm trọng do thiếu nước.
                </li>
                <li>
                  <strong className="text-[#38BDF8]">Nhiệt độ bề mặt đất (Surface Temp):</strong> Liên tục duy trì ở ngưỡng cao &ge; 38 C gây héo rũ diệp lục.
                </li>
                <li>
                  <strong className="text-[#38BDF8]">Lượng mưa (Rainfall gauge):</strong> Xác thực tình trạng thiếu hụt lượng nước tưới tự nhiên từ trạm Open-Meteo.
                </li>
              </ul>
            </div>

            <div className="border border-gray-800 pt-4 flex gap-4 text-[10px] text-gray-500">
              <span>Status: Active</span>
              <span>Network: Studionet / Mock</span>
              <span>Version: v0.2.18</span>
            </div>
          </div>
        )}

      </main>

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
            className="bg-[#0B0F12] border border-[#38BDF8]/40 p-6 rounded-lg max-w-lg w-full space-y-4 font-mono text-xs"
          >
            <h3 className="text-white font-bold text-sm tracking-wider uppercase border-b border-[#38BDF8]/10 pb-2 flex items-center gap-1.5">
              <Shield className="w-4.5 h-4.5 text-[#EAB308]" /> Underwrite New Climate Policy
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 block mb-1">POLICY ID:</label>
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
