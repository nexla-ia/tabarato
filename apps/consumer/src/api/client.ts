import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
})

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true

      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token')
        if (!refreshToken) throw new Error('No refresh token')

        // Bypass interceptor for the refresh call
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken })

        await SecureStore.setItemAsync('access_token', data.accessToken)
        if (data.refreshToken) {
          await SecureStore.setItemAsync('refresh_token', data.refreshToken)
        }

        original.headers.Authorization = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        // Refresh failed — clear session
        await SecureStore.deleteItemAsync('access_token')
        await SecureStore.deleteItemAsync('refresh_token')
      }
    }

    return Promise.reject(error)
  },
)
