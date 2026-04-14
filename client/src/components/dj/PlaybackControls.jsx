import React, { useState } from 'react';
import { FastForward, Pause, RefreshCw, Power, CheckCircle } from 'lucide-react';
import { skipTrack, restartBackend } from '../../api/azuracast';

export default function PlaybackControls({ stationId = '1', isOnline = true, isDJ = false }) {
    const [skipLoading, setSkipLoading] = useState(false);
    const [syncLoading, setSyncLoading] = useState(false);
    const [lastAction, setLastAction] = useState(null);

    const showToast = (msg) => {
        setLastAction(msg);
        setTimeout(() => setLastAction(null), 3000);
    };

    const handleSkip = async () => {
        setSkipLoading(true);
        try {
            await skipTrack(stationId);
            showToast('Track skipped ✓');
        } catch (err) {
            console.error('Failed to skip track', err);
            showToast('Skip failed ✗');
        } finally {
            setSkipLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncLoading(true);
        try {
            await restartBackend(stationId);
            showToast('Backend synced ✓');
        } catch (err) {
            console.error('Failed to sync', err);
            showToast('Sync failed ✗');
        } finally {
            setSyncLoading(false);
        }
    };

    return (
        <div className="bg-zinc-800 rounded-xl p-6 flex flex-col justify-between h-full relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Power className="w-5 h-5 text-fuchsia-500" /> Controls
                </h3>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${isOnline ? 'bg-zinc-900 border-zinc-700 text-emerald-500' : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}>
                    {isOnline ? '● AutoDJ Active' : '○ Offline'}
                </div>
            </div>

            {/* Toast notification */}
            {lastAction && (
                <div className="mb-4 flex items-center justify-center gap-2 text-sm font-bold text-white bg-fuchsia-600/20 border border-fuchsia-500/30 rounded-lg px-4 py-2">
                    <CheckCircle className="w-4 h-4 text-fuchsia-400" /> {lastAction}
                </div>
            )}

            <div className="flex flex-col gap-4">
                {/* Skip — primary action */}
                <button
                    onClick={handleSkip}
                    disabled={skipLoading || !isOnline || !isDJ}
                    className={`w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-tr from-fuchsia-600 to-violet-600 text-white rounded-lg font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-fuchsia-900/20`}
                    title={!isDJ ? 'DJ permission required' : ''}
                >
                    {skipLoading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <FastForward className="w-5 h-5" />
                            <span>Skip Current Track</span>
                        </>
                    )}
                </button>

                <div className="grid grid-cols-2 gap-4">
                    {/* Hold visual */}
                    <button
                        className="flex items-center justify-center gap-2 py-3 bg-zinc-900 hover:bg-zinc-700 text-zinc-300 rounded-lg font-semibold text-sm transition-colors border border-zinc-700 disabled:opacity-50"
                        disabled={!isOnline || !isDJ}
                        title={!isDJ ? 'DJ permission required' : ''}
                    >
                        <Pause className="w-4 h-4" />
                        <span>Hold</span>
                    </button>

                    {/* Sync action */}
                    <button
                        onClick={handleSync}
                        disabled={syncLoading || !isDJ}
                        className="flex items-center justify-center gap-2 py-3 bg-zinc-900 hover:bg-zinc-700 text-zinc-300 rounded-lg font-semibold text-sm transition-colors border border-zinc-700 disabled:opacity-50"
                        title={!isDJ ? 'DJ permission required' : ''}
                    >
                        <RefreshCw className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} />
                        <span>{syncLoading ? 'Syncing...' : 'Sync'}</span>
                    </button>
                </div>
            </div>

            <div className="mt-8">
                <p className="text-zinc-500 text-xs text-center">Source: AZURACAST AutoDJ</p>
            </div>
        </div >
    );
}
