import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Check, X, RefreshCw, Radio } from 'lucide-react';
import azuraApi from '../../api/azuracast';
import RequestPaymentModal from './RequestPaymentModal';
import { getCredits, consumeCredit } from '../../hooks/useRequestCredits';
import { useAppKitAccount } from "@reown/appkit/react";
import { Coins, Wallet } from 'lucide-react';

function RequestCard({ song, onApprove, onDeny, loading, isDJ }) {
    return (
        <div className="flex items-center gap-4 px-4 py-3 bg-zinc-900 border border-zinc-700/50 hover:bg-zinc-700/40 rounded-lg transition-colors group">
            <div className="w-10 h-10 rounded shadow-sm bg-zinc-800 overflow-hidden shrink-0">
                {song.art && <img src={song.art} alt="" className="w-full h-full object-cover" />}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{song.title || 'Unknown'}</p>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{song.artist || 'Various'}</p>
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                <button
                    onClick={() => onApprove(song)}
                    disabled={loading}
                    className="p-2 rounded-md text-emerald-400 bg-zinc-800 hover:bg-emerald-500/20 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!isDJ ? 'Request this song (1,200 IDR)' : 'Queue this song'}
                >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
            </div>
            <div className="w-8 shrink-0 group-hover:hidden" />
        </div>
    );
}

function PendingRequestCard({ item }) {
    return (
        <div className="flex items-center gap-4 px-4 py-3 bg-fuchsia-900/10 border border-fuchsia-500/20 rounded-lg group shadow-[0_4px_12px_rgba(217,70,239,0.05)]">
            <div className="w-10 h-10 rounded shadow-sm bg-zinc-800 overflow-hidden shrink-0">
                {item.song?.art && <img src={item.song.art} alt="" className="w-full h-full object-cover" />}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{item.song?.title || 'Unknown'}</p>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{item.song?.artist || '—'}</p>
            </div>

            <span className="shrink-0 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20">
                Queued
            </span>
        </div>
    );
}

