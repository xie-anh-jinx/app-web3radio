import React, { useState, useEffect } from 'react';
import { Activity, Users, Zap, Clock, Radio, TrendingUp } from 'lucide-react';
import { getNowPlaying } from '../../api/azuracast';

function StatCard({ icon: Icon, label, value, colorClass = 'text-zinc-400 bg-zinc-900', pulse = false }) {
    return (
        <div className={`rounded-lg p-4 border border-zinc-700/50 flex flex-col gap-2 ${colorClass}`}>
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-semibold opacity-80">{label}</span>
                {pulse && <span className="ml-auto w-2 h-2 rounded-full bg-current animate-pulse shadow-[0_0_8px_currentColor]" />}
            </div>
            <span className="font-bold text-xl leading-none mt-1 text-white">{value}</span>
        </div>
    );
}

function formatUptime(startedAt) {
    if (!startedAt) return '—';
    const secs = Math.floor((Date.now() / 1000) - startedAt);
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

export default function StreamHealth({ stationId = '1' }) {
    const [health, setHealth] = useState(null);
    const [uptime, setUptime] = useState('—');
    const [broadcastStart, setBroadcastStart] = useState(null);
    const [error, setError] = useState(null);

    // Fetch health data
    useEffect(() => {
        const fetch = async () => {
            try {
                const data = await getNowPlaying(stationId);
                setHealth(data);
                setError(null);
                if (data?.is_online && !broadcastStart) {
                    setBroadcastStart(Math.floor(Date.now() / 1000) - (data.now_playing?.elapsed ?? 0));
                }
            } catch (e) {
                setError('Stream data unavailable');
            }
        };
        fetch();
        const interval = setInterval(fetch, 15000);
        return () => clearInterval(interval);
    }, [stationId]);

    // Live uptime clock
    useEffect(() => {
        const tick = setInterval(() => {
            setUptime(formatUptime(broadcastStart));
        }, 1000);
        return () => clearInterval(tick);
    }, [broadcastStart]);

    const listeners = health?.listeners?.current ?? 0;
    const isOnline = health?.is_online ?? false;
    const mount = health?.station?.mounts?.[0];
    const bitrate = mount?.bitrate ?? '—';
    const format = mount?.format?.toUpperCase() ?? '—';

    const elapsed = health?.now_playing?.elapsed ?? 0;
    const duration = health?.now_playing?.duration ?? 0;
    const progress = duration > 0 ? Math.round((elapsed / duration) * 100) : 0;

    return (
        <div className="bg-zinc-800 rounded-xl p-6 flex flex-col h-full relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 text-fuchsia-500" /> Infrastructure
                </h3>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${isOnline ? 'text-emerald-500 bg-zinc-900 border-zinc-700' : 'text-red-500 bg-zinc-900 border-zinc-700'}`}>
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                    {isOnline ? 'Online' : 'Offline'}
                </div>
            </div>

            {error ? (
                <div className="text-sm text-white font-medium bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-3">{error}</div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <StatCard icon={Users} label="Listeners" value={listeners} colorClass="text-fuchsia-400 bg-zinc-900" pulse={listeners > 0} />
                        <StatCard icon={Zap} label="Bitrate" value={bitrate ? `${bitrate}k` : '—'} colorClass="text-violet-400 bg-zinc-900" />
                        <StatCard icon={Radio} label="Format" value={format} colorClass="text-emerald-400 bg-zinc-900" />
                        <StatCard icon={Clock} label="Uptime" value={uptime} colorClass="text-blue-400 bg-zinc-900" />
                    </div>

                    {/* Track progress bar */}
                    {duration > 0 && (
                        <div className="space-y-2 bg-zinc-900 rounded-lg p-4 border border-zinc-700/50">
                            <div className="flex justify-between text-xs font-semibold text-zinc-400 mb-1">
                                <span>Track Progress</span>
                                <span className="text-white">{progress}%</span>
                            </div>
                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-fuchsia-600 to-violet-600 rounded-full transition-all duration-1000"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1">
                                <span>{new Date(elapsed * 1000).toISOString().substr(14, 5)}</span>
                                <span>{new Date(duration * 1000).toISOString().substr(14, 5)}</span>
                            </div>
                        </div>
                    )}

                    {/* Song history mini list */}
                    {health?.song_history?.length > 0 && (
                        <div className="space-y-3">
                            <div className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" /> Recent History
                            </div>
                            <div className="space-y-2">
                                {health.song_history.slice(0, 3).map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-700/50 px-3 py-2.5">
                                        <span className="text-xs font-mono text-zinc-500 w-4">{i + 1}.</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-white truncate">{item.song?.title ?? 'Unknown'}</p>
                                            <p className="text-xs text-zinc-400 truncate">{item.song?.artist ?? '—'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
