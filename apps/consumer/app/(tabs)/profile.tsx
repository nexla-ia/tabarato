import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, Linking } from 'react-native'
import { useEffect, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '../../src/stores/auth.store'
import { api } from '../../src/api/client'
import { colors } from '../../src/theme/colors'
import { useTheme } from '../../src/theme/theme'
import { useToast } from '../../src/components/Toast'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const SUPPORT_WHATSAPP = 'https://wa.me/5569999999999' // TODO: número oficial de suporte

interface MenuItem {
  icon: IoniconName
  label: string
  desc?: string
  onPress: () => void
  danger?: boolean
}

function GuestScreen() {
  return (
    <View style={guestStyles.container}>
      <View style={guestStyles.header}>
        <View style={guestStyles.headerDecor1} />
        <View style={guestStyles.headerDecor2} />
        <View style={guestStyles.iconWrap}>
          <Ionicons name="person-outline" size={44} color="#fff" />
        </View>
        <Text style={guestStyles.title}>Minha conta</Text>
        <Text style={guestStyles.subtitle}>Entre para acompanhar seus pedidos, salvar endereços e muito mais.</Text>
      </View>

      <View style={guestStyles.body}>
        <TouchableOpacity style={guestStyles.loginBtn} onPress={() => router.push('/(auth)/login')} activeOpacity={0.85}>
          <Ionicons name="log-in-outline" size={20} color="#fff" />
          <Text style={guestStyles.loginBtnText}>Entrar na conta</Text>
        </TouchableOpacity>

        <TouchableOpacity style={guestStyles.registerBtn} onPress={() => router.push('/(auth)/register')} activeOpacity={0.85}>
          <Text style={guestStyles.registerBtnText}>Criar conta grátis</Text>
        </TouchableOpacity>

        <View style={guestStyles.benefits}>
          {[
            { icon: 'receipt-outline' as IoniconName, text: 'Acompanhe seus pedidos em tempo real' },
            { icon: 'location-outline' as IoniconName, text: 'Salve seus endereços de entrega' },
            { icon: 'star-outline' as IoniconName, text: 'Avalie os produtos que você comprou' },
          ].map((b) => (
            <View key={b.text} style={guestStyles.benefitRow}>
              <View style={guestStyles.benefitIcon}>
                <Ionicons name={b.icon} size={18} color={colors.primary} />
              </View>
              <Text style={guestStyles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

const guestStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 36,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  headerDecor1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -60, right: -40,
  },
  headerDecor2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: 0, left: -20,
  },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 19 },

  body: { padding: 24, gap: 12 },
  loginBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  registerBtn: {
    borderWidth: 2, borderColor: colors.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  registerBtnText: { color: colors.primary, fontSize: 16, fontWeight: '700' },

  benefits: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 8,
    gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
})

export default function ProfileScreen() {
  const { show: toast } = useToast()
  const { user, clearAuth } = useAuthStore()
  const { colors: tc } = useTheme()
  const [orderCount, setOrderCount] = useState(0)
  const [deliveredCount, setDeliveredCount] = useState(0)
  const [reviewCount, setReviewCount] = useState(0)

  useEffect(() => {
    if (!user) return
    api.get('/orders').then(r => {
      const orders = r.data ?? []
      setOrderCount(orders.length)
      setDeliveredCount(orders.filter((o: any) => o.status === 'DELIVERED').length)
      setReviewCount(orders.filter((o: any) => o.review != null).length)
    }).catch(() => {})
  }, [user?.id])

  if (!user) return <GuestScreen />

  function handleLogout() {
    Alert.alert('Sair da conta', 'Tem certeza que quer sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await clearAuth()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const initial = user?.name?.[0]?.toUpperCase() ?? '?'
  const nameParts = user?.name?.split(' ') ?? []
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts.slice(1).join(' ')

  const menuSections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Conta',
      items: [
        { icon: 'create-outline', label: 'Editar perfil', desc: 'Nome, telefone, cidade', onPress: () => router.push('/edit-profile' as any) },
        { icon: 'heart-outline', label: 'Favoritos', desc: 'Lojas que você salvou', onPress: () => router.push('/favorites' as any) },
        { icon: 'star-outline', label: 'Meus Pontos', desc: 'Programa de fidelidade', onPress: () => router.push('/loyalty' as any) },
        { icon: 'gift-outline', label: 'Indique e Ganhe', desc: 'Compartilhe e ganhe pontos', onPress: () => router.push('/referral' as any) },
        { icon: 'receipt-outline', label: 'Meus pedidos', desc: 'Histórico de compras', onPress: () => router.push('/(tabs)/orders') },
        { icon: 'location-outline', label: 'Meus endereços', desc: 'Gerencie seus endereços de entrega', onPress: () => router.push('/addresses' as any) },
        { icon: 'notifications-outline', label: 'Notificações', desc: 'Preferências de avisos', onPress: () => router.push('/notifications' as any) },
        { icon: 'shield-checkmark-outline', label: 'Segurança', desc: 'Alterar sua senha', onPress: () => router.push('/change-password' as any) },
      ],
    },
    {
      title: 'Para empresas',
      items: [
        { icon: 'megaphone-outline', label: 'Anunciar na vitrine', desc: 'Sua empresa no topo da tela inicial', onPress: () => router.push('/anunciar' as any) },
        { icon: 'albums-outline', label: 'Meus anúncios', desc: 'Aprovação, pagamento e resultados', onPress: () => router.push('/meus-anuncios' as any) },
      ],
    },
    {
      title: 'Suporte',
      items: [
        { icon: 'logo-whatsapp', label: 'Falar com o suporte', desc: 'Tire suas dúvidas no WhatsApp', onPress: () => Linking.openURL(SUPPORT_WHATSAPP).catch(() => toast('Não foi possível abrir o WhatsApp.', 'error')) },
      ],
    },
    {
      title: '',
      items: [
        { icon: 'log-out-outline', label: 'Sair da conta', onPress: handleLogout, danger: true },
      ],
    },
  ]

  return (
    <ScrollView style={[styles.container, { backgroundColor: tc.bg2 }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerDecor1} />
        <View style={styles.headerDecor2} />

        <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.8} onPress={() => router.push('/edit-profile' as any)}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            <Ionicons name="pencil" size={10} color="#fff" />
          </View>
        </TouchableOpacity>

        <Text style={styles.userName}>
          {firstName}{lastName ? <Text style={styles.userNameLight}> {lastName}</Text> : null}
        </Text>
        <Text style={styles.userEmail}>{user?.email}</Text>

        {(user?.city || user?.state) && (
          <View style={styles.locationChip}>
            <Ionicons name="location-sharp" size={11} color="rgba(255,255,255,0.85)" />
            <Text style={styles.locationText}>{user?.city}{user?.state ? `, ${user.state}` : ''}</Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{orderCount}</Text>
            <Text style={styles.statLabel}>Pedidos</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{deliveredCount}</Text>
            <Text style={styles.statLabel}>Entregues</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{reviewCount}</Text>
            <Text style={styles.statLabel}>Avaliações</Text>
          </View>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menuWrap}>
        {menuSections.map((section, si) => (
          <View key={si} style={styles.menuSection}>
            {section.title ? (
              <Text style={styles.menuSectionTitle}>{section.title}</Text>
            ) : null}
            <View style={[styles.menuCard, { backgroundColor: tc.card, borderColor: tc.border }]}>
              {section.items.map((item, ii) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, ii < section.items.length - 1 && styles.menuItemBorder]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconWrap, item.danger && styles.menuIconDanger]}>
                    <Ionicons
                      name={item.icon}
                      size={19}
                      color={item.danger ? colors.danger : colors.primary}
                    />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={[styles.menuLabel, item.danger && styles.danger]}>{item.label}</Text>
                    {item.desc ? <Text style={styles.menuDesc}>{item.desc}</Text> : null}
                  </View>
                  {!item.danger && (
                    <Ionicons name="chevron-forward" size={16} color="#C8B8B0" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.version}>Tá Barato · v1.0.0</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { paddingBottom: 40 },

  header: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  headerDecor1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -60,
    right: -40,
  },
  headerDecor2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: 0,
    left: -20,
  },

  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 34, fontWeight: '900', color: '#fff' },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  userName: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  userNameLight: { fontWeight: '400' },
  userEmail: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3, marginBottom: 10 },

  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 18,
  },
  locationText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 2 },

  menuWrap: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  menuSection: { gap: 6 },
  menuSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F5EEE9' },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconDanger: { backgroundColor: '#FFF0F0' },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 15, color: colors.text, fontWeight: '600' },
  menuDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  danger: { color: colors.danger },

  version: {
    textAlign: 'center',
    color: '#C8B8B0',
    fontSize: 12,
    marginTop: 24,
  },
})
