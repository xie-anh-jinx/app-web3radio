import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_AZURACAST_API_URL || '/api';
const API_KEY = import.meta.env.VITE_AZURACAST_API_KEY;

const azuraApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-API-Key': API_KEY,   // AzuraCast uses X-API-Key, not Bearer
    'Content-Type': 'application/json',
  },
});

// ── Now Playing ────────────────────────────────────────────────
export const getNowPlaying = async (stationId = '1') => {
  const response = await azuraApi.get(`/nowplaying/${stationId}`);
  return response.data;
};

// ── Playback Controls ──────────────────────────────────────────
export const skipTrack = async (stationId = '1') => {
  const response = await azuraApi.post(`/station/${stationId}/backend/skip`);
  return response.data;
};

export const restartBackend = async (stationId = '1') => {
  const response = await azuraApi.post(`/station/${stationId}/backend/restart`);
  return response.data;
};

export const toggleAutoDJ = async (stationId = '1') => {
  const response = await azuraApi.post(`/station/${stationId}/backend/autodj`);
  return response.data;
};

// ── Station Info ───────────────────────────────────────────────
export const getStation = async (stationId = '1') => {
  const response = await azuraApi.get(`/station/${stationId}`);
  return response.data;
};

export const getListeners = async (stationId = '1') => {
  const response = await azuraApi.get(`/station/${stationId}/listeners`);
  return response.data;
};

export const getSongHistory = async (stationId = '1') => {
  const response = await azuraApi.get(`/station/${stationId}/history?rows=10`);
  return response.data;
};

// ── Queue ──────────────────────────────────────────────────────
export const getQueue = async (stationId = '1') => {
  const response = await azuraApi.get(`/station/${stationId}/queue`);
  return response.data;
};

export const uploadFile = async (stationId = '1', file, folder = '', onProgress = null) => {
  const reader = new FileReader();

  const base64Promise = new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const base64Content = await base64Promise;

  const payload = {
    path: folder ? `${folder}/${file.name}` : file.name,
    file: base64Content
  };

  const response = await azuraApi.post(`/station/${stationId}/files`, payload, {
    onUploadProgress: onProgress
  });
  return response.data;
};

export const deleteQueueItem = async (stationId = '1', itemId) => {
  const response = await azuraApi.delete(`/station/${stationId}/queue/${itemId}`);
  return response.data;
};

// ── Requests ───────────────────────────────────────────────────
export const getPendingRequests = async (stationId = '1') => {
  const response = await azuraApi.get(`/station/${stationId}/requests`);
  return response.data;
};

export const approveRequest = async (stationId = '1', requestId) => {
  const response = await azuraApi.post(`/station/${stationId}/requests/${requestId}/approve`);
  return response.data;
};

export const denyRequest = async (stationId = '1', requestId) => {
  const response = await azuraApi.delete(`/station/${stationId}/requests/${requestId}`);
  return response.data;
};

// ── Live Metadata ──────────────────────────────────────────────
export const updateLiveMetadata = async (stationId = '1', metadata) => {
  const response = await azuraApi.post(`/station/${stationId}/backend/metadata`, metadata);
  return response.data;
};

export default azuraApi;
