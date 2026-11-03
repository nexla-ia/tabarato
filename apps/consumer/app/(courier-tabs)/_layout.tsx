import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { relevo, LABIO_NEUTRO } from '../../src/theme/relevo'

const ORANGE = '#FF5500'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({ name, focused }: { name: IoniconName; focused: boolean }) {
  return (
    <View style={[tab.iconWrap, focused && tab.iconWrapAtivo]}>
      <Ionicons name={name} size={21} color={focused ? ORANGE : '#AAAAAA'} />
    </View>
  )
}

const tab = StyleSheet.create({
  iconWrap: {
    alignItems: 'center', justifyContent: 'center',
    width: 46, height: 32, borderRadius: 11,
    position: 'relative', overflow: 'visible',
    backgroundColor: '#FBF7F3',
    borderWidth: 1, borderColor: '#F1E7DD',
    borderBottomWidth: 3, borderBottomColor: LABIO_NEUTRO,
  },
  iconWrapAtivo: { ...relevo.icone },
})

export default function CourierTabsLayout() {
  const insets = useSafeAreaInsets()
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ORANGE,
        tabBarInactiveTintColor: '#AAAAAA',
        tabBarStyle: {
          borderTopColor: '#F0E8E0',
          borderTopWidth: 1,
          // Soma a área segura inferior (barra de gestos) pra não cortar os rótulos.
          height: 70 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 10,
          backgroundColor: '#fff',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 4 },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'bicycle' : 'bicycle-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'receipt' : 'receipt-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Carteira',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'wallet' : 'wallet-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}
