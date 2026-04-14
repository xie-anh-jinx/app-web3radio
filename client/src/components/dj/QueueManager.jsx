import React, { useState, useEffect, useCallback } from 'react';
import { ListMusic, Trash2, RefreshCw, Zap } from 'lucide-react';
import { getQueue, deleteQueueItem, skipTrack } from '../../api/azuracast';

function formatTime(epoch) {
    if (!epoch) return '—';
    return new Date(epoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(secs) {
    if (!secs) return '—';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export default function QueueManager({ stationId = '1', isDJ = false }) {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(false);
    const [removing, setRemoving] = useState({});

    const fetchQueue = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getQueue(stationId);
            setQueue(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Queue fetch failed', e);
        } finally {
            setLoading(false);
        }
    }, [stationId]);

    useEffect(() => {
        fetchQueue();
        const id = setInterval(fetchQueue, 20000);
        return () => clearInterval(id);
    }, [fetchQueue]);

    const handleRemove = async (queueId) => {
        setRemoving(r => ({ ...r, [queueId]: true }));
        try {
            const idNum = typeof queueId === 'string'
                ? queueId.split('/').pop()
                : queueId;
            await deleteQueueItem(stationId, idNum);
            setQueue(q => q.filter(item => item.links?.self !== queueId && item.links?.self?.split('/').pop() !== String(idNum)));
        } catch (e) {
            console.error('Remove queue item failed', e);
        } finally {
            setRemoving(r => ({ ...r, [queueId]: false }));
        }
    };

    const handleSkipToNext = async () => {
        await skipTrack(stationId);
        setTimeout(fetchQueue, 2000);
    };

    return (
        <div className="bg-zinc-800 rounded-xl flex flex-col overflow-hidden h-full min-h-[400px]">
            {/* Header */}
            <div className="p-6 border-b border-zinc-700/50 flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <ListMusic className="w-5 h-5 text-fuchsia-500" /> Upcoming Queue
                    <span className="text-zinc-500 text-sm font-normal">({queue.length})</span>
                </h3>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSkipToNext}
                        disabled={!isDJ}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!isDJ ? 'DJ permission required' : 'Play immediately'}
                    >
                        <Zap className="w-3.5 h-3.5" /> Skip Now
                    </button>
                    <button
                        onClick={fetchQueue}
                        className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Queue items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loading && queue.length === 0 ? (
                    <div className="py-20 flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 text-zinc-600 animate-spin" />
                    </div>
                ) : queue.length === 0 ? (
                    <div className="py-20 text-center bg-zinc-900/50 rounded-xl border border-zinc-700/50">
                        <ListMusic className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-300 font-semibold text-sm">Queue is empty</p>
                        <p className="text-zinc-500 text-xs mt-1">AutoDJ will randomly select the next track</p>
                    </div>
                ) : (
                    queue.map((item, idx) => {
                        const itemId = item.links?.self;
                        const isRemoving = removing[itemId];
                        const isNext = idx === 0;
                        return (
                            <div
                                key={itemId ?? idx}
                                className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-all group ${isNext
                                    ? 'bg-fuchsia-900/10 border-fuchsia-500/30 shadow-[0_4px_12px_rgba(217,70,239,0.05)]'
                                    : 'bg-zinc-900 border-zinc-700/50 hover:bg-zinc-700/40'
                                    }`}
                            >
                                {/* Position indicator */}
                                <div className={`text-sm font-mono font-bold w-6 text-center shrink-0 ${isNext ? 'text-fuchsia-500' : 'text-zinc-500'}`}>
                                    {isNext ? '▶' : idx + 1}
                                </div>

                                {/* Art */}
                                <div className="w-10 h-10 rounded shadow-sm bg-zinc-800 overflow-hidden shrink-0">
                                    {item.song?.art && <img src={item.song.art} alt="" className="w-full h-full object-cover" />}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{item.song?.title ?? 'Unknown'}</p>
                                    <p className="text-xs text-zinc-400 truncate mt-0.5">{item.song?.artist ?? '—'}</p>
                                </div>

                                {/* Scheduled time */}
                                <div className="text-right shrink-0 hidden sm:block">
                                    <p className="text-xs text-zinc-400 font-mono font-medium">{formatTime(item.played_at)}</p>
                                    <p className="text-[10px] text-zinc-500">{formatDuration(item.duration)}</p>
                                </div>

                                {/* Request badge */}
                                {item.is_request && (
                                    <span className="px-2 py-1 rounded text-[10px] font-bold uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 shrink-0">
                                        Req
                                    </span>
                                )}

                                {/* Remove button */}
                                {idx > 0 && isDJ && (
                                    <button
                                        onClick={() => handleRemove(itemId)}
                                        disabled={isRemoving}
                                        className="ml-2 p-2 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="Remove from queue"
                                    >
                                        {isRemoving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    </button>
                                )}
                                {idx === 0 && <div className="w-8 ml-2 shrink-0" />}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer hint */}
            <div className="p-4 border-t border-zinc-700/50 text-center text-xs text-zinc-500 font-medium bg-zinc-900/30">
                Queue auto-refreshes every 20 seconds
            </div>
        </div>
    );
}
