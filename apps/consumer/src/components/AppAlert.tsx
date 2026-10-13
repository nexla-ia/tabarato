import { useEffect, useRef } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Animated, Pressable, Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const { width: SW } = Dimensions.get('window')

export type AlertType = 'success' | 'warning' | 'error' | 'info'

export interface AppAlertProps {
  visible: boolean
  type?: AlertType
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  onClose: () => void
}

const TYPE_CONFIG = {
  success: {
    icon: 'checkmark-circle' as const,
    color: '#059669',
    bg: '#D1FAE5',
    ring: '#A7F3D0',
    btnColor: '#059669',
    dots: ['#34D399', '#6EE7B7', '#A7F3D0', '#059669', '#10B981'],
  },
  warning: {
    icon: 'alert-circle' as const,
    color: '#D97706',
    bg: '#FEF3C7',
    ring: '#FDE68A',
    btnColor: '#FF5500',
    dots: [],
  },
  error: {
    icon: 'close-circle' as const,
    color: '#DC2626',
    bg: '#FEE2E2',
    ring: '#FECACA',
    btnColor: '#DC2626',
    dots: [],
  },
  info: {
    icon: 'information-circle' as const,
    color: '#FF5500',
    bg: '#FFF0EB',
    ring: '#FFD9BF',
    btnColor: '#FF5500',
    dots: [],
  },
}

// Decorative dot positions for success state
const SUCCESS_DOTS = [
  { top: -8,  left: 24,  size: 7,  opacity: 0.7 },
  { top: 8,   left: -10, size: 5,  opacity: 0.5 },
  { top: -12, right: 16, size: 5,  opacity: 0.6 },
  { top: 20,  right: -8, size: 8,  opacity: 0.4 },
  { bottom: -6, left: 14, size: 6, opacity: 0.6 },
  { bottom: 10, right: 6, size: 4, opacity: 0.5 },
]

export function AppAlert({
  visible,
  type = 'info',
  title,
  message,
  confirmText = 'OK',
  cancelText,
  onConfirm,
  onClose,
}: AppAlertProps) {
  const cfg = TYPE_CONFIG[type]
  const scaleAnim = useRef(new Animated.Value(0.82)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 260,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.88, duration: 140, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  function handleConfirm() {
    onConfirm ? onConfirm() : onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.card, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
          // Prevent closing when tapping inside the card
        >
          <Pressable onPress={() => {}}>
            {/* Icon area */}
            <View style={styles.iconArea}>
              {/* Outer ring */}
              <View style={[styles.iconRing, { borderColor: cfg.ring }]} />
              {/* Icon circle */}
              <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
                <Ionicons name={cfg.icon} size={44} color={cfg.color} />
              </View>
              {/* Decorative dots for success */}
              {type === 'success' && SUCCESS_DOTS.map((d, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      width: d.size,
                      height: d.size,
                      borderRadius: d.size / 2,
                      backgroundColor: cfg.dots[i % cfg.dots.length],
                      opacity: d.opacity,
                      top: (d as any).top,
                      left: (d as any).left,
                      right: (d as any).right,
                      bottom: (d as any).bottom,
                    },
                  ]}
                />
              ))}
            </View>

            {/* Text */}
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            {/* Divider */}
            <View style={styles.divider} />

            {/* Buttons */}
            <View style={cancelText ? styles.btnRow : styles.btnSingle}>
              {cancelText && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  activeOpacity={0.75}
                >
                  <Text style={styles.cancelBtnText}>{cancelText}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  cancelText ? styles.confirmBtnHalf : styles.confirmBtnFull,
                  { backgroundColor: cfg.btnColor },
                ]}
                onPress={handleConfirm}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>{confirmText}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 10, 0, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 24,
    shadowColor: '#1A0A00',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 40,
    elevation: 24,
  },

  // Icon
  iconArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
    height: 88,
  },
  iconRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 8,
    opacity: 0.5,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
  },

  // Text
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1A0A00',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#9A8880',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },

  divider: {
    height: 1,
    backgroundColor: '#F0E8E2',
    marginVertical: 20,
  },

  // Buttons
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnSingle: {},
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#F5EEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9A8880',
  },
  confirmBtnFull: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnHalf: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
})
