import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

async function main() {
  console.log("Connecting to GenLayer Studionet...");
  const client = createClient({
    chain: studionet,
  });

  const contractAddress = "0xba779EafE06ff3D043aEAfD6b4D22EFFaa3D0907";
  console.log("Reading policies from contract:", contractAddress);

  try {
    const response = await client.readContract({
      address: contractAddress,
      functionName: "get_all_policies",
      args: [],
    });
    console.log("\n--- Contract Read Response ---");
    console.log("Raw Response string:", response);
    const parsed = JSON.parse(response);
    console.log("Parsed Policies list count:", parsed.length);
    console.log("Policies:", JSON.stringify(parsed, null, 2));
    console.log("------------------------------");
    console.log("\nSUCCESS: On-chain connection and read query executed successfully!");
  } catch (err) {
    console.error("\nFAILURE: On-chain read failed:", err);
    process.exit(1);
  }
}

main();
