import axios from 'axios';

let rawBaseUrl = import.meta.env.VITE_API_URL || '/api';
if (rawBaseUrl.startsWith('http') && !rawBaseUrl.endsWith('/api')) {
  rawBaseUrl = `${rawBaseUrl.replace(/\/+$/, '')}/api`;
}

const api = axios.create({
  baseURL: rawBaseUrl,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('emerald_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
