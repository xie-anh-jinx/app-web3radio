import React, { useState, useEffect } from 'react';
import { Users, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { getNowPlaying } from '../../api/azuracast';

export default function NowPlaying({ stationId = '1' }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNowPlaying = async () => {
            try {
                const np = await getNowPlaying(stationId);
                if (np && np.length > 0) {
                    setData(np[0]);
                } else if (np && np.now_playing) {
                    setData(np);
                }
            } catch (err) {
                console.error('Failed to fetch now playing data', err);
            } finally {
                setLoading(false);
            }
        };

        fetchNowPlaying();
        const interval = setInterval(fetchNowPlaying, 5000);
        return () => clearInterval(interval);
    }, [stationId]);

    if (loading && !data) {
        return (
            <div className="h-full min-h-[300px] flex items-center justify-center text-zinc-500 animate-pulse text-sm">
                Synchronizing Metadata...
            </div>
        );
    }

    const np = data?.now_playing;
    const song = np?.song;
    const listeners = data?.listeners?.total || 0;

    return (
        <div className="relative h-full overflow-hidden rounded-xl bg-zinc-800 p-6 flex flex-col group">
            {/* Background Image styling similar to the NFT dashboard hero */}
            <div
                className="absolute inset-0 opacity-20 transition-all duration-700 group-hover:opacity-30 group-hover:scale-105"
                style={{
                    backgroundImage: `url(${song?.art || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop'})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }}
            />
            {/* Gradient overlay to ensure text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-800/80 to-transparent" />

            <div className="relative z-10 flex flex-col h-full min-h-[300px]">
                {/* Header */}
                <div className="flex items-start justify-between mb-auto">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-wider text-red-500">Live</span>
                        </div>
                        <h2 className="text-3xl font-black text-white leading-tight break-words pr-4">
                            {song?.title || 'Static Silence'}
                        </h2>
                        <p className="text-zinc-400 text-lg font-medium mt-1">
                            {song?.artist || 'Unknown Signal'}
                        </p>
                    </div>
                </div>

                {/* Footer Stats & Info */}
                <div className="mt-8 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-zinc-900/60 backdrop-blur-md p-4 rounded-lg flex items-center gap-4">
                            <div className="p-2.5 bg-zinc-800 rounded-md text-fuchsia-500">
                                <Users className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-zinc-500 font-semibold">Listeners</p>
                                <p className="text-xl font-bold text-white">{listeners}</p>
                            </div>
                        </div>
                        <div className="bg-zinc-900/60 backdrop-blur-md p-4 rounded-lg flex items-center gap-4">
                            <div className="p-2.5 bg-zinc-800 rounded-md text-violet-500">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-zinc-500 font-semibold">Duration</p>
                                <p className="text-xl font-bold text-white">
                                    {np?.duration ? `${Math.floor(np.duration / 60)}:${(np.duration % 60).toString().padStart(2, '0')}` : '0:00'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-zinc-400">
                            <span>{np?.elapsed ? `${Math.floor(np.elapsed / 60)}:${(np.elapsed % 60).toString().padStart(2, '0')}` : '0:00'}</span>
                            <span>{np?.duration ? `${Math.floor(np.duration / 60)}:${(np.duration % 60).toString().padStart(2, '0')}` : '0:00'}</span>
                        </div>
                        <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: np?.duration ? `${(np.elapsed / np.duration) * 100}%` : '0%' }}
                                className="h-full bg-gradient-to-r from-fuchsia-600 to-violet-600 rounded-full"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
