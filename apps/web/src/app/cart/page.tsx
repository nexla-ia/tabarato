'use client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { Navbar } from '@/components/Navbar'
import styles from './page.module.css'

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

export default function CartPage() {
  const router = useRouter()
  const { items, storeId, storeName, total, updateQty, removeItem, clear } = useCartStore()
  const DELIVERY_ESTIMATE = 10.00 // shown estimate only; real value calculated on checkout

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
  const orderTotal = subtotal + DELIVERY_ESTIMATE

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
            <div className={styles.summaryRow}>
              <span>Entrega (estimativa)</span>
              <span>{fmtBRL(DELIVERY_ESTIMATE)}</span>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.summaryTotal}>
              <span>Total estimado</span>
              <span>{fmtBRL(orderTotal)}</span>
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
