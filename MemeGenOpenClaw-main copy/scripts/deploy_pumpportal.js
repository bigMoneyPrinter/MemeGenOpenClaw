/**
 * PumpPortal Token Deployment Script
 *
 * Deploy tokens on Pump.fun using the PumpPortal Local Transaction API.
 * This is an alternative to the pumpdotfun-sdk which may have compatibility issues
 * with recent Pump.fun program updates.
 *
 * Flow:
 * 1. Upload image and metadata to IPFS via pump.fun/api/ipfs
 * 2. Get unsigned transaction from pumpportal.fun/api/trade-local
 * 3. Sign transaction locally with wallet keypair AND mint keypair
 * 4. Submit transaction to Solana
 *
 * Usage:
 *   node scripts/deploy_pumpportal.js --name "TokenName" --symbol "TKN" --description "Description" --image "./path/to/image.png" [--devbuy 0.0001]
 */

const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // RPC URL - Using a public Solana mainnet RPC
  // For production, use a premium RPC like Helius, QuickNode, or Triton
  RPC_URL: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",

  // Default wallet path (relative to project root)
  DEFAULT_WALLET_PATH: "./trendtoken-output/wallet.json",

  // PumpPortal API endpoints
  PUMP_IPFS_URL: "https://pump.fun/api/ipfs",
  PUMPPORTAL_TRADE_URL: "https://pumpportal.fun/api/trade-local",

  // Default devbuy amount in SOL
  // Some docs say 0.0001 SOL minimum, others say 0.02 SOL
  // We'll try with minimal first
  DEFAULT_DEVBUY_SOL: 0.0001,

  // Default slippage percentage
  DEFAULT_SLIPPAGE: 10,

  // Default priority fee in SOL
  DEFAULT_PRIORITY_FEE: 0.0005,

  // Transaction commitment level
  COMMITMENT: "confirmed",

  // Token decimals for Pump.fun
  TOKEN_DECIMALS: 6
};

// ============================================================================
// Logging Utilities
// ============================================================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

let currentLogLevel = LOG_LEVELS.INFO;

function setLogLevel(level) {
  currentLogLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
}

