import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Music2, ChevronLeft, ChevronRight, Folder, ListPlus, RefreshCw, X, UploadCloud, FileAudio } from 'lucide-react';
import azuraApi, { uploadFile } from '../../api/azuracast';
import RequestPaymentModal from './RequestPaymentModal';

const ROWS = 12;

function formatDuration(secs) {
    if (!secs) return '—';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

const folderColors = {
    indie: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
    music: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    major_label: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    jingles: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    promos: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    podcast: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    ads: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

function FolderBadge({ path }) {
    const folder = path?.split('/')[0] ?? 'other';
    const color = folderColors[folder] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700';
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${color}`}>
            {folder}
        </span>
    );
}

export default function MusicLibrary({ stationId = '1', isDJ = false }) {
    const [files, setFiles] = useState([]);
    const [totalFiles, setTotalFiles] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [folder, setFolder] = useState('');
    const [loading, setLoading] = useState(false);
    const [queueing, setQueueing] = useState({});
    const [queuedIds, setQueuedIds] = useState(new Set());

    // Payment state
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [pendingSong, setPendingSong] = useState(null);

    // Upload state
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef(null);

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    // Reset page on filter change
    useEffect(() => { setPage(1); }, [debouncedSearch, folder]);

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                rowCount: ROWS,
                page,
                searchPhrase: debouncedSearch,
            });
            if (folder) params.append('searchPhrase', folder);
            const res = await azuraApi.get(`/station/${stationId}/files?${params}`);
            let rows = res.data?.rows ?? [];
            if (folder) rows = rows.filter(r => r.path?.startsWith(folder + '/'));
            setFiles(rows);
            setTotalFiles(res.data?.total ?? 0);
            setTotalPages(res.data?.total_pages ?? 1);
        } catch (e) {
            console.error('Failed to fetch library', e);
        } finally {
            setLoading(false);
        }
    }, [stationId, page, debouncedSearch, folder]);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);

    const handleQueueAdd = async (file) => {
        if (!isDJ) {
            setPendingSong(file);
            setIsPaymentModalOpen(true);
            return;
        }

        setQueueing(q => ({ ...q, [file.id]: true }));
        try {
            await azuraApi.post(`/station/${stationId}/request/${file.song_id}`);
            setQueuedIds(s => new Set([...s, file.id]));
        } catch {
            setQueuedIds(s => new Set([...s, file.id]));
        } finally {
            setQueueing(q => ({ ...q, [file.id]: false }));
        }
    };

    const handlePaymentSuccess = () => {
        if (pendingSong) {
            handleQueueAddInternal(pendingSong);
        }
    };

    const handleQueueAddInternal = async (file) => {
        setQueueing(q => ({ ...q, [file.id]: true }));
        try {
            await azuraApi.post(`/station/${stationId}/request/${file.song_id}`);
            setQueuedIds(s => new Set([...s, file.id]));
            alert(`Success! ${file.title} has been added to the queue.`);
        } catch (err) {
            console.error('Queue add failed', err);
            setQueuedIds(s => new Set([...s, file.id]));
        } finally {
            setQueueing(q => ({ ...q, [file.id]: false }));
            setPendingSong(null);
        }
    };

    const folders = ['', 'indie', 'music', 'major_label', 'jingles', 'promos', 'podcast'];

    // --- Upload Handlers ---
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await handleUpload(e.dataTransfer.files);
        }
    };

    const handleUpload = async (filesToUpload) => {
        if (!filesToUpload || filesToUpload.length === 0) return;
        setUploading(true);
        setUploadProgress(0);

        try {
            const arr = Array.from(filesToUpload);
            for (let i = 0; i < arr.length; i++) {
                // Upload each file to the currently selected folder (or root if none)
                const targetFolder = folder ? folder : '';
                await uploadFile(stationId, arr[i], targetFolder, (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    // Approximate total progress across multiple files
                    const overallPercent = Math.round(((i * 100) + percentCompleted) / arr.length);
                    setUploadProgress(overallPercent);
                });
            }
            alert('Upload success!');
            fetchFiles(); // Refresh library
        } catch (err) {
            console.error('Upload failed:', err);
            alert('Upload failed. See console for details.');
        } finally {
            setUploading(false);
            setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="bg-zinc-800 rounded-xl flex flex-col overflow-hidden h-full min-h-[600px]">
            {/* Header */}
            <div className="p-6 border-b border-zinc-700/50 space-y-5">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Music2 className="w-5 h-5 text-fuchsia-500" /> Music Library
                        <span className="text-zinc-500 text-sm font-normal">({totalFiles} tracks)</span>
                    </h3>
                    <div className="flex gap-2">
                        {isDJ && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className={`p-2 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center gap-2 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Upload Music"
                            >
                                <UploadCloud className="w-4 h-4" />
                                <span className="text-sm font-semibold hidden md:block">Upload</span>
                            </button>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={(e) => handleUpload(e.target.files)}
                            multiple
                            accept="audio/*"
                        />
                        <button onClick={fetchFiles} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white transition-colors">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Drag and Drop Uploader Area (DJs only) */}
                {isDJ && (
                    <div
                        className={`relative rounded-xl border-2 border-dashed transition-all overflow-hidden ${isDragging ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-zinc-700/50 hover:border-zinc-600 bg-zinc-800/50'}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <div className="p-4 flex flex-col items-center justify-center text-center">
                            {uploading ? (
                                <div className="w-full max-w-sm space-y-2">
                                    <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-fuchsia-400">Uploading...</span>
                                        <span className="text-zinc-400">{uploadProgress}%</span>
                                    </div>
                                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <UploadCloud className={`w-8 h-8 mb-2 ${isDragging ? 'text-fuchsia-400 transform scale-110' : 'text-zinc-500'} transition-all`} />
                                    <p className="text-sm text-zinc-300 font-medium">Drag & Drop audio files here</p>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Target folder: <strong className="text-fuchsia-400">{folder || 'Root (Uncategorized)'}</strong>
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search title, artist, album..."
                        className="w-full bg-zinc-900 border border-zinc-700/50 hover:border-zinc-600 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Folder filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    {folders.map(f => (
                        <button
                            key={f || 'all'}
                            onClick={() => setFolder(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-all border ${folder === f
                                ? 'bg-fuchsia-600/20 text-fuchsia-400 border-fuchsia-500/30'
                                : 'text-zinc-400 border-zinc-700/50 bg-zinc-900/50 hover:text-white hover:bg-zinc-700'}`}
                        >
                            {f || 'All'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Track list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loading && files.length === 0 ? (
                    <div className="py-20 flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 text-zinc-600 animate-spin" />
                    </div>
                ) : files.length === 0 ? (
                    <div className="py-20 text-center bg-zinc-900/50 rounded-xl border border-zinc-700/50">
                        <Music2 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-300 font-semibold text-sm">No tracks found</p>
                        <p className="text-zinc-500 text-xs mt-1">Try adjusting your search or filter</p>
                    </div>
                ) : (
                    files.map(file => (
                        <div
                            key={file.id}
                            className="flex items-center gap-4 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700/50 hover:bg-zinc-700/40 transition-colors group"
                        >
                            {/* Art */}
                            <div className="w-10 h-10 rounded shadow-sm bg-zinc-800 overflow-hidden shrink-0">
                                {file.art && <img src={file.art} alt="" className="w-full h-full object-cover" />}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{file.title || 'Unknown'}</p>
                                <p className="text-xs text-zinc-400 truncate mt-0.5">{file.artist || '—'}</p>
                            </div>

                            {/* Folder badge */}
                            <div className="hidden sm:block shrink-0">
                                <FolderBadge path={file.path} />
                            </div>

                            {/* Duration */}
                            <span className="text-xs font-mono font-medium text-zinc-500 shrink-0 w-12 text-right">
                                {formatDuration(file.length)}
                            </span>

                            {/* Queue button */}
                            <button
                                onClick={() => handleQueueAdd(file)}
                                disabled={queueing[file.id]}
                                className={`ml-2 p-2 rounded-md transition-colors shrink-0 ${queuedIds.has(file.id)
                                    ? 'text-emerald-400 bg-emerald-500/10'
                                    : 'text-zinc-400 bg-zinc-800 hover:text-white hover:bg-fuchsia-600 focus:bg-fuchsia-600 opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                                title={isDJ ? "Add to queue" : "Request song (1,200 IDR)"}
                            >
                                {queueing[file.id] ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                            </button>
                        </div>
                    ))
                )}
            </div>

            <RequestPaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                onPaymentSuccess={handlePaymentSuccess}
                songTitle={pendingSong?.title || ''}
            />

            {/* Pagination */}
            <div className="p-4 border-t border-zinc-700/50 flex items-center justify-between bg-zinc-900/30">
                <span className="text-xs font-mono font-medium text-zinc-500">Page {page} of {totalPages}</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="flex items-center justify-center w-8 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="flex items-center justify-center w-8 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
