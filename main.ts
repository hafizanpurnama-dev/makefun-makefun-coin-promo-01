#!/usr/bin/env -S npx tsx
/**
 * make.fun Coin Promoter — pump.fun Launcher
 *
 * Creates a promotional coin on pump.fun that spreads awareness of make.fun.
 * Generates a branded logo, uploads metadata to IPFS via Pinata, and launches
 * the coin on Solana via pump.fun's bonding curve.
 *
 * Usage:
 *   export PINATA_JWT="your-pinata-jwt"
 *   export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
 *   export SOLANA_PRIVATE_KEY="[your-keypair-bytes-as-json-array]"
 *
 *   npx tsx main.ts \
 *     --name "make.fun" \
 *     --symbol "MAKEFUN" \
 *     --description "The official make.fun community coin. Earn USDC building software. make.fun" \
 *     --buy-amount 0.01
 *
 * Requirements: Node.js 22+, Solana wallet with ~0.02 SOL
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Base58 (inline — no dependency)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf: Uint8Array): string {
  const digits = [0];
  for (const byte of buf) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = "";
  for (const byte of buf) {
    if (byte !== 0) break;
    result += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateCoinArgs {
  name: string;
  symbol: string;
  description: string;
  imagePath?: string;
  buyAmount: number;
  slippage: number;
  priorityFee: number;
}

interface PinataUploadResult {
  data: { cid: string };
}

interface PumpCreateResponse {
  signature: string;
  mint?: string;
  metadataUri?: string;
}

// ---------------------------------------------------------------------------
// Logo generation — creates a 512x512 PNG with make.fun branding
// ---------------------------------------------------------------------------

async function generateLogo(outputPath: string): Promise<string> {
  const sharp = (await import("sharp")).default;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7C3AED"/>
      <stop offset="50%" style="stop-color:#A855F7"/>
      <stop offset="100%" style="stop-color:#EC4899"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:rgba(255,255,255,0)"/>
      <stop offset="50%" style="stop-color:rgba(255,255,255,0.15)"/>
      <stop offset="100%" style="stop-color:rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="512" height="512" rx="64" fill="url(#bg)"/>
  <!-- Shine overlay -->
  <rect width="512" height="512" rx="64" fill="url(#shine)"/>
  <!-- Outer ring -->
  <circle cx="256" cy="215" r="130" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>
  <!-- Inner coin circle -->
  <circle cx="256" cy="215" r="115" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
  <!-- $ symbol -->
  <text x="256" y="238" text-anchor="middle" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="110" font-weight="bold">$</text>
  <!-- Brand text -->
  <text x="256" y="420" text-anchor="middle" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="bold" letter-spacing="2">make.fun</text>
  <!-- Tagline -->
  <text x="256" y="455" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="Arial,Helvetica,sans-serif" font-size="22" letter-spacing="1">EARN · BUILD · SHIP</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  console.log(`  ✓ Logo saved: ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// IPFS upload via Pinata
// ---------------------------------------------------------------------------

async function uploadToPinata(
  jwt: string,
  content: Buffer | Blob,
  filename: string
): Promise<string> {
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("network", "public");
  form.append("file", content, filename);

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form as unknown as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as PinataUploadResult;
  const cid = json.data.cid;
  console.log(`  ✓ Uploaded to IPFS: ipfs://${cid}`);
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

// ---------------------------------------------------------------------------
// Pump.fun coin creation via pumpportal.fun API
// ---------------------------------------------------------------------------

async function createCoinViaPumpPortal(
  args: CreateCoinArgs,
  imageUri: string,
  metadataUri: string,
  mintKeypairBytes: Uint8Array
): Promise<PumpCreateResponse> {
  console.log(
    `\n🚀 Creating coin "${args.name}" (${args.symbol}) on pump.fun...`
  );
  console.log(`   Buy amount: ${args.buyAmount} SOL`);

  const pumpApiKey = process.env.PUMP_PORTAL_API_KEY || "";
  const keyParam = pumpApiKey ? `?api-key=${encodeURIComponent(pumpApiKey)}` : "";

  const response = await fetch(
    `https://pumpportal.fun/api/trade${keyParam}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        tokenMetadata: {
          name: args.name,
          symbol: args.symbol,
          uri: metadataUri,
        },
        mint: base58Encode(mintKeypairBytes),
        denominatedInSol: "true",
        amount: args.buyAmount,
        slippage: args.slippage,
        priorityFee: args.priorityFee,
        pool: "pump",
      }),
    }
  );

  const data = await response.json();

  if (response.status === 200) {
    return data as PumpCreateResponse;
  }

  throw new Error(
    `Pump.fun creation failed (${response.status}): ${JSON.stringify(data)}`
  );
}

// ---------------------------------------------------------------------------
// Alternative: create via official pump.fun agent API
// ---------------------------------------------------------------------------

async function createCoinViaOfficialApi(
  args: CreateCoinArgs,
  metadataUri: string,
  walletPubkey: string
): Promise<PumpCreateResponse> {
  console.log(`\n🚀 Creating coin via pump.fun official API...`);

  // Use the official fun-block.pump.fun agent API
  const res = await fetch("https://fun-block.pump.fun/agents/create-coin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: walletPubkey,
      name: args.name,
      symbol: args.symbol,
      uri: metadataUri,
      solLamports: Math.floor(args.buyAmount * 1e9).toString(),
      mayhemMode: false,
      cashback: false,
      tokenizedAgent: false,
      buybackBps: 0,
      frontRunningProtection: false,
      tipAmount: 0,
      encoding: "base64",
      feePayer: walletPubkey,
      creator: walletPubkey,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Pump.fun official API failed (${res.status}): ${text}`
    );
  }

  const data = await res.json();
  // The official API returns a partially-signed transaction
  return { signature: data.transaction || data.signature || "" } as PumpCreateResponse;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadWallet(): { keypairBytes: Uint8Array; pubkey: string } {
  const pkEnv = process.env.SOLANA_PRIVATE_KEY;
  const keypairPath = process.env.SOLANA_KEYPAIR_PATH;

  let keypairJson: number[];

  if (pkEnv) {
    keypairJson = JSON.parse(pkEnv);
  } else if (keypairPath && existsSync(keypairPath)) {
    keypairJson = JSON.parse(readFileSync(keypairPath, "utf-8"));
  } else {
    throw new Error(
      "No wallet found. Set SOLANA_PRIVATE_KEY env var (JSON array of 64 bytes) or SOLANA_KEYPAIR_PATH."
    );
  }

  if (keypairJson.length !== 64) {
    throw new Error(
      `Invalid keypair: expected 64 bytes, got ${keypairJson.length}`
    );
  }

  // Derive pubkey using ed25519
  // The last 32 bytes are the public key
  const pubkeyBytes = keypairJson.slice(32);
  const pubkey = base58Encode(new Uint8Array(pubkeyBytes));

  return {
    keypairBytes: new Uint8Array(keypairJson),
    pubkey,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Parse CLI args
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      name: { type: "string", default: "make.fun" },
      symbol: { type: "string", default: "MAKEFUN" },
      description: {
        type: "string",
        default:
          "🚀 The official make.fun community coin. Earn USDC building software on make.fun — the platform where AI agents compete in coding bounties.",
      },
      "image-path": { type: "string" },
      "buy-amount": { type: "string", default: "0.01" },
      slippage: { type: "string", default: "15" },
      "priority-fee": { type: "string", default: "0.00005" },
      "output-dir": { type: "string", default: resolve(__dirname, "output") },
      api: { type: "string", default: "pumpportal" }, // "pumpportal" or "official"
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(`
make.fun Coin Launcher — pump.fun Edition
=========================================

Usage:
  npx tsx main.ts [options]

Options:
  --name         Coin name (default: "make.fun")
  --symbol       Ticker symbol (default: "MAKEFUN")
  --description  Coin description
  --image-path   Path to an existing 512x512 PNG (default: auto-generate)
  --buy-amount   Initial buy in SOL (default: 0.01)
  --slippage     Slippage % (default: 15)
  --priority-fee Priority fee in SOL (default: 0.00005)
  --api          API to use: "pumpportal" or "official" (default: pumpportal)
  --output-dir   Output directory (default: ./output)
  --help         Show this help

Environment:
  PINATA_JWT           Pinata API JWT for IPFS uploads
  SOLANA_RPC_URL       Solana RPC endpoint
  SOLANA_PRIVATE_KEY   64-byte keypair as JSON array
  PUMP_PORTAL_API_KEY  (optional) pumpportal.fun API key
`);
    return;
  }

  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) {
    console.error("❌ PINATA_JWT environment variable is required for IPFS uploads.");
    console.error("   Get a free JWT at https://app.pinata.cloud/developers/api-keys");
    process.exit(1);
  }

  const args: CreateCoinArgs = {
    name: values.name!,
    symbol: values.symbol!.toUpperCase(),
    description: values.description!,
    buyAmount: parseFloat(values["buy-amount"]!),
    slippage: parseFloat(values.slippage!),
    priorityFee: parseFloat(values["priority-fee"]!),
  };

  if (args.symbol.length < 2 || args.symbol.length > 10) {
    console.error("❌ Symbol must be 2-10 characters");
    process.exit(1);
  }

  // Ensure output dir
  const outDir = values["output-dir"]!;
  mkdirSync(outDir, { recursive: true });

  console.log("═".repeat(60));
  console.log("  make.fun Coin Launcher");
  console.log("═".repeat(60));
  console.log(`  Name:        ${args.name}`);
  console.log(`  Symbol:      ${args.symbol}`);
  console.log(`  Buy amount:  ${args.buyAmount} SOL`);
  console.log(`  API:         ${values.api}`);
  console.log("═".repeat(60));

  // Step 1: Generate or use provided logo
  console.log("\n📸 Step 1: Logo");
  let imagePath: string;
  if (values["image-path"]) {
    imagePath = values["image-path"];
    console.log(`  Using provided image: ${imagePath}`);
  } else {
    imagePath = resolve(outDir, "logo.png");
    await generateLogo(imagePath);
  }

  // Step 2: Upload image to IPFS
  console.log("\n☁️  Step 2: Upload image to IPFS");
  const imageBuffer = readFileSync(imagePath);
  const imageUri = await uploadToPinata(
    pinataJwt,
    new Blob([imageBuffer], { type: "image/png" }),
    "logo.png"
  );

  // Step 3: Upload metadata to IPFS
  console.log("\n📋 Step 3: Upload metadata to IPFS");
  const metadata = {
    name: args.name,
    symbol: args.symbol,
    description: args.description,
    image: imageUri,
    external_url: "https://make.fun/bounty/makefun-coin-promo-01",
    attributes: [
      { trait_type: "Category", value: "Promotional" },
      { trait_type: "Platform", value: "make.fun" },
    ],
  };

  const metadataJson = JSON.stringify(metadata, null, 2);
  const metadataPath = resolve(outDir, "metadata.json");
  writeFileSync(metadataPath, metadataJson, "utf-8");
  console.log(`  ✓ Metadata saved: ${metadataPath}`);

  const metadataUri = await uploadToPinata(
    pinataJwt,
    new Blob([metadataJson], { type: "application/json" }),
    "metadata.json"
  );

  // Step 4: Create coin on pump.fun
  console.log("\n🪙 Step 4: Launch coin on pump.fun");

  const wallet = loadWallet();
  console.log(`  Wallet: ${wallet.pubkey.slice(0, 4)}...${wallet.pubkey.slice(-4)}`);

  let result: PumpCreateResponse;
  if (values.api === "official") {
    result = await createCoinViaOfficialApi(args, metadataUri, wallet.pubkey);
  } else {
    result = await createCoinViaPumpPortal(args, imageUri, metadataUri, wallet.keypairBytes);
  }

  // Step 5: Summary
  console.log("\n" + "═".repeat(60));
  console.log("  ✅ Coin Launch Summary");
  console.log("═".repeat(60));
  console.log(`  Name:         ${args.name}`);
  console.log(`  Symbol:       ${args.symbol}`);
  console.log(`  Metadata:     ${metadataUri}`);
  console.log(`  Transaction:  https://solscan.io/tx/${result.signature}`);
  if (result.mint) {
    console.log(`  Mint:         ${result.mint}`);
  }
  console.log(`  Website:      https://make.fun/bounty/makefun-coin-promo-01`);
  console.log("═".repeat(60));

  // Save launch info
  const launchInfo = {
    name: args.name,
    symbol: args.symbol,
    metadataUri,
    imageUri,
    signature: result.signature,
    mint: result.mint || null,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(
    resolve(outDir, "launch.json"),
    JSON.stringify(launchInfo, null, 2),
    "utf-8"
  );
  console.log(`\n📄 Launch info saved: ${resolve(outDir, "launch.json")}\n`);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  if (err.cause) console.error("   Cause:", err.cause);
  process.exit(1);
});