// Program Configuration
const PROGRAM_ID = "6d5P8J92SyZFc1Cz3EHJzjySTkjzxaJDwizfQQUzXNev";

// State
let walletAddress = null;
let connection = null;

document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connect-wallet');
    const marketGrid = document.getElementById('market-grid');

    // Initialize Solana Connection
    if (window.solanaWeb3) {
        connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
    }

    // --- Wallet Logic ---
    const connectWallet = async () => {
        try {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                const response = await solana.connect();
                walletAddress = response.publicKey.toString();
                updateWalletUI(walletAddress);
                sessionStorage.setItem('walletAddress', walletAddress);
            } else {
                alert("Phantom wallet not found! Please install it.");
                window.open("https://phantom.app/", "_blank");
            }
        } catch (err) {
            console.error(err);
        }
    };

    const updateWalletUI = (pubKey) => {
        if (connectBtn) {
            connectBtn.innerText = pubKey.slice(0, 4) + '...' + pubKey.slice(-4);
            connectBtn.style.borderColor = "var(--color-primary)";
            connectBtn.style.boxShadow = "0 0 15px rgba(0, 255, 65, 0.3)";
        }
    };

    const checkConnection = async () => {
        if (sessionStorage.getItem('walletAddress')) {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                try {
                    const response = await solana.connect({ onlyIfTrusted: true });
                    walletAddress = response.publicKey.toString();
                    updateWalletUI(walletAddress);
                } catch (err) {
                    sessionStorage.removeItem('walletAddress');
                }
            }
        }
    };

    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
        window.addEventListener('load', checkConnection);
    }

    // --- Market Creation Logic (Real) ---
    const createForm = document.getElementById('create-market-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!walletAddress) {
                alert("Please connect your wallet first!");
                return;
            }

            const question = document.getElementById('question').value;
            const liquidityInput = document.getElementById('liquidity').value;
            const btn = createForm.querySelector('button[type="submit"]');
            const originalText = btn.innerText;

            try {
                btn.innerText = "BUILDING TX...";
                btn.disabled = true;

                // --- Constants ---
                const BASE_MINT = new solanaWeb3.PublicKey("CSXXfV4qSUJRCbYnk21Wm6mPDZUvYN2aWUjAaxoeViTS");
                const TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
                const ASSOCIATED_TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
                const SYSVAR_RENT_PUBKEY = new solanaWeb3.PublicKey("SysvarRent111111111111111111111111111111111");

                // --- 1. Setup Keys ---
                const creatorKey = new solanaWeb3.PublicKey(walletAddress);
                const marketKeypair = solanaWeb3.Keypair.generate();
                const programId = new solanaWeb3.PublicKey(PROGRAM_ID);

                // Derive Escrow PDA
                const [escrowTokenAccount] = await solanaWeb3.PublicKey.findProgramAddress(
                    [new TextEncoder().encode("escrow"), marketKeypair.publicKey.toBuffer()],
                    programId
                );

                // Derive Creator's ATA
                const [creatorTokenAccount] = await solanaWeb3.PublicKey.findProgramAddress(
                    [creatorKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), BASE_MINT.toBuffer()],
                    ASSOCIATED_TOKEN_PROGRAM_ID
                );

                // --- 2. Serialize Instruction Data ---
                const discriminatorHex = "67e261ebc8bcfbfe";
                const discriminator = new Uint8Array(discriminatorHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

                const questionBytes = new TextEncoder().encode(question);
                const resolveAt = Math.floor(Date.now() / 1000) + 604800; // 7 days
                const liquidity = new BN(liquidityInput).mul(new BN(1000000000)); // 9 decimals

                const bufferSize = 8 + 4 + questionBytes.length + 8 + 8;
                const data = new Uint8Array(bufferSize);
                let offset = 0;

                // Discriminator
                data.set(discriminator, offset);
                offset += 8;

                // Question String (u32 len + bytes)
                new DataView(data.buffer).setUint32(offset, questionBytes.length, true);
                offset += 4;
                data.set(questionBytes, offset);
                offset += questionBytes.length;

                // ResolveAt (i64 LE)
                const resolveAtBN = new BN(resolveAt);
                const resolveAtBuffer = new Uint8Array(resolveAtBN.toArray('le', 8));
                data.set(resolveAtBuffer, offset);
                offset += 8;

                // Initial Liquidity (u64 LE)
                const liquidityBuffer = new Uint8Array(liquidity.toArray('le', 8));
                data.set(liquidityBuffer, offset);

                // --- 3. Build Instruction ---
                const instruction = new solanaWeb3.TransactionInstruction({
                    keys: [
                        { pubkey: marketKeypair.publicKey, isSigner: true, isWritable: true },
                        { pubkey: creatorKey, isSigner: true, isWritable: true },
                        { pubkey: BASE_MINT, isSigner: false, isWritable: false },
                        { pubkey: creatorTokenAccount, isSigner: false, isWritable: true },
                        { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
                        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
                        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
                    ],
                    programId: programId,
                    data: data
                });

                // --- 4. Send Transaction ---
                const transaction = new solanaWeb3.Transaction().add(instruction);
                transaction.feePayer = creatorKey;

                const { blockhash } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;

                transaction.partialSign(marketKeypair);

                const { solana } = window;
                const signed = await solana.signTransaction(transaction);

                btn.innerText = "SENDING...";
                const signature = await connection.sendRawTransaction(signed.serialize());

                btn.innerText = "CONFIRMING...";
                await connection.confirmTransaction(signature);

                alert(`MARKET CREATED! \nSignature: ${signature.slice(0, 8)}...`);
                window.location.href = "index.html";

            } catch (err) {
                console.error(err);
                alert("Transaction Failed: " + err.message);
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // --- FIXED: Manual Market Decoding ---
    const decodeMarket = (data) => {
        try {
            // Skip 8-byte discriminator
            let offset = 8;

            // Read creator (32 bytes)
            const creator = new solanaWeb3.PublicKey(data.slice(offset, offset + 32));
            offset += 32;

            // Read question (String = u32 length + bytes)
            const questionLen = new DataView(data.buffer, data.byteOffset + offset).getUint32(0, true);
            offset += 4;
            const questionBytes = data.slice(offset, offset + questionLen);
            const question = new TextDecoder().decode(questionBytes);
            offset += questionLen;

            // Read base_mint (32 bytes)
            const baseMint = new solanaWeb3.PublicKey(data.slice(offset, offset + 32));
            offset += 32;

            // Read yes_pool_amount (u64, 8 bytes)
            const yesPoolAmount = new BN(data.slice(offset, offset + 8), 'le');
            offset += 8;

            // Read no_pool_amount (u64, 8 bytes)
            const noPoolAmount = new BN(data.slice(offset, offset + 8), 'le');
            offset += 8;

            // Read total_yes_shares (u64, 8 bytes)
            const totalYesShares = new BN(data.slice(offset, offset + 8), 'le');
            offset += 8;

            // Read total_no_shares (u64, 8 bytes)
            const totalNoShares = new BN(data.slice(offset, offset + 8), 'le');
            offset += 8;

            // Read status (u8, 1 byte) - enum discriminant
            const status = data[offset];
            offset += 1;

            // Read created_at (i64, 8 bytes)
            const createdAt = new BN(data.slice(offset, offset + 8), 'le');
            offset += 8;

            // Read resolve_at (i64, 8 bytes)
            const resolveAt = new BN(data.slice(offset, offset + 8), 'le');
            offset += 8;

            // Read resolver (32 bytes)
            const resolver = new solanaWeb3.PublicKey(data.slice(offset, offset + 32));
            offset += 32;

            // Read fee_paid (bool = u8, 1 byte)
            const feePaid = data[offset] === 1;

            return {
                creator: creator.toString(),
                question,
                baseMint: baseMint.toString(),
                yesPoolAmount,
                noPoolAmount,
                totalYesShares,
                totalNoShares,
                status,
                createdAt,
                resolveAt,
                resolver: resolver.toString(),
                feePaid
            };
        } catch (e) {
            console.error("Failed to decode market:", e);
            return null;
        }
    };

    // --- Fetch and Render Markets ---
    const fetchMarkets = async () => {
        if (!connection || !marketGrid) return;

        try {
            marketGrid.innerHTML = '<div class="loading-spinner">Loading Markets from Solana...</div>';

            console.log("Fetching accounts for program:", PROGRAM_ID);
            const accounts = await connection.getProgramAccounts(new solanaWeb3.PublicKey(PROGRAM_ID));
            console.log("Found accounts:", accounts.length);

            const decodedMarkets = [];

            for (const { pubkey, account } of accounts) {
                const market = decodeMarket(account.data);
                
                if (market && market.question) {
                    // Calculate prices
                    const yesPool = market.yesPoolAmount.toNumber();
                    const noPool = market.noPoolAmount.toNumber();
                    const total = yesPool + noPool;

                    let yesPrice = 0.5;
                    if (total > 0) {
                        yesPrice = yesPool / total;
                    }

                    // Convert lamports to tokens (assuming 9 decimals)
                    const volumeInTokens = (total / 1e9).toFixed(2);

                    decodedMarkets.push({
                        id: pubkey.toString(),
                        question: market.question,
                        volume: `${volumeInTokens} USDC`,
                        yesPrice: yesPrice.toFixed(2),
                        noPrice: (1 - yesPrice).toFixed(2),
                        status: market.status
                    });

                    console.log("Decoded market:", market.question, "Yes:", yesPrice);
                }
            }

            console.log("Total decoded markets:", decodedMarkets.length);
            renderMarkets(decodedMarkets);

        } catch (err) {
            console.error("Error fetching markets:", err);
            marketGrid.innerHTML = `<div class="error">Failed to load markets: ${err.message}</div>`;
        }
    };

    const renderMarkets = (data) => {
        marketGrid.innerHTML = '';

        if (data.length === 0) {
            marketGrid.innerHTML = '<div class="no-markets" style="text-align: center; padding: 2rem; color: #888;">No markets found. <a href="create-prediction.html" style="color: var(--color-primary);">Create one!</a></div>';
            return;
        }

        data.forEach(m => {
            const card = document.createElement('div');
            card.className = 'market-card';
            
            // Add status badge if resolved
            let statusBadge = '';
            if (m.status === 1) statusBadge = '<span style="color: var(--color-primary); font-size: 0.8rem;">[RESOLVED: YES]</span>';
            if (m.status === 2) statusBadge = '<span style="color: var(--color-accent); font-size: 0.8rem;">[RESOLVED: NO]</span>';
            
            card.innerHTML = `
                <div class="market-question">${m.question} ${statusBadge}</div>
                <div class="market-stats">
                    <span>Vol: ${m.volume}</span>
                    <span>Chance: ${Math.round(m.yesPrice * 100)}%</span>
                </div>
                <div class="market-actions">
                    <button class="btn btn-yes">YES ${m.yesPrice}</button>
                    <button class="btn btn-no">NO ${m.noPrice}</button>
                </div>
            `;
            marketGrid.appendChild(card);
        });
    };

    // Initial Load
    if (marketGrid) {
        fetchMarkets();
    }
});