import axios from 'axios';
import Cookies from 'js-cookie';

// Create a configured Axios instance
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject the JWT token automatically
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Optional: Interceptor to handle global 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and potentially force logout if needed globally,
      // but usually the store handles it or the user redirects.
      Cookies.remove('token');
    }
    return Promise.reject(error);
  }
);
