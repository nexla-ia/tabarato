'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft, Tag, X } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { api } from '@/lib/api'
import { Navbar } from '@/components/Navbar'
import styles from './page.module.css'

function fmtBRL(v: number | string) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }

export default function CartPage() {
  const router = useRouter()
  const { items, storeId, storeName, total, updateQty, removeItem, clear, coupon, setCoupon } = useCartStore()
  const DELIVERY_ESTIMATE = 10.00 // shown estimate only; real value calculated on checkout

  const [couponInput, setCouponInput] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')

  if (items.length === 0) {
    return (
      <>
        <Navbar />
        <div className={styles.empty}>
          <ShoppingBag size={56} color="var(--muted)" />
          <h2 className={styles.emptyTitle}>Carrinho vazio</h2>
          <p className={styles.emptySub}>Adicione produtos de uma loja para continuar</p>
          <Link href="/" className={styles.backBtn}>Ver lojas</Link>
        </div>
      </>
    )
  }

  const subtotal = total()
  const deliveryEstimate = coupon?.freeShipping ? 0 : DELIVERY_ESTIMATE
  const orderTotal = Math.max(0, subtotal - (coupon?.discount ?? 0)) + deliveryEstimate

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (!code || !storeId) return
    setCouponLoading(true)
    setCouponError('')
    try {
      const { data } = await api.get('/coupons/validate', { params: { code, subtotal, storeId } })
      setCoupon({
        code: data.code,
        description: data.description,
        discountPercent: data.discountPercent,
        discountFixed: data.discountFixed,
        discount: data.discount,
        freeShipping: !!data.freeShipping,
      })
      setCouponInput('')
    } catch (err: any) {
      setCouponError(
        err.response?.status === 401
          ? 'Faça login para usar um cupom'
          : (err.response?.data?.message ?? 'Cupom inválido'),
      )
    } finally {
      setCouponLoading(false)
    }
  }

  function removeCoupon() {
    setCoupon(null)
    setCouponError('')
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '32px 20px 60px', maxWidth: 720 }}>
        {/* Back */}
        {storeId && (
          <Link href={`/store/${storeId}`} className={styles.backLink}>
            <ArrowLeft size={16} /> Voltar para {storeName}
          </Link>
        )}

        <h1 className={styles.title}>Meu carrinho</h1>

        <div className={styles.layout}>
          {/* Items */}
          <div className={styles.items}>
            {items.map(item => (
              <div key={`${item.productId}-${item.variationId}`} className={styles.item}>
                <div className={styles.itemImg}>
                  {item.imageUrl
                    ? <Image src={item.imageUrl} alt={item.name} fill style={{ objectFit: 'cover' }} />
                    : <span style={{ fontSize: 28 }}>📦</span>
                  }
                </div>
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{item.name}</span>
                  {item.variationName && <span className={styles.itemVar}>{item.variationName}</span>}
                  <span className={styles.itemPrice}>{fmtBRL(item.price)}</span>
                </div>
                <div className={styles.itemActions}>
                  <div className={styles.qty}>
                    <button onClick={() => updateQty(item.productId, item.variationId, item.quantity - 1)}>
                      <Minus size={13} />
                    </button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQty(item.productId, item.variationId, item.quantity + 1)}>
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className={styles.itemTotal}>{fmtBRL(item.price * item.quantity)}</span>
                  <button className={styles.removeBtn} onClick={() => removeItem(item.productId, item.variationId)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}

            <button className={styles.clearBtn} onClick={clear}>Limpar carrinho</button>
          </div>

          {/* Summary */}
          <div className={styles.summary}>
            <h2 className={styles.summaryTitle}>Resumo</h2>
            <div className={styles.summaryRow}>
              <span>Subtotal</span>
              <span>{fmtBRL(subtotal)}</span>
            </div>
            {coupon && (
              <div className={`${styles.summaryRow} ${styles.summaryDiscount}`}>
                <span>Cupom {coupon.code}</span>
                <span>-{fmtBRL(coupon.discount)}</span>
              </div>
            )}
            <div className={styles.summaryRow}>
              <span>Entrega (estimativa)</span>
              <span>{coupon?.freeShipping ? <span className={styles.summaryDiscount}>Grátis</span> : fmtBRL(DELIVERY_ESTIMATE)}</span>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.summaryTotal}>
              <span>Total estimado</span>
              <span>{fmtBRL(orderTotal)}</span>
            </div>

            <div className={styles.couponBox}>
              {coupon ? (
                <div className={styles.couponApplied}>
                  <div className={styles.couponAppliedInfo}>
                    <Tag size={14} />
                    <div>
                      <span className={styles.couponCode}>{coupon.code}</span>
                      {coupon.description && <span className={styles.couponDesc}>{coupon.description}</span>}
                    </div>
                  </div>
                  <button className={styles.couponRemove} onClick={removeCoupon} title="Remover cupom">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className={styles.couponForm}>
                  <input
                    className={styles.couponInput}
                    placeholder="Cupom de desconto"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyCoupon() }}
                    maxLength={30}
                  />
                  <button
                    className={styles.couponApply}
                    onClick={applyCoupon}
                    disabled={!couponInput.trim() || couponLoading}
                  >
                    {couponLoading ? '...' : 'Aplicar'}
                  </button>
                </div>
              )}
              {couponError && <p className={styles.couponError}>{couponError}</p>}
            </div>

            <button className={styles.checkoutBtn} onClick={() => router.push('/checkout')}>
              Finalizar pedido →
            </button>
            <p className={styles.summaryNote}>O valor final da entrega será calculado com base no seu endereço</p>
          </div>
        </div>
      </div>
    </>
  )
}
