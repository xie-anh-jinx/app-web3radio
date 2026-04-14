import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Clock, Music, Users, Play, Award, Zap, BarChart2, Heart, Ticket } from 'lucide-react';
import { getNowPlaying, getSongHistory } from '../../api/azuracast';
import TipModal from './TipModal';

function StatBadge({ icon: Icon, label, value, sub, accent = 'fuchsia' }) {
    const accents = {
        fuchsia: 'bg-zinc-900 border-zinc-700/50 text-fuchsia-400',
        violet: 'bg-zinc-900 border-zinc-700/50 text-violet-400',
        emerald: 'bg-zinc-900 border-zinc-700/50 text-emerald-400',
        amber: 'bg-zinc-900 border-zinc-700/50 text-amber-400',
        rose: 'bg-zinc-900 border-zinc-700/50 text-rose-400',
    };
    return (
        <div className={`rounded-lg p-4 border flex flex-col gap-2 ${accents[accent]}`}>
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 opacity-80" />
                <span className="text-xs font-semibold opacity-80 text-zinc-400">{label}</span>
            </div>
            <span className="font-bold text-2xl leading-none text-white mt-1">{value}</span>
            {sub && <span className="text-[10px] text-zinc-500 font-medium">{sub}</span>}
        </div>
    );
}

function HistoryRow({ item, rank }) {
    return (
        <div className="flex items-center gap-3 rounded-lg hover:bg-zinc-700/50 bg-zinc-900 border border-zinc-700/50 px-3 py-2.5 transition-colors">
            <span className="text-xs font-mono font-semibold text-zinc-500 w-4 text-right flex-shrink-0">{rank}.</span>
            <div className="w-8 h-8 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                {item.song?.art && <img src={item.song.art} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.song?.title ?? 'Unknown'}</p>
                <p className="text-xs text-zinc-400 truncate">{item.song?.artist ?? '—'}</p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-xs font-mono text-zinc-500">
                    {item.played_at ? new Date(item.played_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </p>
                {item.is_request && (
                    <span className="text-[10px] text-rose-400 font-semibold px-1.5 py-0.5 rounded bg-rose-500/10 mt-1 inline-block">Req</span>
                )}
            </div>
        </div>
    );
}

const SESSION_START = Math.floor(Date.now() / 1000);

function formatUptime(startEpoch) {
    const secs = Math.floor(Date.now() / 1000) - startEpoch;
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

export default function DJStats({ stationId = '1' }) {
    const [nowPlaying, setNowPlaying] = useState(null);
    const [history, setHistory] = useState([]);
    const [uptime, setUptime] = useState('00:00');
    const [peakListeners, setPeakListeners] = useState(0);
    const [isTipModalOpen, setIsTipModalOpen] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [np, hist] = await Promise.all([
                getNowPlaying(stationId),
                getSongHistory(stationId),
            ]);
            setNowPlaying(np);
            const rows = hist?.rows ?? hist ?? [];
            setHistory(Array.isArray(rows) ? rows : []);
            const currentListeners = np?.listeners?.current ?? 0;
            setPeakListeners(prev => Math.max(prev, currentListeners));
        } catch (e) {
            console.error('DJStats fetch failed', e);
        }
    }, [stationId]);

    useEffect(() => {
        fetchData();
        const dataInterval = setInterval(fetchData, 20000);
        const clockInterval = setInterval(() => setUptime(formatUptime(SESSION_START)), 1000);
        return () => {
            clearInterval(dataInterval);
            clearInterval(clockInterval);
        };
    }, [fetchData]);

    const listeners = nowPlaying?.listeners?.current ?? 0;
    const tracksPlayed = history.length;
    const requestCount = history.filter(h => h.is_request).length;
    const isOnline = nowPlaying?.is_online ?? false;

    // XP-style reputation
    const xp = (tracksPlayed * 10) + (peakListeners * 25) + (requestCount * 15);
    const level = Math.floor(xp / 100) + 1;
    const xpProgress = xp % 100;

    return (
        <div className="bg-zinc-800 rounded-xl flex flex-col overflow-hidden h-full">
            {/* Header */}
            <div className="p-6 border-b border-zinc-700/50 flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-fuchsia-500" /> Session Stats
                </h3>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${isOnline ? 'text-emerald-500 bg-zinc-900 border-zinc-700' : 'text-zinc-500 bg-zinc-900 border-zinc-700'}`}>
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                    {isOnline ? 'Live' : 'Offline'}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Stat grid */}
                <div className="grid grid-cols-2 gap-4">
                    <StatBadge icon={Clock} label="Session Uptime" value={uptime} sub="hh:mm" accent="violet" />
                    <StatBadge icon={Users} label="Listeners Now" value={listeners} sub={`Peak: ${peakListeners}`} accent="emerald" />
                    <StatBadge icon={Music} label="Tracks Played" value={tracksPlayed} sub="This session" accent="amber" />
                    <StatBadge icon={Zap} label="Requests" value={requestCount} sub="Queued from listeners" accent="rose" />
                </div>

                {/* Web3 Reputation / XP */}
                <div className="rounded-xl p-5 bg-gradient-to-br from-fuchsia-900/20 to-violet-900/10 border border-fuchsia-500/30 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Award className="w-5 h-5 text-fuchsia-400" />
                            <span className="text-sm font-semibold text-fuchsia-400">DJ Reputation</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 font-medium">Level</span>
                            <span className="text-2xl font-black text-white">{level}</span>
                        </div>
                    </div>

                    {/* XP Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-zinc-400">
                            <span>{xp} XP total</span>
                            <span className="text-white">{xpProgress}/100 to next level</span>
                        </div>
                        <div className="h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-700/50">
                            <div
                                className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-500 rounded-full transition-all duration-1000"
                                style={{ width: `${xpProgress}%` }}
                            />
                        </div>
                    </div>

                    {/* Tip Button */}
                    <div className="pt-2">
                        <button
                            onClick={() => setIsTipModalOpen(true)}
                            className="w-full py-3 bg-white text-black rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-fuchsia-100 transition-all active:scale-[0.98] shadow-lg shadow-fuchsia-500/10"
                        >
                            <Heart className="w-4 h-4 fill-black" />
                            Send Tip & Get PLY Tickets
                        </button>
                        <p className="text-[9px] text-zinc-500 mt-2 text-center flex items-center justify-center gap-1">
                            <Ticket className="w-3 h-3" /> Earn 1 ticket per 5,000 IDR tipped
                        </p>
                    </div>
                </div>

                <TipModal isOpen={isTipModalOpen} onClose={() => setIsTipModalOpen(false)} />

                {/* Play history */}
                <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" /> Recent Play History
                        </span>
                        <span className="text-xs text-zinc-500 font-medium">{tracksPlayed} tracks</span>
                    </div>
                    {history.length === 0 ? (
                        <p className="text-center text-zinc-500 text-sm py-6 bg-zinc-900 rounded-lg border border-zinc-700/50">No play history yet</p>
                    ) : (
                        <div className="space-y-2">
                            {history.slice(0, 10).map((item, i) => (
                                <HistoryRow key={i} item={item} rank={i + 1} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
