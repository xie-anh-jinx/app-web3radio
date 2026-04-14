import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Music2, ListMusic, Radio, Mic2, MessageSquare,
  Settings, Wallet, Activity, ChevronRight, Plus, Volume2, VolumeX,
  Globe, Search, Bell, BarChart3, CalendarDays, Menu, ChevronLeft, X,
  Play, Pause, Loader
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// DJ Components
import NowPlaying from './components/dj/NowPlaying';
import PlaybackControls from './components/dj/PlaybackControls';
import StreamHealth from './components/dj/StreamHealth';
import MusicLibrary from './components/dj/MusicLibrary';
import QueueManager from './components/dj/QueueManager';
import JingleCart from './components/dj/JingleCart';
import RequestPanel from './components/dj/RequestPanel';
import DJStats from './components/dj/DJStats';
import LiveBroadcast from './components/dj/LiveBroadcast';
import { getNowPlaying } from './api/azuracast';

// Reown AppKit
import { createAppKit, useAppKit, useAppKitAccount, useDisconnect, useAppKitProvider } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { solana, mainnet, optimism, bsc, polygon, avalanche, arbitrum, zksync, base } from "@reown/appkit/networks";
import { BrowserProvider } from 'ethers';

const solanaWeb3JsAdapter = new SolanaAdapter({
  wallets: [],
  networks: [solana]
});
const ethersAdapter = new EthersAdapter();

// Debug origin for the user
if (typeof window !== 'undefined') {
  console.log('AppKit Origin:', window.location.origin);
}

createAppKit({
  adapters: [solanaWeb3JsAdapter, ethersAdapter],
  networks: [solana, mainnet, optimism, bsc, polygon, avalanche, arbitrum, zksync, base],
  metadata: {
    name: "Web3Radio Studio",
    description: "Decentralized Radio Station CMS",
    url: "https://app.webthreeradio.xyz",
    icons: ["https://i.imgur.com/6tbi57M.png"],
  },
  projectId: "76b304d130e22a1c837b1b54e208f9d6",
  features: {
    analytics: false, // Temporarily disable analytics to reduce possible blocking issues
    email: false,
    socials: [],
    swaps: true // Enabled built-in swap feature
  },
  themeMode: 'dark',
});

const DJ_WALLETS = [
  '9xhz4Cb4C2Z4z9xdD2geCafovNYVngC4E4XpWtQmeEuv',
  '41MLp5oX9yYwNoMCcQUw9ZRZQazEacU5JThrGv6E5wMU',
  '0x13dd8b8f54c3b54860f8d41a6fbff7ffc6bf01ef',
  '2k55P5f5yyH2LWJDS9FQcRVh5uPgUWBfZRUFVNPWYnfP',
  '7ZNASkeGNj3aGikReTUdEiN98heqr1fCTBd2gGm7cacV',
  '53RBcxsuGsUXcBkFeVuChBkhAGWo7ENRYmAVQpWgVLAM',
  '9VpRM4b7LThzCVVVYKAmAxPGEZsnv5ZmqUD28jvZ9QdR',
  '0x242dfb7849544ee242b2265ca7e585bdec60456b',
  '126NEW5NJMigVDYtHh6irvSDJ1iKCTNnt1H239MqCqrC',
  '7vU5Vx6G5DCfZFHrrGh87D2brQ9JHbB61tGSow3pJKvL',
  '6NaFVmKpuBggJrwomZTXC212U4qF9G8nn3S3rvtx1Lmq',
  'CtjTzBWLZ8oHRxpFaRPLFAi5uGKU45TCV1QMjxgR5cB'
].map(a => a.toLowerCase());

