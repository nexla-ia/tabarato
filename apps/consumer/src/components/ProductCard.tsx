import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { Product } from '../types'
import { promoLabel } from '../utils/promo'
import { colors } from '../theme/colors'

interface Props {
  product: Product
  onAdd: (product: Product) => void
  onPress?: () => void
}

// estoque null/undefined = ilimitado; <= 0 = esgotado
function isOut(stock?: number | null) { return stock != null && stock <= 0 }

export function ProductCard({ product, onAdd, onPress }: Props) {
  const hasVars = product.hasVariations && product.variations?.length > 0
  const outOfStock = hasVars
    ? product.variations.every((v) => isOut(v.stock))
    : isOut(product.stock)

  const price = hasVars
    ? `A partir de R$ ${Math.min(...product.variations.map((v) => Number(v.price))).toFixed(2)}`
    : `R$ ${Number(product.basePrice ?? 0).toFixed(2)}`

  const promo = promoLabel(product.promoBuyQty, product.promoPayQty)

  const content = (
    <View style={styles.inner}>
      <View>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={[styles.image, outOfStock && styles.imageOut]} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>🛍</Text>
          </View>
        )}
        {outOfStock && (
          <View style={styles.outBadge}>
            <Text style={styles.outBadgeText}>Esgotado</Text>
          </View>
        )}
        {!outOfStock && promo && (
          <View style={styles.promoBadge}>
            <Text style={styles.promoBadgeText}>{promo}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, outOfStock && styles.textMuted]} numberOfLines={2}>{product.name}</Text>
        {product.description ? (
          <Text style={styles.description} numberOfLines={2}>{product.description}</Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={[styles.price, outOfStock && styles.textMuted]}>{price}</Text>
          {outOfStock ? (
            <Text style={styles.outLabel}>Indisponível</Text>
          ) : (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={onPress ?? (() => onAdd(product))}
              activeOpacity={0.8}
            >
              <Text style={styles.addBtnText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )

  // Produto esgotado abre o detalhe (pode ter variação disponível), mas não some
  if (onPress) {
    return (
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
        {content}
      </TouchableOpacity>
    )
  }

  return <View style={styles.card}>{content}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  inner: { flexDirection: 'row' },
  image: { width: 90, height: 90 },
  imageOut: { opacity: 0.5 },
  outBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: 'rgba(26,10,0,0.82)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  outBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  promoBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  promoBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.2 },
  textMuted: { color: colors.textMuted },
  outLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    backgroundColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: 'hidden',
  },
  imagePlaceholder: {
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: { fontSize: 28 },
  info: { flex: 1, padding: 10, justifyContent: 'space-between' },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  description: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  price: { fontSize: 14, fontWeight: '700', color: colors.primary },
  addBtn: {
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.white, fontSize: 20, lineHeight: 24 },
})
