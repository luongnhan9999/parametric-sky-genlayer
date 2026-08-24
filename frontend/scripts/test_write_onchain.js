import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: Please provide your private key using the PRIVATE_KEY environment variable.");
    console.error("Usage: PRIVATE_KEY=0x... node scripts/test_write_onchain.js");
    process.exit(1);
  }

  const contractAddress = "0x5f1D854944C7B76c0fFb9fd4258F48F25A563B25";
  console.log("Using contract address:", contractAddress);

  try {
    const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
    console.log("Signing transactions with account:", account.address);

    const client = createClient({
      chain: studionet,
      account,
    });

    const policyId = `test_script_${Math.random().toString(36).substring(2, 8)}`;
    const insuredAddress = account.address; // Use same address for simplicity
    const termsUrl = "https://parametric.io/terms/rice_irrigation_2026.json";
    const geoCoords = "19.8067 N, 105.7851 E";
    const droughtTrigger = "NDVI < 0.25 for 14 days OR Rainfall < 10mm";
    const coverageAmount = 5n * 10n**18n; // 5 GEN (scaled correctly to 18 decimals)

    console.log(`\nStep 1: Underwriting policy '${policyId}' with 5 GEN...`);
    const underwriteHash = await client.writeContract({
      address: contractAddress,
      functionName: "underwrite_policy",
      args: [policyId, insuredAddress, termsUrl, geoCoords, droughtTrigger],
      value: coverageAmount,
    });
    console.log("Underwrite tx submitted. Hash:", underwriteHash);

    console.log("Waiting for block finalization...");
    await client.waitForTransactionReceipt({ hash: underwriteHash });
    console.log("SUCCESS: Underwritten successfully!");

    console.log(`\nStep 2: Triggering claim assessment for '${policyId}'...`);
    const telemetryUrl = "https://satellite-feed.copernicus.eu/telemetry_198067_1057851.json";
    const triggerHash = await client.writeContract({
      address: contractAddress,
      functionName: "trigger_claim_assessment",
      args: [policyId, telemetryUrl],
      value: 0n,
    });
    console.log("Trigger tx submitted. Hash:", triggerHash);

    console.log("Waiting for block finalization...");
    await client.waitForTransactionReceipt({ hash: triggerHash });
    console.log("SUCCESS: Assessment triggered successfully!");

    console.log("\nStep 3: Verifying policy state on-chain...");
    const response = await client.readContract({
      address: contractAddress,
      functionName: "get_all_policies",
      args: [],
    });
    const parsed = JSON.parse(response);
    const policy = parsed.find(p => p.id === policyId);
    if (policy) {
      console.log("\n--- Policy On-Chain State ---");
      console.log("ID:", policy.id);
      console.log("Status:", policy.status);
      console.log("Verdict:", policy.verdict);
      console.log("Reason:", policy.reason);
      console.log("Confidence:", policy.confidence);
      console.log("------------------------------");
      console.log("\nALL TASKS TESTED SUCCESSFULLY ON-CHAIN!");
    } else {
      console.error("Error: Policy not found in list.");
    }
  } catch (err) {
    console.error("\nFAILURE: On-chain transaction failed:", err);
    process.exit(1);
  }
}

main();
