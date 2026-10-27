import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "https://website-monitoring-gz6c.onrender.com/api",
});

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("wm_auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
