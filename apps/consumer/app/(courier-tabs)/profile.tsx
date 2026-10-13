import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../../src/stores/auth.store'
import { colors } from '../../src/theme/colors'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const SUPPORT_WHATSAPP = 'https://wa.me/5569999999999' // TODO: número oficial de suporte

interface MenuItem {
  icon: IoniconName
  label: string
  desc?: string
  onPress: () => void
  danger?: boolean
}

export default function CourierProfileScreen() {
  const { user, clearAuth } = useAuthStore()
  const insets = useSafeAreaInsets()

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

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Perfil',
      items: [
        {
          icon: 'create-outline',
          label: 'Editar perfil',
          desc: 'Nome, telefone e informações pessoais',
          onPress: () => router.push('/edit-profile' as any),
        },
        {
          icon: 'notifications-outline',
          label: 'Notificações',
          desc: 'Alertas de novas entregas e avisos',
          onPress: () => router.push('/notifications' as any),
        },
      ],
    },
    {
      title: 'Modo de uso',
      items: [
        {
          icon: 'storefront-outline',
          label: 'Ir para modo cliente',
          desc: 'Explorar lojas e fazer pedidos',
          onPress: () => router.replace('/(tabs)' as any),
        },
      ],
    },
    {
      title: 'Suporte',
      items: [
        {
          icon: 'help-circle-outline',
          label: 'Central de ajuda',
          desc: 'Dúvidas sobre entregas e pagamentos',
          onPress: () => Linking.openURL(SUPPORT_WHATSAPP).catch(() => {}),
        },
        {
          icon: 'document-text-outline',
          label: 'Meus documentos',
          desc: 'Status dos documentos enviados',
          onPress: () => router.push('/courier-documents' as any),
        },
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
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.decor1} />
        <View style={styles.decor2} />

        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.avatarBadge}>
            <Ionicons name="bicycle" size={10} color="#fff" />
          </View>
        </View>

        <Text style={styles.name}>
          {firstName}
          {lastName ? <Text style={styles.nameLight}> {lastName}</Text> : null}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>

        <View style={styles.roleChip}>
          <Ionicons name="bicycle-outline" size={12} color="rgba(255,255,255,0.9)" />
          <Text style={styles.roleText}>Entregador</Text>
        </View>
      </View>

      {/* Menu sections */}
      <View style={styles.menuWrap}>
        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            {section.title ? (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            ) : null}
            <View style={styles.card}>
              {section.items.map((item, ii) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.item, ii < section.items.length - 1 && styles.itemBorder]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconWrap, item.danger && styles.iconDanger]}>
                    <Ionicons
                      name={item.icon}
                      size={19}
                      color={item.danger ? colors.danger : colors.primary}
                    />
                  </View>
                  <View style={styles.itemText}>
                    <Text style={[styles.itemLabel, item.danger && styles.dangerText]}>
                      {item.label}
                    </Text>
                    {item.desc ? <Text style={styles.itemDesc}>{item.desc}</Text> : null}
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

      <Text style={styles.version}>Tá Barato · Entregador · v1.0.0</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFBF7' },
  content: {},

  header: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  decor1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -50, right: -30,
  },
  decor2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: -10, left: -20,
  },

  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 34, fontWeight: '900', color: '#fff' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#1A0A00',
    borderWidth: 2, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  name: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  nameLight: { fontWeight: '400' },
  email: { fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 3, marginBottom: 12 },

  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  roleText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '700' },

  menuWrap: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  section: { gap: 6 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#BBA898',
    textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#F0E8E0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: '#F5EEE9' },
  iconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  iconDanger: { backgroundColor: '#FFF0F0' },
  itemText: { flex: 1 },
  itemLabel: { fontSize: 15, color: '#1A0A00', fontWeight: '600' },
  itemDesc: { fontSize: 12, color: '#7A5C4A', marginTop: 1 },
  dangerText: { color: colors.danger },

  version: { textAlign: 'center', color: '#C8B8B0', fontSize: 12, marginTop: 24 },
})
