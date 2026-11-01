// library: axios (mit), http client; credited in credits.md
import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,
})