export default function RequestPanel({ stationId = '1', isDJ = false }) {
    const [requestable, setRequestable] = useState([]);
    const [pendingQueue, setPendingQueue] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState({});
    const [queued, setQueued] = useState(new Set());
    const [activeTab, setActiveTab] = useState('catalog');
    const [indieSongIds, setIndieSongIds] = useState(null); // null = loading, Set when ready

    const { address } = useAppKitAccount();
    const [credits, setCredits] = useState(0);

    useEffect(() => {
        if (address) {
            setCredits(getCredits(address));
        }
    }, [address]);

    // Payment state
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [pendingSong, setPendingSong] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [reqRes, queueRes] = await Promise.all([
                azuraApi.get(`/station/${stationId}/requests`),
                azuraApi.get(`/station/${stationId}/queue`),
            ]);
            setRequestable(Array.isArray(reqRes.data) ? reqRes.data : []);
            const queuedRequests = (Array.isArray(queueRes.data) ? queueRes.data : []).filter(i => i.is_request);
            setPendingQueue(queuedRequests);
        } catch (e) {
            console.error('Request fetch failed', e);
        } finally {
            setLoading(false);
        }
    }, [stationId]);

    // Fetch all song IDs in the indie/ folder
    useEffect(() => {
        const fetchIndieSongs = async () => {
            try {
                let allIds = new Set();
                let page = 1;
                let totalPages = 1;
                do {
                    const res = await azuraApi.get(`/station/${stationId}/files?searchPhrase=indie&rowCount=100&page=${page}`);
                    const rows = res.data?.rows ?? [];
                    rows
                        .filter(r => r.path?.startsWith('indie/'))
                        .forEach(r => { if (r.song_id) allIds.add(r.song_id); });
                    totalPages = res.data?.total_pages ?? 1;
                    page++;
                } while (page <= totalPages);
                setIndieSongIds(allIds);
            } catch (e) {
                console.error('Failed to load indie song list', e);
                setIndieSongIds(new Set()); // fallback empty
            }
        };
        fetchIndieSongs();
    }, [stationId]);

    useEffect(() => {
        fetchData();
        const id = setInterval(fetchData, 30000);
        return () => clearInterval(id);
    }, [fetchData]);

    const handleApprove = async (song) => {
        if (!isDJ) {
            const userCredits = getCredits(address);
            if (userCredits > 0) {
                // User has credits, proceed directly to request
                handleRequestInternal(song);
            } else {
                // No credits, open payment modal
                setPendingSong(song);
                setIsPaymentModalOpen(true);
            }
            return;
        }

        setSending(s => ({ ...s, [song.id]: true }));
        try {
            await azuraApi.post(`/station/${stationId}/request/${song.request_id || song.id}`);
            setQueued(s => new Set([...s, song.id]));
        } catch (e) {
            setQueued(s => new Set([...s, song.id]));
        } finally {
            setSending(s => ({ ...s, [song.id]: false }));
        }
    };

    const handlePaymentSuccess = () => {
        if (pendingSong) {
            handleRequestInternal(pendingSong);
        }
    };

    const handleRequestInternal = async (song) => {
        setSending(s => ({ ...s, [song.id || song.song_id]: true }));
        try {
            // Consume 1 credit for viewers
            if (!isDJ) {
                const success = consumeCredit(address);
                if (!success) {
                    alert('Insufficient credits. Please top up.');
                    setPendingSong(song);
                    setIsPaymentModalOpen(true);
                    return;
                }
                setCredits(getCredits(address));
            }

            await azuraApi.post(`/station/${stationId}/request/${song.request_id || song.id}`);
            setQueued(s => new Set([...s, song.id]));
            alert(`Success! ${song.title} has been requested.`);
        } catch (e) {
            setQueued(s => new Set([...s, song.id]));
        } finally {
            setSending(s => ({ ...s, [song.id || song.song_id]: false }));
            setPendingSong(null);
        }
    };

    // Only show songs from the indie folder (cross-referenced by song_id)
    const indieOnly = indieSongIds
        ? requestable.filter(r => indieSongIds.has(r.song?.id))
        : [];

    const filtered = indieOnly.filter(r => {
        const q = search.toLowerCase();
        // Hide if already in pending queue to avoid double requests
        const isAlreadyQueued = pendingQueue.some(pq => pq.song.id === r.song.id);
        if (isAlreadyQueued) return false;

        return !q || r.song?.title?.toLowerCase().includes(q) || r.song?.artist?.toLowerCase().includes(q);
    });

    return (
        <div className="bg-zinc-800 rounded-xl flex flex-col overflow-hidden h-full min-h-[500px]">
            {/* Header */}
            <div className="p-6 border-b border-zinc-700/50 flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-fuchsia-500" /> Listener Requests
                </h3>
                <div className="flex items-center gap-3">
                    {!isDJ && address && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-lg shadow-emerald-900/10">
                            <Coins className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-xs font-black text-emerald-400 tracking-wider">{credits} CREDITS</span>
                        </div>
                    )}
                    {pendingQueue.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20">
                            <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
                            <span className="text-xs font-semibold text-fuchsia-400">{pendingQueue.length} pending</span>
                        </div>
                    )}
                    <button onClick={fetchData} className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-700/50 bg-zinc-900/30">
                <button
                    onClick={() => setActiveTab('catalog')}
                    className={`flex-1 py-4 text-xs font-bold uppercase transition-all ${activeTab === 'catalog' ? 'text-fuchsia-400 bg-zinc-800 border-b-2 border-fuchsia-500' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                >
                    🎵 Indie Catalog <span className="text-zinc-600 font-mono ml-1">({indieOnly.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`flex-1 py-4 text-xs font-bold uppercase transition-all ${activeTab === 'pending' ? 'text-rose-400 bg-zinc-800 border-b-2 border-rose-500' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                >
                    📥 Queued <span className="text-zinc-600 font-mono ml-1">({pendingQueue.length})</span>
                </button>
            </div>

            {/* Catalog tab: search + list */}
            {activeTab === 'catalog' && (
                <>
                    <div className="p-4 bg-zinc-800">
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search indie songs..."
                            className="w-full bg-zinc-900 border border-zinc-700/50 hover:border-zinc-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2">
                        {loading ? (
                            <div className="py-20 flex items-center justify-center">
                                <RefreshCw className="w-6 h-6 text-zinc-600 animate-spin" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="py-20 text-center text-zinc-400 text-sm font-semibold bg-zinc-900/50 rounded-xl border border-zinc-700/50">
                                {indieOnly.length === 0 ? 'No indie songs are currently requestable' : 'No indie songs match your search'}
                            </div>
                        ) : (
                            filtered.map(r => (
                                <RequestCard
                                    key={r.request_id}
                                    song={{ ...r.song, request_id: r.request_id }}
                                    onApprove={handleApprove}
                                    onDeny={() => { }}
                                    loading={sending[r.song?.id]}
                                    isDJ={isDJ}
                                />
                            ))
                        )}
                    </div>
                </>
            )}

            {/* Pending Tab: queued requests */}
            {activeTab === 'pending' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {pendingQueue.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center bg-zinc-900/50 rounded-xl border border-zinc-700/50">
                            <MessageSquare className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                            <p className="text-zinc-300 text-sm font-semibold">No requests in queue</p>
                            <p className="text-zinc-500 text-xs mt-1">Incoming listener requests appear here</p>
                        </div>
                    ) : (
                        pendingQueue.map((item, i) => (
                            <PendingRequestCard key={i} item={item} />
                        ))
                    )}
                </div>
            )}

            <div className="p-4 border-t border-zinc-700/50 text-center text-xs text-zinc-500 font-medium bg-zinc-900/30">
                Auto-refreshes every 30s · Requests go to AutoDJ queue
            </div>

            <RequestPaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                onPaymentSuccess={handlePaymentSuccess}
                songTitle={pendingSong?.title || ''}
            />
        </div>
    );
}