function log(level, message, data = null) {
  if (LOG_LEVELS[level] >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

function logDebug(message, data = null) { log("DEBUG", message, data); }
function logInfo(message, data = null) { log("INFO", message, data); }
function logWarn(message, data = null) { log("WARN", message, data); }
function logError(message, data = null) { log("ERROR", message, data); }

// ============================================================================
// Wallet Utilities
// ============================================================================

/**
 * Load a Keypair from a wallet JSON file
 * @param {string} walletPath - Path to the wallet JSON file
 * @returns {Keypair} - The loaded Keypair
 */
function loadWallet(walletPath) {
  const resolvedPath = path.resolve(walletPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Wallet file not found: ${resolvedPath}`);
  }

  try {
    const walletData = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));

    // Handle different wallet formats
    let secretKey;
    if (Array.isArray(walletData)) {
      // Standard Solana CLI format: array of numbers
      secretKey = Uint8Array.from(walletData);
    } else if (walletData.secretKey) {
      // Object format with secretKey property
      secretKey = Uint8Array.from(walletData.secretKey);
    } else if (walletData.privateKey) {
      // Object format with privateKey property (base58)
      const bs58 = require("bs58");
      secretKey = bs58.decode(walletData.privateKey);
    } else {
      throw new Error("Unrecognized wallet format");
    }

    const keypair = Keypair.fromSecretKey(secretKey);
    logInfo(`Loaded wallet: ${keypair.publicKey.toBase58()}`);
    return keypair;

  } catch (error) {
    throw new Error(`Failed to load wallet from ${resolvedPath}: ${error.message}`);
  }
}

// ============================================================================
// IPFS Upload
// ============================================================================

/**
 * Upload token metadata and image to IPFS via Pump.fun's API
 *
 * @param {Object} metadata - Token metadata
 * @param {string} metadata.name - Token name
 * @param {string} metadata.symbol - Token symbol
 * @param {string} metadata.description - Token description
 * @param {string} metadata.imagePath - Path to image file
 * @param {string} metadata.twitter - Optional Twitter URL
 * @param {string} metadata.telegram - Optional Telegram URL
 * @param {string} metadata.website - Optional Website URL
 * @returns {Object} - { metadataUri, metadata }
 */
async function uploadToIPFS(metadata) {
  const { name, symbol, description, imagePath, twitter = "", telegram = "", website = "" } = metadata;

  logInfo("Uploading metadata to IPFS...");

  // Read image file
  const resolvedImagePath = path.resolve(imagePath);
  if (!fs.existsSync(resolvedImagePath)) {
    throw new Error(`Image file not found: ${resolvedImagePath}`);
  }

  const imageBuffer = fs.readFileSync(resolvedImagePath);
  const imageName = path.basename(resolvedImagePath);
  const mimeType = getMimeType(resolvedImagePath);

  logInfo(`Image loaded: ${resolvedImagePath} (${(imageBuffer.length / 1024).toFixed(2)} KB)`);

  // Create FormData for the upload
  const FormData = (await import("form-data")).default;
  const formData = new FormData();

  // Add the image file
  formData.append("file", imageBuffer, {
    filename: imageName,
    contentType: mimeType
  });

  // Add metadata fields
  formData.append("name", name);
  formData.append("symbol", symbol);
  formData.append("description", description);
  if (twitter) formData.append("twitter", twitter);
  if (telegram) formData.append("telegram", telegram);
  if (website) formData.append("website", website);

  // Upload to Pump.fun IPFS endpoint
  const response = await fetch(CONFIG.PUMP_IPFS_URL, {
    method: "POST",
    body: formData,
    headers: formData.getHeaders()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`IPFS upload failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  logInfo(`IPFS upload successful!`);
  logDebug("IPFS response:", result);

  return {
    metadataUri: result.metadataUri,
    metadata: result.metadata || result
  };
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
  };
  return mimeTypes[ext] || "image/png";
}

// ============================================================================
// Token Creation via PumpPortal
// ============================================================================

/**
 * Create a token using PumpPortal's Local Transaction API
 *
 * @param {Object} options - Creation options
 * @param {Keypair} options.walletKeypair - The wallet keypair
 * @param {Keypair} options.mintKeypair - The mint keypair for the new token
 * @param {string} options.metadataUri - IPFS metadata URI
 * @param {string} options.name - Token name
 * @param {string} options.symbol - Token symbol
 * @param {number} options.devbuySol - Amount of SOL to buy (0 for no initial buy)
 * @param {number} options.slippage - Slippage percentage
 * @param {number} options.priorityFee - Priority fee in SOL
 * @returns {Object} - { transaction, mintAddress }
 */
async function createTokenTransaction(options) {
  const {
    walletKeypair,
    mintKeypair,
    metadataUri,
    name,
    symbol,
    devbuySol = CONFIG.DEFAULT_DEVBUY_SOL,
    slippage = CONFIG.DEFAULT_SLIPPAGE,
    priorityFee = CONFIG.DEFAULT_PRIORITY_FEE
  } = options;

  logInfo("Requesting token creation transaction from PumpPortal...");
  logDebug("Options:", {
    publicKey: walletKeypair.publicKey.toBase58(),
    mint: mintKeypair.publicKey.toBase58(),
    name,
    symbol,
    metadataUri,
    devbuySol,
    slippage,
    priorityFee
  });

  // Prepare token metadata for PumpPortal
  const tokenMetadata = {
    name: name,
    symbol: symbol,
    uri: metadataUri
  };

  // Request body for PumpPortal API
  const requestBody = {
    publicKey: walletKeypair.publicKey.toBase58(),
    action: "create",
    tokenMetadata: tokenMetadata,
    mint: mintKeypair.publicKey.toBase58(),
    denominatedInSol: "true",
    amount: devbuySol,
    slippage: slippage,
    priorityFee: priorityFee,
    pool: "pump"
  };

  logDebug("PumpPortal request body:", JSON.stringify(requestBody, null, 2));

  const response = await fetch(CONFIG.PUMPPORTAL_TRADE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PumpPortal API error (${response.status}): ${errorText}`);
  }

  // The response is a serialized transaction
  const transactionData = await response.arrayBuffer();

  logInfo("Transaction received from PumpPortal");

  return {
    transactionData: new Uint8Array(transactionData),
    mintAddress: mintKeypair.publicKey.toBase58()
  };
}

/**
 * Sign and submit the transaction
 *
 * @param {Uint8Array} transactionData - Serialized transaction
 * @param {Keypair} walletKeypair - Wallet keypair
 * @param {Keypair} mintKeypair - Mint keypair
 * @param {Connection} connection - Solana connection
 * @returns {string} - Transaction signature
 */
async function signAndSubmitTransaction(transactionData, walletKeypair, mintKeypair, connection) {
  logInfo("Deserializing transaction...");

  // Deserialize the versioned transaction
  const transaction = VersionedTransaction.deserialize(transactionData);

  logInfo("Signing transaction with wallet and mint keypairs...");

  // Sign with both the wallet keypair AND the mint keypair
  // The mint keypair is needed because we're creating a new token
  transaction.sign([mintKeypair, walletKeypair]);

  logInfo("Submitting transaction to Solana...");

  // Send the transaction
  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: CONFIG.COMMITMENT,
    maxRetries: 3
  });

  logInfo(`Transaction submitted: ${signature}`);

  // Wait for confirmation
  logInfo("Waiting for confirmation...");

  const confirmation = await connection.confirmTransaction(signature, CONFIG.COMMITMENT);

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  logInfo("Transaction confirmed!");

  return signature;
}

// ============================================================================
// Main Deploy Function
// ============================================================================

/**
 * Deploy a new token on Pump.fun using PumpPortal API
 *
 * @param {Object} options - Deployment options
 * @param {string} options.name - Token name
 * @param {string} options.symbol - Token symbol (ticker)
 * @param {string} options.description - Token description
 * @param {string} options.imagePath - Path to the token image file
 * @param {number} options.devbuySol - Amount of SOL for devbuy (default: 0.0001)
 * @param {string} options.walletPath - Path to wallet JSON file
 * @param {string} options.twitter - Optional Twitter URL
 * @param {string} options.telegram - Optional Telegram URL
 * @param {string} options.website - Optional Website URL
 * @param {number} options.slippage - Slippage percentage (default: 10)
 * @param {number} options.priorityFee - Priority fee in SOL (default: 0.0005)
 * @returns {Object} - Deployment result
 */
async function deployToken(options) {
  const {
    name,
    symbol,
    description,
    imagePath,
    devbuySol = CONFIG.DEFAULT_DEVBUY_SOL,
    walletPath = CONFIG.DEFAULT_WALLET_PATH,
    twitter = "",
    telegram = "",
    website = "",
    slippage = CONFIG.DEFAULT_SLIPPAGE,
    priorityFee = CONFIG.DEFAULT_PRIORITY_FEE
  } = options;

  logInfo("=".repeat(60));
  logInfo("Starting PumpPortal token deployment...");
  logInfo("=".repeat(60));
  logInfo(`Name: ${name}`);
  logInfo(`Symbol: ${symbol}`);
  logInfo(`Description: ${description.substring(0, 50)}${description.length > 50 ? "..." : ""}`);
  logInfo(`DevBuy: ${devbuySol} SOL`);
  logInfo(`Image: ${imagePath}`);

  // Validate inputs
  if (!name || name.length === 0) {
    throw new Error("Token name is required");
  }
  if (!symbol || symbol.length === 0) {
    throw new Error("Token symbol is required");
  }
  if (!description || description.length === 0) {
    throw new Error("Token description is required");
  }
  if (!imagePath) {
    throw new Error("Image path is required");
  }

  // Load wallet
  const walletKeypair = loadWallet(walletPath);

  // Create connection
  const connection = new Connection(CONFIG.RPC_URL, {
    commitment: CONFIG.COMMITMENT,
    confirmTransactionInitialTimeout: 60000
  });

  // Check wallet balance
  const balance = await connection.getBalance(walletKeypair.publicKey);
  const balanceSol = balance / LAMPORTS_PER_SOL;
  logInfo(`Wallet balance: ${balanceSol.toFixed(4)} SOL`);

  // Estimate required balance (devbuy + fees)
  const estimatedRequired = devbuySol + 0.05; // Buffer for fees
  if (balanceSol < estimatedRequired) {
    throw new Error(`Insufficient balance. Need ~${estimatedRequired.toFixed(3)} SOL, have ${balanceSol.toFixed(4)} SOL`);
  }

  // Step 1: Upload to IPFS
  logInfo("");
  logInfo("Step 1: Uploading metadata to IPFS...");
  const ipfsResult = await uploadToIPFS({
    name,
    symbol,
    description,
    imagePath,
    twitter,
    telegram,
    website
  });

  logInfo(`Metadata URI: ${ipfsResult.metadataUri}`);

  // Step 2: Generate mint keypair
  logInfo("");
  logInfo("Step 2: Generating mint keypair...");
  const mintKeypair = Keypair.generate();
  logInfo(`Mint address: ${mintKeypair.publicKey.toBase58()}`);

  // Step 3: Get transaction from PumpPortal
  logInfo("");
  logInfo("Step 3: Getting transaction from PumpPortal...");

  let transactionResult;
  let usedDevbuy = devbuySol;

  try {
    transactionResult = await createTokenTransaction({
      walletKeypair,
      mintKeypair,
      metadataUri: ipfsResult.metadataUri,
      name,
      symbol,
      devbuySol,
      slippage,
      priorityFee
    });
  } catch (error) {
    // If the minimal devbuy fails, try with 0 (no devbuy)
    if (devbuySol < 0.01) {
      logWarn(`Devbuy of ${devbuySol} SOL failed, trying without devbuy...`);
      logWarn(`Error was: ${error.message}`);

      transactionResult = await createTokenTransaction({
        walletKeypair,
        mintKeypair,
        metadataUri: ipfsResult.metadataUri,
        name,
        symbol,
        devbuySol: 0,
        slippage,
        priorityFee
      });
      usedDevbuy = 0;
    } else {
      throw error;
    }
  }

  // Step 4: Sign and submit transaction
  logInfo("");
  logInfo("Step 4: Signing and submitting transaction...");

  const signature = await signAndSubmitTransaction(
    transactionResult.transactionData,
    walletKeypair,
    mintKeypair,
    connection
  );

  // Success!
  logInfo("");
  logInfo("=".repeat(60));
  logInfo("TOKEN DEPLOYED SUCCESSFULLY!");
  logInfo("=".repeat(60));
  logInfo(`Mint Address: ${mintKeypair.publicKey.toBase58()}`);
  logInfo(`DevBuy: ${usedDevbuy} SOL`);
  logInfo(`Transaction: https://solscan.io/tx/${signature}`);
  logInfo(`Pump.fun: https://pump.fun/${mintKeypair.publicKey.toBase58()}`);

  return {
    success: true,
    mintAddress: mintKeypair.publicKey.toBase58(),
    signature: signature,
    metadataUri: ipfsResult.metadataUri,
    devbuy: usedDevbuy,
    pumpFunUrl: `https://pump.fun/${mintKeypair.publicKey.toBase58()}`,
    solscanUrl: `https://solscan.io/tx/${signature}`
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const parsed = {
    options: {}
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      // Check if next arg is a value or another flag
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        parsed.options[key] = args[i + 1];
        i++;
      } else {
        // Boolean flag
        parsed.options[key] = true;
      }
    }
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
PumpPortal Token Deployment Script
===================================

Deploy tokens on Pump.fun using PumpPortal's Local Transaction API.
This is an alternative to the pumpdotfun-sdk for better compatibility.

Usage:
  node deploy_pumpportal.js [options]

Required Options:
  --name <name>           Token name
  --symbol <symbol>       Token symbol/ticker
  --description <desc>    Token description
  --image <path>          Path to image file

Optional Options:
  --devbuy <amount>       DevBuy amount in SOL (default: 0.0001)
                          Set to 0 for no initial buy
  --wallet <path>         Path to wallet JSON (default: ./trendtoken-output/wallet.json)
  --twitter <url>         Twitter URL
  --telegram <url>        Telegram URL
  --website <url>         Website URL
  --slippage <percent>    Slippage percentage (default: 10)
  --priority <sol>        Priority fee in SOL (default: 0.0005)
  --debug                 Enable debug logging

Examples:
  # Deploy with minimal devbuy
  node deploy_pumpportal.js \\
    --name "My Meme Token" \\
    --symbol "MEME" \\
    --description "The best meme token on Solana!" \\
    --image "./images/meme.png"

  # Deploy without devbuy
  node deploy_pumpportal.js \\
    --name "Test Token" \\
    --symbol "TEST" \\
    --description "A test token" \\
    --image "./test.png" \\
    --devbuy 0

  # Deploy with custom options
  node deploy_pumpportal.js \\
    --name "Doge 2.0" \\
    --symbol "DOGE2" \\
    --description "Much wow, very token" \\
    --image "./doge.png" \\
    --devbuy 0.1 \\
    --twitter "https://twitter.com/doge2" \\
    --slippage 15

Notes:
  - Minimum devbuy may vary. Script will automatically try without devbuy if minimal amount fails.
  - PumpPortal charges 0.5% fee per trade
  - Priority fee helps ensure faster transaction confirmation
  - All transactions are signed locally (keys never leave your machine)
`);
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const { options } = parseArgs(args);

  // Enable debug logging if requested
  if (options.debug) {
    setLogLevel("DEBUG");
  }

  try {
    // Validate required options
    if (!options.name) throw new Error("--name is required");
    if (!options.symbol) throw new Error("--symbol is required");
    if (!options.description) throw new Error("--description is required");
    if (!options.image) throw new Error("--image is required");

    const result = await deployToken({
      name: options.name,
      symbol: options.symbol,
      description: options.description,
      imagePath: options.image,
      devbuySol: options.devbuy !== undefined ? parseFloat(options.devbuy) : CONFIG.DEFAULT_DEVBUY_SOL,
      walletPath: options.wallet || CONFIG.DEFAULT_WALLET_PATH,
      twitter: options.twitter || "",
      telegram: options.telegram || "",
      website: options.website || "",
      slippage: options.slippage ? parseFloat(options.slippage) : CONFIG.DEFAULT_SLIPPAGE,
      priorityFee: options.priority ? parseFloat(options.priority) : CONFIG.DEFAULT_PRIORITY_FEE
    });

    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT RESULT:");
    console.log("=".repeat(60));
    console.log(JSON.stringify(result, null, 2));

    // Return the mint address for scripting
    process.exit(0);

  } catch (error) {
    logError("Deployment failed:", error.message);
    if (options.debug) {
      console.error(error);
    }
    process.exit(1);
  }
}

// ============================================================================
// Module Exports (for programmatic use)
// ============================================================================

module.exports = {
  deployToken,
  uploadToIPFS,
  createTokenTransaction,
  signAndSubmitTransaction,
  loadWallet,
  CONFIG
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch((error) => {
    logError("Fatal error:", error.message);
    process.exit(1);
  });
}
