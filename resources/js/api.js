import axios from 'axios';
const api = axios.create({ headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
export default api;
