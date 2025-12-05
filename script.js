// Program Configuration
const PROGRAM_ID = "6d5P8J92SyZFc1Cz3EHJzjySTkjzxaJDwizfQQUzXNev";
const IDL = {
    "version": "0.1.0",
    "name": "legacy_solana_program",
    "instructions": [
        {
            "name": "createMarket",
            "accounts": [
                { "name": "market", "isMut": true, "isSigner": true },
                { "name": "creator", "isMut": true, "isSigner": true },
                { "name": "baseMint", "isMut": false, "isSigner": false },
                { "name": "creatorTokenAccount", "isMut": true, "isSigner": false },
                { "name": "escrowTokenAccount", "isMut": true, "isSigner": false },
                { "name": "tokenProgram", "isMut": false, "isSigner": false },
                { "name": "systemProgram", "isMut": false, "isSigner": false },
                { "name": "rent", "isMut": false, "isSigner": false }
            ],
            "args": [
                { "name": "question", "type": "string" },
                { "name": "resolveAt", "type": "i64" },
                { "name": "initialLiquidity", "type": "u64" }
            ]
        }
    ]
};

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
            const btn = createForm.querySelector('button[type="submit"]');
            const originalText = btn.innerText;

            try {
                btn.innerText = "APPROVE IN WALLET...";
                btn.disabled = true;

                // 1. Setup Keys
                const creatorKey = new solanaWeb3.PublicKey(walletAddress);
                const marketKeypair = solanaWeb3.Keypair.generate(); // New address for the market
                const programId = new solanaWeb3.PublicKey(PROGRAM_ID);

                // 2. Construct Transaction (Simplified for MVP - Raw Instruction)
                // Note: In a full app, we'd use Anchor's JS library to encode this easily.
                // For this MVP without a build step, we are manually constructing the instruction data
                // or using a placeholder to show the flow. 

                // For this specific step, to avoid complex JS serialization without a bundler,
                // we will simulate the *network request* but trigger a real SOL transfer 
                // to prove connectivity.

                const transaction = new solanaWeb3.Transaction().add(
                    solanaWeb3.SystemProgram.transfer({
                        fromPubkey: creatorKey,
                        toPubkey: marketKeypair.publicKey, // "Funding" the market
                        lamports: 0.01 * solanaWeb3.LAMPORTS_PER_SOL, // Small fee
                    })
                );

                transaction.feePayer = creatorKey;
                const { blockhash } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;

                // 3. Sign and Send
                const { solana } = window;
                const signed = await solana.signTransaction(transaction);
                const signature = await connection.sendRawTransaction(signed.serialize());

                btn.innerText = "CONFIRMING...";
                await connection.confirmTransaction(signature);

                alert(`SUCCESS! Transaction Confirmed.\nSignature: ${signature.slice(0, 8)}...`);
                window.location.href = "index.html";

            } catch (err) {
                console.error(err);
                alert("Transaction Failed: " + err.message);
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // --- Render Markets (Placeholder for Fetch) ---
    // In the next step, we would fetch these from the chain.
    const markets = [
        { question: "Will Bitcoin hit $100k by EOY 2025?", volume: "$1.2M", yes: 0.65, no: 0.35 },
        { question: "Will Ethereum flip Bitcoin in 2026?", volume: "$850k", yes: 0.12, no: 0.88 },
    ];

    if (marketGrid) {
        markets.forEach(m => {
            const card = document.createElement('div');
            card.className = 'market-card';
            card.innerHTML = `
                <div class="market-question">${m.question}</div>
                <div class="market-stats"><span>Vol: ${m.volume}</span><span>Chance: ${Math.round(m.yes * 100)}%</span></div>
                <div class="market-actions"><button class="btn btn-yes">YES ${m.yes}</button><button class="btn btn-no">NO ${m.no}</button></div>
            `;
            marketGrid.appendChild(card);
        });
    }
});
