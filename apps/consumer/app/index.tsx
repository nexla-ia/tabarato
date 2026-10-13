import { Redirect } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { useAuthStore } from '../src/stores/auth.store'
import { colors } from '../src/theme/colors'

export default function Index() {
  const { user, isLoading } = useAuthStore()

  if (isLoading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary }}>
      <ActivityIndicator color="#fff" size="large" />
    </View>
  )

  if (user?.role === 'STORE_OWNER') return <Redirect href="/(store-tabs)" />
  if (user?.role === 'COURIER')     return <Redirect href="/(courier-tabs)" />

  // Consumer (logged in or guest) → consumer home
  return <Redirect href="/(tabs)" />
}
