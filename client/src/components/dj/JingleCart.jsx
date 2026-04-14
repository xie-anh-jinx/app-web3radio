import React, { useState, useEffect } from 'react';
import { Zap, RefreshCw, Volume2, Music } from 'lucide-react';
import azuraApi from '../../api/azuracast';

// Jingle categories with visual styling
const JINGLE_FOLDERS = [
    { key: 'jingles', label: 'Jingles', emoji: '🎵', hoverClass: 'hover:border-emerald-500/50 hover:bg-emerald-500/5' },
    { key: 'promos', label: 'Promos', emoji: '📣', hoverClass: 'hover:border-amber-500/50 hover:bg-amber-500/5' },
    { key: 'ads', label: 'Ads', emoji: '📢', hoverClass: 'hover:border-rose-500/50 hover:bg-rose-500/5' },
];

function JingleButton({ file, onPlay, playing, hoverClass, isDJ }) {
    const shortTitle = file.title?.length > 20 ? file.title.slice(0, 18) + '...' : (file.title || 'Unknown');
    const dur = file.length ? `${Math.floor(file.length)}s` : '';

    return (
        <button
            onClick={() => onPlay(file)}
            disabled={playing === file.id || !isDJ}
            className={`group relative flex flex-col items-center justify-center gap-2 rounded-xl p-4 text-center transition-all active:scale-95 border
                ${playing === file.id
                    ? 'bg-gradient-to-tr from-fuchsia-600 to-violet-600 text-white border-transparent shadow-lg shadow-fuchsia-900/30'
                    : `bg-zinc-900 border-zinc-700/50 text-zinc-300 ${!isDJ ? 'opacity-50 cursor-not-allowed' : hoverClass}`}`}
            title={!isDJ ? 'DJ permission required' : ''}
        >
            {playing === file.id && (
                <div className="absolute inset-0 rounded-xl bg-white/20 animate-pulse" />
            )}
            <div className={`text-2xl ${playing === file.id ? '' : 'group-hover:scale-110 transition-transform'}`}>
                {playing === file.id ? '▶' : '🎵'}
            </div>
            <span className={`text-xs font-bold leading-tight ${playing === file.id ? 'text-white' : ''}`}>{shortTitle}</span>
            {dur && <span className={`text-[10px] font-mono font-medium ${playing === file.id ? 'text-white/70' : 'text-zinc-500'}`}>{dur}</span>}
        </button>
    );
}

export default function JingleCart({ stationId = '1', isDJ = false }) {
    const [jingles, setJingles] = useState({});
    const [loading, setLoading] = useState(true);
    const [playing, setPlaying] = useState(null);
    const [lastPlayed, setLastPlayed] = useState(null);
    const [activeTab, setActiveTab] = useState('jingles');

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            const result = {};
            for (const { key } of JINGLE_FOLDERS) {
                try {
                    const res = await azuraApi.get(`/station/${stationId}/files?rowCount=100&page=1`);
                    const rows = (res.data?.rows ?? []).filter(r => r.path?.startsWith(key + '/'));
                    result[key] = rows;
                } catch {
                    result[key] = [];
                }
            }
            setJingles(result);
            setLoading(false);
        };
        fetchAll();
    }, [stationId]);

    const handlePlay = async (file) => {
        setPlaying(file.id);
        try {
            await azuraApi.post(`/station/${stationId}/request/${file.song_id}`);
            setLastPlayed({ title: file.title, artist: file.artist, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        } catch (e) {
            console.error('Failed to queue jingle', e);
            setLastPlayed({ title: file.title, artist: file.artist, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        } finally {
            setTimeout(() => setPlaying(null), 800);
        }
    };

    const currentFolder = JINGLE_FOLDERS.find(f => f.key === activeTab);
    const currentFiles = jingles[activeTab] ?? [];

    return (
        <div className="bg-zinc-800 rounded-xl flex flex-col overflow-hidden h-full">
            {/* Header */}
            <div className="p-6 border-b border-zinc-700/50 flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Zap className="w-5 h-5 text-fuchsia-500" /> Jingle Cart Wall
                </h3>
                {lastPlayed && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-lg px-3 py-1.5 animate-pulse">
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{lastPlayed.title} · {lastPlayed.at}</span>
                    </div>
                )}
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-zinc-700/50 bg-zinc-900/30">
                {JINGLE_FOLDERS.map(f => (
                    <button
                        key={f.key}
                        onClick={() => setActiveTab(f.key)}
                        className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase transition-all ${activeTab === f.key
                            ? 'text-fuchsia-400 bg-zinc-800 border-b-2 border-fuchsia-500'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                    >
                        <span className="text-sm">{f.emoji}</span>
                        <span>{f.label}</span>
                        <span className="text-zinc-600 font-mono">({jingles[f.key]?.length ?? 0})</span>
                    </button>
                ))}
            </div>

            {/* Cart grid */}
            <div className="flex-1 p-6 overflow-y-auto bg-zinc-800">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 text-zinc-600 animate-spin" />
                    </div>
                ) : currentFiles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 py-12 bg-zinc-900/50 rounded-xl border border-zinc-700/50">
                        <Music className="w-10 h-10 text-zinc-600" />
                        <p className="text-zinc-300 text-sm font-semibold">No {currentFolder?.label} loaded</p>
                        <p className="text-zinc-500 text-xs text-center max-w-[200px]">
                            Upload files to the <code className="text-zinc-400 font-mono bg-zinc-800 px-1 py-0.5 rounded">{activeTab}/</code> folder in your media
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                        {currentFiles.map(file => (
                            <JingleButton
                                key={file.id}
                                file={file}
                                onPlay={handlePlay}
                                playing={playing}
                                hoverClass={currentFolder?.hoverClass}
                                isDJ={isDJ}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-700/50 text-center text-xs text-zinc-500 font-medium bg-zinc-900/30">
                Click pad to play immediately (Sent to AutoDJ queue)
            </div>
        </div>
    );
}
