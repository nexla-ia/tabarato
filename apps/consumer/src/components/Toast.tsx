import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type ToastType = 'success' | 'error' | 'info'
type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })
export const useToast = () => useContext(ToastContext)

const STYLE: Record<ToastType, { color: string; icon: IoniconName }> = {
  success: { color: '#16A34A', icon: 'checkmark-circle' },
  error:   { color: '#EF4444', icon: 'alert-circle' },
  info:    { color: '#FF5500', icon: 'information-circle' },
}

/** Toast animado no topo — substitui os Alert.alert "secos" de aviso/erro/sucesso.
 *  Some sozinho em ~3,6s; toque pra fechar antes. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const translateY = useRef(new Animated.Value(-140)).current
  const opacity = useRef(new Animated.Value(0)).current
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hide = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    Animated.parallel([
      Animated.timing(translateY, { toValue: -140, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(null))
  }, [translateY, opacity])

  const show = useCallback((message: string, type: ToastType = 'info') => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setToast({ message, type })
    translateY.setValue(-140)
    opacity.setValue(0)
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 70 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start()
    hideTimer.current = setTimeout(hide, 3600)
  }, [translateY, opacity, hide])

  const s = STYLE[toast?.type ?? 'info']

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { top: insets.top + 8, opacity, transform: [{ translateY }] }]}
        >
          <TouchableWithoutFeedback onPress={hide}>
            <View style={styles.card}>
              <View style={[styles.accent, { backgroundColor: s.color }]} />
              <Ionicons name={s.icon} size={22} color={s.color} style={{ marginRight: 10 }} />
              <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
            </View>
          </TouchableWithoutFeedback>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 9999, alignItems: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 14, paddingLeft: 18,
    width: '100%', maxWidth: 460,
    shadowColor: '#1A0A00', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16, shadowRadius: 16, elevation: 8,
    overflow: 'hidden',
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  text: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1A0A00', lineHeight: 19 },
})