const SidebarIcon = ({ children, active }) => (
  <span className={`w-8 h-8 grid place-items-center rounded-md shrink-0 ${active ? 'bg-gradient-to-tr from-fuchsia-600 to-violet-600' : 'bg-zinc-800'}`}>
    {children}
  </span>
);

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'now-playing', label: 'Now Playing', icon: Radio },
  { id: 'library', label: 'Music Library', icon: ListMusic },
  { id: 'queue', label: 'Queue & Jingles', icon: CalendarDays },
  { id: 'broadcast', label: 'Go Live', icon: Mic2, requiresDJ: true },
  { id: 'community', label: 'Community', icon: MessageSquare },
  { id: 'analytics', label: 'DJ Stats', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [nowPlaying, setNowPlaying] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPlayingStream, setIsPlayingStream] = useState(false);
  const [isStreamLoading, setIsStreamLoading] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [streamUrl, setStreamUrl] = useState(`https://${window.location.host}/listen/kotaromiyabi/radio.mp3`);
  const audioRef = React.useRef(null);

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const { open } = useAppKit();
  const { address, isConnected, chainId } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const { walletProvider } = useAppKitProvider(chainId?.toString().startsWith('solana') ? 'solana' : 'eip155');

  const isDJ = isConnected && address && DJ_WALLETS.includes(address.toLowerCase());

  // Signature Approval Flow
  useEffect(() => {
    const handleApproval = async () => {
      if (isConnected && address && walletProvider && !isAuthorized && !isSigning) {
        setIsSigning(true);
        try {
          const message = `Welcome to Web3Radio Studio!\n\nPlease sign this message to approve your session.\n\nAddress: ${address}\nTimestamp: ${new Date().toISOString()}`;

          if (chainId?.toString().startsWith('solana')) {
            const encodedMessage = new TextEncoder().encode(message);
            await walletProvider.signMessage(encodedMessage);
          } else {
            const provider = new BrowserProvider(walletProvider);
            const signer = await provider.getSigner();
            await signer.signMessage(message);
          }

          setIsAuthorized(true);
          console.log('Session approved by', address);
        } catch (err) {
          console.error('Signature rejected', err);
          disconnect();
          alert('You must sign the message to use the dashboard features.');
        } finally {
          setIsSigning(false);
        }
      }
    };

    handleApproval();
  }, [isConnected, address, walletProvider, chainId, isAuthorized, isSigning, disconnect]);

  // Reset authorization on disconnect
  useEffect(() => {
    if (!isConnected) {
      setIsAuthorized(false);
    }
  }, [isConnected]);

  useEffect(() => {
    const fetchNP = async () => {
      try {
        const data = await getNowPlaying('1');
        setNowPlaying(data);
        if (data?.station?.listen_url) {
          // Force HTTPS if we are on an HTTPS page to avoid Mixed Content issues
          let url = data.station.listen_url;
          if (window.location.protocol === 'https:' && url.startsWith('http:')) {
            url = url.replace('http:', 'https:');
          }
          setStreamUrl(url);
        }
      } catch { }
    };
    fetchNP();
    const id = setInterval(fetchNP, 10000);
    return () => clearInterval(id);
  }, []);

  const isOnline = nowPlaying?.is_online ?? false;
  const isLive = nowPlaying?.live?.is_live ?? false;
  const track = isLive ? 'Live DJ Set' : (nowPlaying?.now_playing?.song?.title ?? 'Offline');
  const artist = isLive ? (nowPlaying?.live?.streamer_name || 'Web3Radio DJ') : (nowPlaying?.now_playing?.song?.artist ?? '');
  const art = nowPlaying?.now_playing?.song?.art;
  const listeners = nowPlaying?.listeners?.current ?? 0;

  const toggleStream = () => {
    if (!audioRef.current) return;

    if (isPlayingStream) {
      audioRef.current.pause();
      // To ensure we get the live stream rather than a cached buffer, we can force a reload.
      audioRef.current.load();
      setIsPlayingStream(false);
      setIsStreamLoading(false);
    } else {
      setIsStreamLoading(true);
      // Force cache-bust to jump to live edge if needed
      // Use the latest streamUrl and add a timestamp
      const baseStream = streamUrl;
      audioRef.current.src = `${baseStream}${baseStream.includes('?') ? '&' : '?'}ts=${Date.now()}`;

      // Sync volume before playing
      audioRef.current.volume = isMuted ? 0 : volume;

      audioRef.current.play()
        .then(() => {
          setIsPlayingStream(true);
          setIsStreamLoading(false);
        })
        .catch(err => {
          console.error('Audio playback failed', err);
          setIsPlayingStream(false);
          setIsStreamLoading(false);
        });
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : newVolume;
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.volume = !isMuted ? 0 : volume;
    }
  };

  return (
    <>
      <aside className="hidden lg:flex h-screen flex-col justify-between w-48 fixed left-0 top-0 bottom-0 pt-20 z-40 border-r border-zinc-800/40 bg-zinc-900">
        <ul className="space-y-2 px-2">
          {navItems.filter(item => !item.requiresDJ || isDJ).map((item) => (
            <li key={item.id} className="relative">
              {activeTab === item.id && <div className="absolute -left-2 top-1 bg-fuchsia-600 w-1.5 h-7 rounded-full" />}
              <button
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${activeTab === item.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <SidebarIcon active={activeTab === item.id}><item.icon className="w-4 h-4 text-white" /></SidebarIcon>
                <span className="text-sm font-medium truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="pb-5 px-3">
          <div className="px-2 mb-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDJ ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30' : isConnected ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-zinc-700/20 text-zinc-500 border border-zinc-700/30'}`}>
              {isDJ ? 'DJ MODE' : isConnected ? 'VIEWER MODE' : 'PUBLIC VIEW'}
            </span>
          </div>
          <hr className="mb-4 border-zinc-800" />
          {isConnected ? (
            <button onClick={() => open()} className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors px-2 relative group">
              <div className="relative">
                <img src={art || "https://i.imgur.com/6tbi57M.png"} alt="dj" className="w-8 h-8 rounded-full border border-zinc-700 shadow-sm object-cover" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-zinc-900" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-zinc-200 group-hover:text-fuchsia-400 transition-colors">{isDJ ? 'DJ Kotaro' : 'Viewer'}</p>
                <p className="text-[10px] text-zinc-500 font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
              </div>
            </button>
          ) : (
            <button onClick={() => open()} className="neu-btn neu-raised w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr flex items-center justify-center gap-2">
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </aside>

      <audio id="global-radio-stream" ref={audioRef} preload="auto" crossOrigin="anonymous" src={streamUrl} />
      <header className="flex flex-wrap p-3 items-center sticky top-0 bg-zinc-900/95 backdrop-blur-xl h-fit md:h-16 z-30 border-b border-zinc-800/40">
        <div className="flex items-center grow md:grow-0 w-fit md:w-48">
          <img src="https://i.imgur.com/6tbi57M.png" alt="logo" className="w-10 h-10 rounded-full shadow-lg object-cover" />
          <div className="ml-2 font-bold text-lg tracking-tight">Web3Radio</div>
        </div>

        {/* Global Audio Player */}
        <div className="flex items-center mx-4 gap-3 neu-inset p-1.5 pr-4 rounded-full">
          <button
            onClick={toggleStream}
            disabled={isStreamLoading}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-fuchsia-600 to-violet-600 flex items-center justify-center text-white neu-btn shadow-lg disabled:opacity-75 disabled:scale-100"
          >
            {isStreamLoading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : isPlayingStream ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-1" />
            )}
          </button>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-widest">{isOnline ? 'ON AIR' : 'OFFLINE'}</span>
            <div className="flex items-center gap-1 h-3 mt-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-1 bg-fuchsia-500 rounded-full ${isPlayingStream && isOnline ? 'animate-[bounce_1s_infinite]' : 'h-1 opacity-50'}`}
                  style={{
                    height: isPlayingStream && isOnline ? '100%' : '4px',
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: `${0.8 + (i % 3) * 0.2}s`
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center order-2 md:order-3 pl-0 md:pl-3 gap-4 ml-auto">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-400"><Globe className="w-3.5 h-3.5" /><span>{listeners}</span></div>
          <div className="relative cursor-pointer">
            <Bell className="w-5 h-5 text-zinc-400 hover:text-white transition-colors" />
            <div className="absolute right-0 top-0 w-2.5 h-2.5 bg-zinc-900 rounded-full p-0.5"><div className="bg-red-500 w-full h-full rounded-full" /></div>
          </div>
          {isConnected ? (
             <button onClick={() => open()} className="flex items-center gap-2">
               <div className="w-9 h-9 rounded-full neu-raised flex items-center justify-center overflow-hidden border border-zinc-700">
                 <img src={art || "https://i.imgur.com/6tbi57M.png"} alt="user" className="w-full h-full object-cover" />
               </div>
             </button>
          ) : (
             <button onClick={() => open()} className="neu-btn neu-raised flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-fuchsia-600 to-violet-600">
               <Wallet className="w-4 h-4" />
               <span className="hidden sm:inline">Connect Wallet</span>
             </button>
          )}
          <button className="lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu className="w-5 h-5 text-zinc-400" /></button>
        </div>
        <div className="flex mt-4 md:mt-0 order-3 md:order-2 w-full grow md:w-fit">
          <div className="relative grow md:max-w-lg">
            <input type="text" className="neu-inset pl-3 pr-10 h-10 rounded-xl w-full text-sm placeholder:text-zinc-500 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-fuchsia-600/50 transition-all border border-zinc-800/50" placeholder="Search tracks, artists, commands..." />
            <span className="absolute right-0 top-0 bottom-0 w-10 grid place-items-center"><Search className="w-4 h-4 text-zinc-500" /></span>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.div initial={{ x: -256 }} animate={{ x: 0 }} exit={{ x: -256 }} transition={{ type: 'spring', damping: 25 }} className="fixed left-0 top-0 bottom-0 w-64 bg-zinc-900 z-50 p-4 flex flex-col lg:hidden border-r border-zinc-800">
              <button onClick={() => setSidebarOpen(false)} className="self-end mb-4 text-zinc-500"><X className="w-5 h-5" /></button>
              {navItems.filter(item => !item.requiresDJ || isDJ).map((item) => (
                <button key={item.id} onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === item.id ? 'text-white bg-fuchsia-600/10' : 'text-zinc-500'}`}>
                  <item.icon className="w-4 h-4" /><span className="text-sm font-medium">{item.label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row">
        <div className="w-48 hidden lg:block shrink-0" />

        <div className="grow min-h-screen relative overflow-hidden pb-20">
          {/* Dashboard */}
          <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
            <div className="p-3">
              <h1 className="text-2xl font-bold mt-3 px-1">Dashboard</h1>
              <h2 className="text-zinc-500 px-1 text-sm">Web3Radio Studio — Manage your station, go live, queue tracks</h2>
              <div className="p-3 mt-2">
                <div className="w-full rounded-xl overflow-hidden relative">
                  <div className="w-full h-44 bg-gradient-to-r from-fuchsia-900 via-violet-800 to-purple-900 flex flex-col justify-center px-6 relative">
                    <div className="absolute right-8 top-4 opacity-10">
                      <div className="w-32 h-32 border-[6px] border-white rounded-full" />
                      <div className="w-24 h-24 border-[6px] border-white rounded-full absolute -right-8 top-8" />
                    </div>
                    <div className="relative z-10">
                      <h2 className="font-bold text-3xl max-w-md text-white leading-tight">
                        {isOnline ? '🔴 Station is LIVE' : 'Start Broadcasting'}
                      </h2>
                      <p className="text-white/60 mt-1 text-sm max-w-md">
                        {isOnline ? `Now playing: ${track} — ${artist} · ${listeners} listener${listeners !== 1 ? 's' : ''}` : 'Connect your wallet and go live to start your DJ session'}
                      </p>
                      <button onClick={() => setActiveTab(isOnline ? 'now-playing' : 'broadcast')} className="py-2.5 bg-gradient-to-tr from-fuchsia-600 to-violet-600 rounded-lg w-44 mt-3 font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-fuchsia-900/40">
                        {isOnline ? 'View Now Playing' : 'Go Live'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:flex-row justify-between px-3 mt-4 mb-1">
                <h2 className="text-xl font-semibold">Station Overview</h2>
                <ul className="inline-flex space-x-3 mt-1 md:mt-0">
                  {['Controls', 'Library', 'Queue', 'Stats'].map((text, i) => (
                    <li key={text}><button onClick={() => setActiveTab(['now-playing', 'library', 'queue', 'analytics'][i])} className={`text-sm ${i === 0 ? 'text-fuchsia-500 underline font-bold' : 'text-zinc-500 hover:text-zinc-300'} transition-colors`}>{text}</button></li>
                  ))}
                </ul>
              </div>
              <ul className="p-1.5 flex flex-wrap">
                <li className="w-full lg:w-1/2 xl:w-2/3 p-1.5"><div className="neu-raised rounded-2xl w-full overflow-hidden border border-zinc-800/50"><NowPlaying /></div></li>
                <li className="w-full lg:w-1/2 xl:w-1/3 p-1.5"><div className="neu-raised rounded-2xl w-full overflow-hidden border border-zinc-800/50"><PlaybackControls isOnline={isOnline} isDJ={isDJ} /></div></li>
                <li className="w-full lg:w-1/2 xl:w-2/3 p-1.5"><div className="neu-raised rounded-2xl w-full overflow-hidden border border-zinc-800/50"><StreamHealth stationId="1" /></div></li>
                <li className="w-full lg:w-1/2 xl:w-1/3 p-1.5"><div className="neu-raised rounded-2xl w-full overflow-hidden border border-zinc-800/50"><DJStats stationId="1" /></div></li>
                <li className="w-full p-1.5"><div className="neu-raised rounded-2xl w-full overflow-hidden border border-zinc-800/50"><MusicLibrary stationId="1" isDJ={isDJ} /></div></li>
                <li className="w-full lg:w-7/12 p-1.5"><div className="neu-raised rounded-2xl w-full overflow-hidden border border-zinc-800/50"><QueueManager stationId="1" isDJ={isDJ} /></div></li>
                <li className="w-full lg:w-5/12 p-1.5"><div className="neu-raised rounded-2xl w-full overflow-hidden border border-zinc-800/50"><JingleCart stationId="1" isDJ={isDJ} /></div></li>
              </ul>
            </div>
          </div>

          {/* Now Playing */}
          <div className={activeTab === 'now-playing' ? 'block' : 'hidden'}>
            <div className="p-4 space-y-4">
              <h1 className="text-2xl font-bold">Control Room</h1>
              <div className="flex flex-wrap -mx-1.5">
                <div className="w-full xl:w-2/3 p-1.5"><div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><NowPlaying /></div></div>
                <div className="w-full xl:w-1/3 p-1.5"><div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><PlaybackControls isOnline={isOnline} isDJ={isDJ} /></div></div>
                <div className="w-full p-1.5"><div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><StreamHealth stationId="1" /></div></div>
              </div>
            </div>
          </div>

          {/* Library */}
          <div className={activeTab === 'library' ? 'block' : 'hidden'}>
            <div className="p-4 space-y-4">
              <h1 className="text-2xl font-bold">Music Library</h1>
              <p className="text-zinc-500 text-sm">Search, filter and queue tracks to AutoDJ</p>
              <div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><MusicLibrary stationId="1" isDJ={isDJ} /></div>
            </div>
          </div>

          {/* Queue */}
          <div className={activeTab === 'queue' ? 'block' : 'hidden'}>
            <div className="p-4 space-y-4">
              <h1 className="text-2xl font-bold">Queue & Jingles</h1>
              <div className="flex flex-wrap -mx-1.5">
                <div className="w-full lg:w-7/12 p-1.5"><div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><QueueManager stationId="1" isDJ={isDJ} /></div></div>
                <div className="w-full lg:w-5/12 p-1.5"><div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><JingleCart stationId="1" isDJ={isDJ} /></div></div>
              </div>
            </div>
          </div>

          {/* Go Live */}
          <div className={activeTab === 'broadcast' ? 'block' : 'hidden'}>
            <div className="p-4 max-w-5xl mx-auto space-y-4">
              <h1 className="text-2xl font-bold">Go Live</h1>
              <p className="text-zinc-500 text-sm">Broadcast your mic & system audio over the station</p>
              <div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><LiveBroadcast isDJ={isDJ} onBroadcastState={setIsBroadcasting} /></div>
            </div>
          </div>

          {/* Community */}
          <div className={activeTab === 'community' ? 'block' : 'hidden'}>
            <div className="p-4 space-y-4">
              <h1 className="text-2xl font-bold">Community Hub</h1>
              <div className="flex flex-wrap -mx-1.5">
                <div className="w-full lg:w-1/2 p-1.5"><div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><RequestPanel stationId="1" isDJ={isDJ} /></div></div>
                <div className="w-full lg:w-1/2 p-1.5"><div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><DJStats stationId="1" /></div></div>
              </div>
            </div>
          </div>

          {/* DJ Analytics */}
          <div className={activeTab === 'analytics' ? 'block' : 'hidden'}>
            <div className="p-4 max-w-2xl mx-auto space-y-4">
              <h1 className="text-2xl font-bold">DJ Stats & Reputation</h1>
              <div className="neu-raised rounded-2xl overflow-hidden border border-zinc-800/50"><DJStats stationId="1" /></div>
            </div>
          </div>

          {/* Settings */}
          <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
            <div className="p-4 flex flex-col items-center justify-center py-40 gap-4 text-zinc-600">
              <Settings className="w-12 h-12" />
              <h2 className="text-xl font-semibold">Station Settings</h2>
              <p className="text-sm">Coming Soon</p>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="p-3 md:w-72 shrink-0 md:sticky md:top-16 h-fit hidden xl:block">
          <h2 className="text-lg font-semibold">Now Playing</h2>
          <div className="neu-raised rounded-2xl p-4 mt-3 border border-zinc-800/50">
            {isLive ? (
              <video src="/live_artwork.mp4" autoPlay loop muted playsInline className="w-full h-40 object-cover rounded-xl shadow-[0_0_20px_rgba(217,70,239,0.3)] border border-fuchsia-500/30" />
            ) : art ? (
              <img src={art} alt="artwork" className="w-full h-40 object-cover rounded-xl" />
            ) : (
              <div className="w-full h-40 neu-inset rounded-xl grid place-items-center"><Music2 className="w-10 h-10 text-zinc-600" /></div>
            )}
            <h3 className="font-semibold mt-3 truncate">{track}</h3>
            <p className="text-sm text-zinc-400 truncate">{artist || 'Unknown Artist'}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
              {isOnline ? `${listeners} listener${listeners !== 1 ? 's' : ''}` : 'Station offline'}
            </div>
          </div>
          <h2 className="text-lg font-semibold mt-6">Quick Actions</h2>
          <ul className="mt-3 space-y-2">
            {[
              { label: 'Skip Track', tab: 'now-playing', color: 'text-fuchsia-400' },
              { label: 'Browse Library', tab: 'library', color: 'text-violet-400' },
              ...(isDJ ? [{ label: 'Go Live', tab: 'broadcast', color: 'text-red-400' }] : []),
              { label: 'View Requests', tab: 'community', color: 'text-amber-400' },
            ].map(({ label, tab, color }) => (
              <li key={tab}>
                <button onClick={() => setActiveTab(tab)} className="neu-flat rounded-xl p-3 flex items-center w-full hover:bg-zinc-800 transition-colors group border border-zinc-800/50">
                  <ChevronRight className={`w-4 h-4 ${color} mr-2 group-hover:translate-x-0.5 transition-transform`} /><span className="text-sm font-medium">{label}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="w-full rounded-xl bg-gradient-to-tr from-fuchsia-600 to-violet-600 mt-4 p-4 relative overflow-hidden shadow-lg">
            <div className="absolute right-0 top-0 opacity-10"><svg className="w-full" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="150" cy="30" r="80" stroke="white" strokeWidth="8" /><circle cx="180" cy="80" r="60" stroke="white" strokeWidth="8" /></svg></div>
            <div className="z-10 relative">
              <h2 className="text-white font-semibold text-sm">Web3 DJ Reputation</h2>
              <p className="text-white/50 text-xs mt-1">Earn XP for every track played, listener joined, and request fulfilled</p>
              <button onClick={() => setActiveTab('analytics')} className="bg-white w-full rounded-lg h-10 text-zinc-900 font-semibold mt-3 text-sm hover:bg-zinc-100 transition-colors">View Stats</button>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 h-16 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800/40 flex items-center px-4 z-30">
        <div className="hidden lg:block w-48 shrink-0" />
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-3 w-1/3">
            {art ? <img src={art} alt="" className="w-10 h-10 rounded-md object-cover" /> : <div className="w-10 h-10 rounded-md bg-zinc-800" />}
            <div className="overflow-hidden"><p className="text-xs font-semibold truncate">{track}</p><p className="text-[10px] text-zinc-500 truncate">{artist}</p></div>
          </div>
          <div className="flex items-center gap-4 justify-center flex-1">
            <button className="text-zinc-500 hover:text-white transition-colors" title="Add to Library"><Plus className="w-4 h-4" /></button>
            <button
              onClick={toggleStream}
              disabled={isStreamLoading}
              className="w-10 h-10 rounded-full bg-gradient-to-tr from-fuchsia-600 to-violet-600 grid place-items-center text-white hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-fuchsia-900/30 disabled:opacity-50"
            >
              {isStreamLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : isPlayingStream ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{nowPlaying?.now_playing ? `${Math.floor((nowPlaying.now_playing.elapsed || 0) / 60)}:${String(Math.floor((nowPlaying.now_playing.elapsed || 0) % 60)).padStart(2, '0')}` : '0:00'}</span>
          </div>
          <div className="flex items-center justify-end gap-3 w-1/3">
            <button onClick={toggleMute} className="text-zinc-500 hover:text-white transition-colors">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden relative group cursor-pointer">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div
                className="h-full bg-gradient-to-r from-fuchsia-600 to-violet-600 rounded-full transition-all duration-150"
                style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
