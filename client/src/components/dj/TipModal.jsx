import React, { useState, useEffect } from 'react';
import { X, Wallet, Heart, Loader2, CheckCircle2, AlertCircle, Coins, Ticket, Info, RefreshCw, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppKit, useAppKitProvider, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import { BrowserProvider, parseEther, Contract, parseUnits } from 'ethers';

const SOLANA_RECEIVER = '9xhz4Cb4C2Z4z9xdD2geCafovNYVngC4E4XpWtQmeEuv';
const EVM_RECEIVER = '0x242dfb7849544ee242b2265ca7e585bdec60456b';

// Initial fallback prices per 1 IDR (1 / TokenPriceInIDR)
const DEFAULT_PRICES = {
    ETH: 1 / 38000000,
    BNB: 1 / 10500000,
    POL: 1 / 6000,
    AVAX: 1 / 155000,
    SOL: 1 / 1400000,
    USDC: 1 / 15500,
    USDT: 1 / 15500,
};

const CHAIN_NATIVE_MAP = {
    1: 'ETH',      // Ethereum
    10: 'ETH',     // Optimism
    56: 'BNB',     // BSC
    137: 'POL',    // Polygon
    42161: 'ETH',  // Arbitrum
    324: 'ETH',    // zkSync
    8453: 'ETH',   // Base
    43114: 'AVAX', // Avalanche
};

const STABLECOINS = {
    solana: {
        USDC: { symbol: 'USDC', decimals: 6, address: '4zMMC9srtvS2neS6WdG3QhKAn9P6D9zXPy6XpWyvYU6' },
        USDT: { symbol: 'USDT', decimals: 6, address: 'EJwZgeZveJvxic7gWDe9Sckat8S8wX9uxyR3Sqi7pAnN' },
    },
    evm: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
        USDT: { symbol: 'USDT', decimals: 6, address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0' },
    }
};

const PRESETS = [
    { label: '1,200', value: 1200 },
    { label: '5,000', value: 5000 },
    { label: '10,000', value: 10000 },
    { label: '20,000', value: 20000 },
];

const ERC20_ABI = ["function transfer(address to, uint256 amount) public returns (bool)"];

export default function TipModal({ isOpen, onClose }) {
    const { open } = useAppKit();
    const { address, isConnected, chainId: accountChainId } = useAppKitAccount();
    const { caipNetwork } = useAppKitNetwork();
    const chainId = caipNetwork?.id || accountChainId;

    const [nativePrices, setNativePrices] = useState(DEFAULT_PRICES);

    useEffect(() => {
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,polygon-ecosystem-token,avalanche-2,solana,usd-coin,tether&vs_currencies=idr')
            .then(res => res.json())
            .then(data => {
                setNativePrices({
                    ETH: 1 / (data.ethereum?.idr || 38000000),
                    BNB: 1 / (data.binancecoin?.idr || 10500000),
                    POL: 1 / (data['polygon-ecosystem-token']?.idr || 6000),
                    AVAX: 1 / (data['avalanche-2']?.idr || 155000),
                    SOL: 1 / (data.solana?.idr || 1400000),
                    USDC: 1 / (data['usd-coin']?.idr || 15500),
                    USDT: 1 / (data.tether?.idr || 15500),
                });
            }).catch(e => console.log('Rates fetch error:', e));
    }, []);

    const [selectedNetwork, setSelectedNetwork] = useState('solana');
    const [selectedCurrency, setSelectedCurrency] = useState('NATIVE');
    const { walletProvider } = useAppKitProvider(selectedNetwork === 'solana' ? 'solana' : 'eip155');

    const [amountIdr, setAmountIdr] = useState(5000);
    const [customAmount, setCustomAmount] = useState('');
    const [isCustom, setIsCustom] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('fiat'); // 'fiat' or 'crypto'

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, processing, success, error
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isConnected && address) {
            const detected = address?.toString().startsWith('0x') ? 'evm' : 'solana';
            setSelectedNetwork(detected);
            setSelectedCurrency('NATIVE');
        }
    }, [isConnected, address]);

    const isSolana = chainId?.toString().toLowerCase().includes('solana') || (address && !address?.toString().startsWith('0x'));
    const isEVM = chainId?.toString().toLowerCase().includes('eip155') || (address && address?.toString().startsWith('0x'));

    // Resolve current native token for EVM
    const numericChainId = isEVM ? (chainId?.toString().startsWith('eip155:') ? parseInt(chainId.toString().split(':')[1]) : parseInt(chainId)) : null;
    const currentNativeSymbol = isSolana ? 'SOL' : (CHAIN_NATIVE_MAP[numericChainId] || 'ETH');

    const isCorrectNetwork = (selectedNetwork === 'solana' && isSolana) ||
        (selectedNetwork === 'evm' && isEVM);

    const currentAmount = isCustom ? (parseFloat(customAmount) || 0) : amountIdr;
    const tickets = Math.floor(currentAmount / 5000);

    // Dynamic token info selection
    let tokenInfo;
    if (selectedCurrency === 'NATIVE') {
        tokenInfo = {
            symbol: currentNativeSymbol,
            decimals: isSolana ? 9 : 18,
            price: nativePrices[currentNativeSymbol]
        };
    } else {
        tokenInfo = {
            ...STABLECOINS[selectedNetwork][selectedCurrency],
            price: nativePrices[selectedCurrency]
        };
    }
    const cryptoAmount = currentAmount * (tokenInfo?.price || 0);

    const handleTip = async () => {
        if (!isConnected) {
            open({ view: 'Connect' });
            return;
        }

        if (!isCorrectNetwork) {
            open({ view: 'Networks' });
            return;
        }

        if (currentAmount <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        if (!walletProvider) {
            setError('Wallet provider not found. Please try reconnecting.');
            setStatus('error');
            return;
        }

        setLoading(true);
        setStatus('processing');
        setError(null);

        try {
            if (selectedNetwork === 'solana') {
                const chainIdStr = chainId?.toString() || '';
                const isDevnet = chainIdStr.toLowerCase().includes('devnet') ||
                    chainIdStr.includes('EtWTR') ||
                    selectedNetwork === 'solana';

                const rpcUrl = isDevnet ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";
                const connection = new Connection(rpcUrl, "confirmed");

                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                const transaction = new Transaction();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = new PublicKey(address);

                const amountRaw = Math.floor(cryptoAmount * Math.pow(10, tokenInfo.decimals));

                if (selectedCurrency === 'NATIVE') {
                    transaction.add(
                        SystemProgram.transfer({
                            fromPubkey: new PublicKey(address),
                            toPubkey: new PublicKey(SOLANA_RECEIVER),
                            lamports: amountRaw,
                        })
                    );
                } else {
                    // SLP Token Transfer
                    const mint = new PublicKey(tokenInfo.address);
                    const fromPubkey = new PublicKey(address);
                    const toPubkey = new PublicKey(SOLANA_RECEIVER);

                    const fromAta = await getAssociatedTokenAddress(mint, fromPubkey);
                    const toAta = await getAssociatedTokenAddress(mint, toPubkey);

                    // Check if receiver ATA exists, if not create it (optional for tip but safer)
                    try {
                        await getAccount(connection, toAta);
                    } catch (e) {
                        transaction.add(
                            createAssociatedTokenAccountInstruction(
                                fromPubkey,
                                toAta,
                                toPubkey,
                                mint
                            )
                        );
                    }

                    transaction.add(
                        createTransferCheckedInstruction(
                            fromAta,
                            mint,
                            toAta,
                            fromPubkey,
                            amountRaw,
                            tokenInfo.decimals
                        )
                    );
                }

                const result = await walletProvider.signAndSendTransaction(transaction);
                const signature = typeof result === 'string' ? result : result?.signature;

                if (!signature) throw new Error('Failed to obtain transaction signature');

                const confirmation = await connection.confirmTransaction({
                    signature,
                    blockhash,
                    lastValidBlockHeight
                }, 'confirmed');

                if (confirmation.value.err) throw new Error('Transaction failed to confirm');
            } else {
                const provider = new BrowserProvider(walletProvider);
                const signer = await provider.getSigner();

                if (selectedCurrency === 'NATIVE') {
                    const tx = await signer.sendTransaction({
                        to: EVM_RECEIVER,
                        value: parseEther(cryptoAmount.toFixed(18))
                    });
                    await tx.wait();
                } else {
                    // ERC20 Transfer
                    const tokenContract = new Contract(tokenInfo.address, ERC20_ABI, signer);
                    const amountRaw = parseUnits(cryptoAmount.toFixed(tokenInfo.decimals), tokenInfo.decimals);
                    const tx = await tokenContract.transfer(EVM_RECEIVER, amountRaw);
                    await tx.wait();
                }
            }

            setStatus('success');
            setTimeout(() => {
                onClose();
                setStatus('idle');
            }, 3000);
        } catch (err) {
            console.error('Tip failed', err);
            let msg = err.message || 'Transaction failed';
            if (msg.includes('user rejected')) msg = 'Transaction rejected by user';
            setError(msg);
            setStatus('error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
                    >
                        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-rose-500/20 rounded-lg">
                                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-white">Support Creator</h3>
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Web3Radio Tip Mechanism</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            {status === 'success' ? (
                                <div className="space-y-4 py-8 text-center">
                                    <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                                        <CheckCircle2 className="w-10 h-10" />
                                    </div>
                                    <h4 className="text-2xl font-bold text-white">Thank You!</h4>
                                    <p className="text-zinc-400 text-sm max-w-xs mx-auto">
                                        Your tip of <strong>{currentAmount.toLocaleString()} IDR</strong> has been received.
                                        {tickets > 0 && <span> You've earned <strong>{tickets} PLY Tickets</strong> for the next draw!</span>}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* PLY Info Box */}
                                    <div className="bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl p-4 flex gap-4">
                                        <div className="p-2 bg-fuchsia-500/20 rounded-full h-fit">
                                            <Ticket className="w-5 h-5 text-fuchsia-400" />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-bold text-fuchsia-300">PLY Program (Prize Linked Yield)</h4>
                                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                                                Every tip of 5,000 IDR earns you 1 ticket. Not only supporting creators and the ecosystem, but you also qualify for the prize pool draw every 15 days (1 epoch).
                                            </p>
                                        </div>
                                    </div>

                                    {/* Payment Method Toggle */}
                                    <div className="flex p-1 bg-zinc-950 rounded-xl border border-zinc-800">
                                        <button
                                            onClick={() => setPaymentMethod('fiat')}
                                            className={`flex-1 py-3 px-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all text-center ${paymentMethod === 'fiat' ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            Top Up / Swap
                                        </button>
                                        <button
                                            onClick={() => setPaymentMethod('crypto')}
                                            className={`flex-1 py-3 px-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all text-center ${paymentMethod === 'crypto' ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            Web3 Wallet
                                        </button>
                                    </div>

                                    {paymentMethod === 'fiat' ? (
                                        <div className="flex flex-col items-center justify-center bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                                            <div className="w-16 h-16 bg-fuchsia-600/20 rounded-full flex items-center justify-center border border-fuchsia-500/30">
                                                <Wallet className="w-8 h-8 text-fuchsia-400" />
                                            </div>
                                            <div className="text-center space-y-2">
                                                <h4 className="text-lg font-bold text-white">Buy & Swap Crypto</h4>
                                                <p className="text-xs text-zinc-400 max-w-sm">
                                                    Use Reown's built-in tools to top up your wallet directly using Fiat (Card/Bank) or Swap between different tokens. After you have the desired crypto, switch to the <strong>Web3 Wallet</strong> tab to send the tip.
                                                </p>
                                            </div>
                                            <div className="flex gap-3 w-full mt-2">
                                                <button 
                                                    onClick={() => open({ view: 'OnRampProviders' })}
                                                    className="flex-1 py-3 rounded-xl bg-white text-black font-black hover:bg-zinc-200 active:scale-[0.98] transition-all flex items-center justify-center shadow-xl"
                                                >
                                                    Buy Crypto
                                                </button>
                                                <button 
                                                    onClick={() => open({ view: 'Swap' })}
                                                    className="flex-1 py-3 rounded-xl bg-zinc-800 text-white font-black border border-zinc-700 hover:bg-zinc-700 active:scale-[0.98] transition-all flex items-center justify-center shadow-xl"
                                                >
                                                    Swap Tokens
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Network & Currency Selection */}
                                            <div className="space-y-3">
                                        <div className="flex p-1 bg-zinc-950 rounded-lg border border-zinc-800">
                                            <button
                                                onClick={() => { setSelectedNetwork('solana'); setSelectedCurrency('SOL'); }}
                                                className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${selectedNetwork === 'solana' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-600 hover:text-zinc-400'}`}
                                            >
                                                Solana
                                            </button>
                                            <button
                                                onClick={() => { setSelectedNetwork('evm'); setSelectedCurrency('ETH'); }}
                                                className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${selectedNetwork === 'evm' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-600 hover:text-zinc-400'}`}
                                            >
                                                EVM (ETH, Base, BSC...)
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                key="NATIVE"
                                                onClick={() => setSelectedCurrency('NATIVE')}
                                                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${selectedCurrency === 'NATIVE' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                                            >
                                                {currentNativeSymbol}
                                            </button>
                                            {Object.keys(STABLECOINS[selectedNetwork]).map(curr => (
                                                <button
                                                    key={curr}
                                                    onClick={() => setSelectedCurrency(curr)}
                                                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${selectedCurrency === curr ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                                                >
                                                    {curr}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Presets */}
                                    <div className="space-y-3">
                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Select Amount (IDR)</span>
                                        <div className="grid grid-cols-2 gap-3">
                                            {PRESETS.map((preset) => (
                                                <button
                                                    key={preset.value}
                                                    onClick={() => {
                                                        setAmountIdr(preset.value);
                                                        setIsCustom(false);
                                                    }}
                                                    className={`py-3 px-4 rounded-xl border font-bold text-sm transition-all ${!isCustom && amountIdr === preset.value ? 'bg-zinc-100 text-zinc-900 border-white' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'}`}
                                                >
                                                    Rp {preset.label}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => setIsCustom(true)}
                                                className={`py-3 px-4 rounded-xl border font-bold text-sm transition-all ${isCustom ? 'bg-zinc-100 text-zinc-900 border-white' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'}`}
                                            >
                                                Custom Amount
                                            </button>
                                        </div>
                                    </div>

                                    {isCustom && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="space-y-2"
                                        >
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                                                <input
                                                    type="number"
                                                    value={customAmount}
                                                    onChange={(e) => setCustomAmount(e.target.value)}
                                                    placeholder="Enter custom amount..."
                                                    className="w-full pl-12 pr-4 py-4 bg-zinc-950 border border-zinc-800 rounded-xl text-white font-bold focus:outline-none focus:border-fuchsia-500 transition-colors"
                                                />
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Summary Card */}
                                    <div className="bg-zinc-950 rounded-2xl p-5 border border-zinc-800 space-y-4">
                                        <div className="flex justify-between items-end">
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Approx. Crypto</p>
                                                <p className="text-xl font-mono font-black text-white">
                                                    {cryptoAmount.toFixed(tokenInfo.decimals > 8 ? 8 : tokenInfo.decimals)} {selectedCurrency}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">PLY Reward</p>
                                                <p className={`text-sm font-black ${tickets > 0 ? 'text-fuchsia-400' : 'text-zinc-600'}`}>
                                                    {tickets} Ticket{tickets !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-zinc-800/50 flex flex-col gap-2">
                                            <div className="flex items-center gap-3">
                                                <Info className="w-4 h-4 text-zinc-600" />
                                                <p className="text-[10px] text-zinc-500 italics leading-relaxed">
                                                    1 ticket per 5,000 IDR tipped. Supports ecosystem + eligibility for prize pool draws every 15 days (1 epoch).
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {status === 'error' && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500 text-xs font-bold leading-tight">
                                            <AlertCircle className="w-5 h-5 shrink-0" />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleTip}
                                        disabled={loading}
                                        className="w-full py-4 rounded-xl bg-white text-black font-black hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3 shadow-xl"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                <span>Confirming...</span>
                                            </>
                                        ) : !isConnected ? (
                                            <>
                                                <Wallet className="w-5 h-5" />
                                                <span>Connect Wallet</span>
                                            </>
                                        ) : !isCorrectNetwork ? (
                                            <>
                                                <RefreshCw className="w-5 h-5" />
                                                <span>Switch to {selectedNetwork.toUpperCase()}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Heart className="w-5 h-5 fill-black" />
                                                <span>Send Tip & Get Tickets</span>
                                            </>
                                        )}
                                    </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-zinc-950/50 text-center border-t border-zinc-800">
                            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-black flex items-center justify-center gap-2">
                                <Ticket className="w-3 h-3" /> Prize pool drawn every 1 epoch (15 days)
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
