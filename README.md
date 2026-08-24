# ParametricSky 🛰️🌾
> **Autonomous Satellite Telemetry Weather Insurance & Crop Yield Oracle Escrow**

ParametricSky is a decentralized parametric insurance protocol and decentralized crop drought/natural disaster escrow system powered by remote sensing satellite telemetry and AI consensus on the **GenLayer** network.

---

## 📖 Real-World Problem & Solution

### 1. The Problem
Traditional agricultural crop insurance contracts require manual, on-site damage assessment that can take months to process. This delay causes critical cash-flow issues for farmers, is highly prone to evaluation disputes, and increases administrative overhead.

### 2. The GenLayer Solution
* **Escrow Pools:** Underwriters lock the crop insurance coverage deposit inside the GenLayer Intelligent Contract.
* **On-Chain Web Ingestion:** In the event of a drought, the contract queries open-source satellite telemetry (like Open-Meteo, NOAA/Copernicus Sentinel sensory data) using `gl.nondet.web.render` directly from the blockchain.
* **AI Consensus Arbitration:** Multiple GenLayer validator nodes process the raw weather data, calculating the Normalized Difference Vegetation Index (NDVI) and continuous ground surface heat metrics. They run an on-chain LLM consensus prompt (`gl.vm.run_nondet`) to reach agreement on whether the parametric drought thresholds are met and automatically execute tiered payouts without human intermediaries.

---

## 🛠️ Repository Structure

```
├── contracts/
│   └── ParametricSky.py        # GenLayer Intelligent Contract (Python)
├── tests/
│   └── test_parametric_sky.py  # Contract Test Suite with Mock GenLayer VM
├── scripts/
│   └── verify_contract.py      # Dry-run compilation and unit test execution script
├── frontend/                   # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── App.tsx             # Interactive GIS Map & NDVI Spectral Curve Chart Dashboard
│   │   └── ...
│   └── package.json
└── README.md                   # System documentation and instructions
```

---

## 🚀 Getting Started

### 1. Prerequisites
* Python 3.10+
* Node.js v18+ and npm

### 2. Test Smart Contract Logic
Run the automated test suite verifying parametric claims, disputing payouts, and admin-arbitration:
```bash
python -m unittest tests/test_parametric_sky.py
```
Or execute the verification helper:
```bash
python scripts/verify_contract.py
```

### 3. Deploy Contract to Studionet
Deploy the Intelligent Contract onto the GenLayer network:
```bash
genlayer deploy --contract contracts/ParametricSky.py
```

### 4. Run Frontend Locally
Navigate to the `frontend/` directory, install packages, and boot the Vite development server:
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Open your browser to `http://localhost:5173`.

---

## 📡 GIS Geo-Spatial Satellite Map Terminal Vibe

* **Visual Style:** Topographic Geo-Spatial Satellite Surveillance Terminal layout.
* **Color Palette:** Earth Radar Charcoal background, Crop Golden / Wheat highlights, Active Satellite Cyan indicators, and Drought Hazard Red alarms.
* **Key Features:**
  * **Interactive Satellite Coordinates Pinning:** Drop custom GPS coordinates on the interactive radar map grid to simulate region-specific telemetry scraping.
  * **NDVI Multi-Spectrum Spectral Curve Chart:** Interactive SVG chart displaying crop vegetation chlorophyll reflections vs the trigger threshold.
  * **Autonomous Claim Execution Pipeline:** Visual 4-stage neon progress scan tracing satellite ingestion, NDVI computation, weather validation, and validator consensus finalization.
  * **Dual Wallet / Simulator Mode:** Operates either as a fully integrated Web3 dApp with MetaMask on Studionet or in Mock Simulator mode for local testing.

---

## 🔗 Live App & Deployed Contract
* **Live App:** https://parametric-sky-genlayer.vercel.app
* **Deployed Contract:** `0xba779EafE06ff3D043aEAfD6b4D22EFFaa3D0907`
* **Explorer Link:** https://genlayer-explorer.vercel.app/address/0xba779EafE06ff3D043aEAfD6b4D22EFFaa3D0907

---

## 📝 Notes / Description
* **GenLayer Integration Necessity:** Traditional EVM blockchains are limited to deterministic execution and cannot access web data natively. GenLayer resolves this by introducing an Intelligent AI Consensus VM, enabling the contract to query satellite imagery directly and make subjective evaluations through decentralized LLM nodes.
* **Mock Simulator Mode:** To make the application instantly testable in any browser environment, the dApp features a robust Simulator mode that mimics on-chain policies, progress logs, and consensus outcomes.
* **Fast-Forward (FF 24H) Utility:** Bypasses the 24-hour dispute cooling-off window in Simulator mode so developers can test the full payout/refund cycle instantly.
