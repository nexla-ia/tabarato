import { Tabs, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../src/theme/colors'
import { useCartStore } from '../../src/stores/cart.store'
import { useConsumerStore } from '../../src/stores/consumer.store'
import { useAuthStore } from '../../src/stores/auth.store'
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Image, Pressable, Platform,
} from 'react-native'
import { useEffect, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({ name, focused }: { name: IoniconName; focused: boolean }) {
  return (
    <View style={tab.iconWrap}>
      <Ionicons name={name} size={22} color={focused ? colors.primary : '#AAAAAA'} />
    </View>
  )
}

function OrdersTabIcon({ focused }: { focused: boolean }) {
  const count = useConsumerStore((s) => s.activeOrderCount)
  return (
    <View style={tab.iconWrap}>
      <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={focused ? colors.primary : '#AAAAAA'} />
      {count > 0 && (
        <View style={badge.dot}>
          <Text style={badge.text}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  )
}

function CartTabIcon({ focused }: { focused: boolean }) {
  const count = useCartStore((s) => s.itemCount())
  return (
    <View style={tab.iconWrap}>
      <Ionicons name={focused ? 'cart' : 'cart-outline'} size={22} color={focused ? colors.primary : '#AAAAAA'} />
      {count > 0 && (
        <View style={badge.dot}>
          <Text style={badge.text}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  )
}

function LoginPrompt() {
  const insets = useSafeAreaInsets()
  const { user, isLoading } = useAuthStore()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [user, isLoading])

  if (user || isLoading) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => setVisible(false)}
    >
      <Pressable style={prompt.overlay} onPress={() => setVisible(false)}>
        <Pressable
          style={[prompt.sheet, { paddingBottom: insets.bottom + 24 }]}
          onPress={() => {}}
        >
          {/* Handle */}
          <View style={prompt.handle} />

          <Image
            source={require('../../assets/logo.png')}
            style={prompt.logo}
            resizeMode="contain"
          />

          <Text style={prompt.title}>Bem-vindo ao Tá Barato!</Text>
          <Text style={prompt.sub}>
            Faça login para fazer pedidos, acompanhar entregas e muito mais.
          </Text>

          <TouchableOpacity
            style={prompt.btn}
            activeOpacity={0.88}
            onPress={() => {
              setVisible(false)
              router.push('/(auth)/login')
            }}
          >
            <Text style={prompt.btnText}>Entrar ou criar conta</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={prompt.skipBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={prompt.skipText}>Continuar sem login</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const tab = StyleSheet.create({
  iconWrap: {
    alignItems: 'center', justifyContent: 'center',
    width: 40, height: 28,
    position: 'relative', overflow: 'visible',
  },
})

const badge = StyleSheet.create({
  dot: {
    position: 'absolute', top: -3, right: -5,
    backgroundColor: colors.danger,
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#fff',
  },
  text: { color: '#fff', fontSize: 9, fontWeight: '800' },
})

const prompt = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 28, paddingTop: 16,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E0D8D0', marginBottom: 24,
  },
  logo: { width: 100, height: 100, marginBottom: 16 },
  title: {
    fontSize: 22, fontWeight: '900', color: '#1A0A00',
    letterSpacing: -0.4, textAlign: 'center', marginBottom: 8,
  },
  sub: {
    fontSize: 14, color: '#7A5C4A', textAlign: 'center',
    lineHeight: 20, marginBottom: 28, maxWidth: 280,
  },
  btn: {
    width: '100%', backgroundColor: colors.primary,
    borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    elevation: 6, marginBottom: 12,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  skipBtn: { paddingVertical: 10 },
  skipText: { color: '#9A8880', fontSize: 14, fontWeight: '600' },
})

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  return (
    <>
      <LoginPrompt />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: '#AAAAAA',
          tabBarStyle: {
            borderTopColor: '#F0F0F0', borderTopWidth: 1,
            // Soma a área segura inferior (barra de gestos) pra não cortar os rótulos.
            height: 62 + insets.bottom, paddingBottom: 8 + insets.bottom, paddingTop: 10,
            backgroundColor: '#fff',
            shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06, shadowRadius: 8, elevation: 12,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 1 },
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '800', fontSize: 17 },
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Início', headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="categorias"
          options={{
            title: 'Categorias', headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'grid' : 'grid-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="cart"
          options={{
            title: 'Carrinho',
            tabBarIcon: ({ focused }) => <CartTabIcon focused={focused} />,
            headerTitle: 'Meu Carrinho',
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Pedidos', headerTitle: 'Meus Pedidos',
            tabBarIcon: ({ focused }) => <OrdersTabIcon focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
            ),
            headerTitle: 'Meu Perfil',
          }}
        />
      </Tabs>
    </>
  )
}
