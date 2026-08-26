'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft, Tag, X, Store as StoreIcon } from 'lucide-react'
import { useCartStore, StoreCart, CartItem, AppliedCoupon } from '@/stores/cart'
import { promoLabel, promoDiscountFor } from '@/lib/promo'
import { api } from '@/lib/api'
import { Navbar } from '@/components/Navbar'
import styles from './page.module.css'

const DELIVERY_ESTIMATE = 10.00 // shown estimate only; real value calculated on checkout

function fmtBRL(v: number | string) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }

export default function CartPage() {
  const router = useRouter()
  const { stores, updateQty, removeItem, clearStore } = useCartStore()

  if (stores.length === 0) {
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

  const subtotal = stores.reduce((acc, s) => acc + s.items.reduce((a, i) => a + i.price * i.quantity, 0), 0)
  const discountTotal = stores.reduce((acc, s) => acc + (s.coupon?.discount ?? 0), 0)
  const promoTotal = Math.round(stores.reduce((acc, s) =>
    acc + s.items.reduce((a, i) => a + promoDiscountFor(i.quantity, i.price, i.promoBuyQty, i.promoPayQty), 0), 0) * 100) / 100
  const freeStores = stores.filter(s => s.coupon?.freeShipping).length
  const deliveryEstimate = (stores.length - freeStores) * DELIVERY_ESTIMATE
  const orderTotal = Math.max(0, subtotal - discountTotal - promoTotal) + deliveryEstimate

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '32px 20px 60px', maxWidth: 760 }}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={16} /> Continuar comprando
        </Link>

        <h1 className={styles.title}>Meu carrinho</h1>

        <div className={styles.layout}>
          {/* Items grouped by store */}
          <div className={styles.items}>
            {stores.map(storeCart => (
              <StoreGroupCard
                key={storeCart.storeId}
                storeCart={storeCart}
                onUpdateQty={(productId, variationId, qty) => updateQty(storeCart.storeId, productId, variationId, qty)}
                onRemoveItem={(productId, variationId) => removeItem(storeCart.storeId, productId, variationId)}
                onClearStore={() => clearStore(storeCart.storeId)}
              />
            ))}
          </div>

          {/* Summary */}
          <div className={styles.summary}>
            <h2 className={styles.summaryTitle}>Resumo</h2>
            <div className={styles.summaryRow}>
              <span>Subtotal</span>
              <span>{fmtBRL(subtotal)}</span>
            </div>
            {promoTotal > 0 && (
              <div className={`${styles.summaryRow} ${styles.summaryDiscount}`}>
                <span>Promoções</span>
                <span>-{fmtBRL(promoTotal)}</span>
              </div>
            )}
            {discountTotal > 0 && (
              <div className={`${styles.summaryRow} ${styles.summaryDiscount}`}>
                <span>Cupons</span>
                <span>-{fmtBRL(discountTotal)}</span>
              </div>
            )}
            <div className={styles.summaryRow}>
              <span>Entrega (estimativa{stores.length > 1 ? ` · ${stores.length} lojas` : ''})</span>
              <span>{deliveryEstimate === 0 ? <span className={styles.summaryDiscount}>Grátis</span> : fmtBRL(deliveryEstimate)}</span>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.summaryTotal}>
              <span>Total estimado</span>
              <span>{fmtBRL(orderTotal)}</span>
            </div>

            <button className={styles.checkoutBtn} onClick={() => router.push('/checkout')}>
              Finalizar pedido →
            </button>
            <p className={styles.summaryNote}>
              {stores.length > 1
                ? 'Cada loja vira um pedido separado, todos pagos de uma vez só. O valor final da entrega é calculado por loja com base no seu endereço.'
                : 'O valor final da entrega será calculado com base no seu endereço'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

function StoreGroupCard({ storeCart, onUpdateQty, onRemoveItem, onClearStore }: {
  storeCart: StoreCart
  onUpdateQty: (productId: string, variationId: string | undefined, qty: number) => void
  onRemoveItem: (productId: string, variationId?: string) => void
  onClearStore: () => void
}) {
  const setCoupon = useCartStore(s => s.setCoupon)
  const [couponInput, setCouponInput] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')

  const storeSubtotal = storeCart.items.reduce((a, i) => a + i.price * i.quantity, 0)
  const storePromo = Math.round(storeCart.items.reduce((a, i) => a + promoDiscountFor(i.quantity, i.price, i.promoBuyQty, i.promoPayQty), 0) * 100) / 100
  const coupon = storeCart.coupon

  // O cupom aplicado fica salvo no carrinho (localStorage) e só era revalidado na
  // criação do pedido. Se nesse meio-tempo ele fosse usado em outro pedido — ou o
  // subtotal caísse abaixo do mínimo ao mudar a quantidade — o checkout inteiro
  // falhava com um erro que não apontava pro cupom. Revalida aqui e derruba na
  // hora, dizendo o motivo.
  useEffect(() => {
    if (!coupon?.code) return
    let cancelled = false
    api.get('/coupons/validate', {
      params: { code: coupon.code, subtotal: storeSubtotal, storeId: storeCart.storeId },
    })
      .then(({ data }) => {
        if (cancelled) return
        // Desconto percentual muda junto com a quantidade — mantém o resumo honesto.
        if (data.discount !== coupon.discount || !!data.freeShipping !== coupon.freeShipping) {
          setCoupon(storeCart.storeId, { ...coupon, discount: data.discount, freeShipping: !!data.freeShipping })
        }
      })
      .catch((err) => {
        if (cancelled) return
        // 401 é sessão expirada, não cupom inválido — não descarta por isso.
        if (err.response?.status === 401) return
        setCoupon(storeCart.storeId, null)
        setCouponError(err.response?.data?.message ?? 'Este cupom não é mais válido')
      })
    return () => { cancelled = true }
    // Só reage a troca de cupom/subtotal: incluir `coupon` inteiro reexecutaria a
    // cada atualização de desconto que o próprio efeito faz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupon?.code, storeSubtotal, storeCart.storeId])

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (!code) return
    setCouponLoading(true)
    setCouponError('')
    try {
      const { data } = await api.get('/coupons/validate', { params: { code, subtotal: storeSubtotal, storeId: storeCart.storeId } })
      const applied: AppliedCoupon = {
        code: data.code,
        description: data.description,
        discountPercent: data.discountPercent,
        discountFixed: data.discountFixed,
        discount: data.discount,
        freeShipping: !!data.freeShipping,
      }
      setCoupon(storeCart.storeId, applied)
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
    setCoupon(storeCart.storeId, null)
    setCouponError('')
  }

  return (
    <div className={styles.storeGroup}>
      <div className={styles.storeGroupHead}>
        <Link href={`/store/${storeCart.storeId}`} className={styles.storeGroupName}>
          <StoreIcon size={15} /> {storeCart.storeName}
        </Link>
        <button className={styles.clearBtn} onClick={onClearStore}>Remover loja</button>
      </div>

      {storeCart.items.map((item: CartItem) => (
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
            {promoLabel(item.promoBuyQty, item.promoPayQty) && (
              <span style={{
                alignSelf: 'flex-start', marginTop: 3, background: '#DCFCE7', color: '#15803D',
                fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 7,
              }}>
                🏷️ {promoLabel(item.promoBuyQty, item.promoPayQty)}
                {promoDiscountFor(item.quantity, item.price, item.promoBuyQty, item.promoPayQty) > 0
                  ? ` · -${fmtBRL(promoDiscountFor(item.quantity, item.price, item.promoBuyQty, item.promoPayQty))}`
                  : ''}
              </span>
            )}
          </div>
          <div className={styles.itemActions}>
            <div className={styles.qty}>
              <button onClick={() => onUpdateQty(item.productId, item.variationId, item.quantity - 1)}>
                <Minus size={13} />
              </button>
              <span>{item.quantity}</span>
              <button onClick={() => onUpdateQty(item.productId, item.variationId, item.quantity + 1)}>
                <Plus size={13} />
              </button>
            </div>
            <span className={styles.itemTotal}>{fmtBRL(item.price * item.quantity)}</span>
            <button className={styles.removeBtn} onClick={() => onRemoveItem(item.productId, item.variationId)}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}

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
              placeholder="Cupom desta loja"
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

      {storePromo > 0 && (
        <div className={styles.storeGroupTotal} style={{ color: '#15803D', fontWeight: 700 }}>
          <span>🏷️ Promoções</span>
          <span>-{fmtBRL(storePromo)}</span>
        </div>
      )}
      <div className={styles.storeGroupTotal}>
        <span>Subtotal · {storeCart.storeName}</span>
        <span>{fmtBRL(Math.max(0, storeSubtotal - storePromo))}</span>
      </div>
    </div>
  )
}
