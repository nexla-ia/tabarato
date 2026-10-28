import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'
import { ToastProvider } from '../src/components/Toast'
import { useAuthStore } from '../src/stores/auth.store'
import { queryClient } from '../src/queryClient'
import { setupNotificationHandler, setupNotificationTapHandler, syncPushToken } from '../src/services/notifications'
// Registra a task de localização em segundo plano do entregador no boot (o SO pode
// reentregá-la em headless, então precisa estar definida no escopo do módulo).
import '../src/tasks/locationTask'

setupNotificationHandler()

export default function RootLayout() {
  const { loadFromStorage, user } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
    // Ao tocar numa notificação, abre o pedido relacionado.
    setupNotificationTapHandler()
  }, [])

  useEffect(() => {
    if (user) syncPushToken()
  }, [user?.id])

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(store-tabs)" />
        <Stack.Screen name="(courier-tabs)" />
        <Stack.Screen name="store/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="category/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="cart" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="checkout" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="store-reports" options={{ headerShown: false }} />
        <Stack.Screen name="addresses" options={{ headerShown: false }} />
        <Stack.Screen name="courier-register" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="favorites" options={{ headerShown: false }} />
        <Stack.Screen name="loyalty" options={{ headerShown: false }} />
        <Stack.Screen name="referral" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="anunciar" options={{ headerShown: false }} />
        <Stack.Screen name="meus-anuncios" options={{ headerShown: false }} />
      </Stack>
      </ToastProvider>
    </QueryClientProvider>
    </SafeAreaProvider>
  )
}
