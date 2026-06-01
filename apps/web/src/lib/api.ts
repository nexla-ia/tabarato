import axios from 'axios'

export const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-b730d.up.railway.app/api'

export const api = axios.create({ baseURL: BASE })

api.interceptors.request.use(cfg => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('tb_token')
    if (token) cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

export function setToken(token: string) {
  localStorage.setItem('tb_token', token)
  api.defaults.headers.common.Authorization = `Bearer ${token}`
}

export function clearToken() {
  localStorage.removeItem('tb_token')
  delete api.defaults.headers.common.Authorization
}
