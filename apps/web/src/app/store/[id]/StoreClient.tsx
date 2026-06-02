'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ShoppingCart, Plus, Minus, Clock, MapPin, ChevronRight } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { useAuth } from '@/hooks/useAuth'
import styles from './StoreClient.module.css'

interface Product {
  id: string; name: string; description?: string
  imageUrl?: string; basePrice?: number; isActive: boolean
  hasVariations: boolean
  variations?: { id: string; name: string; price: number; stock: number }[]
}

interface Store {
  id: string; name: string; description?: string; logoUrl?: string
  deliveryRadiusKm: number; prepTimeMin: number; isOpen: boolean
}

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

export function StoreClient({ store, products }: { store: Store; products: Product[] }) {
  const { items, addItem, total, storeId } = useCartStore()
  const { user } = useAuth()
  const [confirmClear, setConfirmClear] = useState<(() => void) | null>(null)
  const cartCount = items.reduce((a, i) => a + i.quantity, 0)

  function handleAdd(product: Product, variation?: { id: string; name: string; price: number }) {
    const price = variation?.price ?? product.basePrice ?? 0
    const cartItem = {
      productId: product.id, variationId: variation?.id, name: product.name,
      price, quantity: 1, imageUrl: product.imageUrl ?? undefined, variationName: variation?.name,
    }

    if (storeId && storeId !== store.id) {
      setConfirmClear(() => () => {
        useCartStore.getState().clear()
        addItem(store.id, store.name, cartItem, user?.id)
        setConfirmClear(null)
      })
      return
    }

    addItem(store.id, store.name, cartItem, user?.id)
  }

  return (
    <>
      {/* Store header */}
      <div className={styles.header}>
        <div className="container">
          <div className={styles.headerInner}>
            <div className={styles.logoWrap}>
              {store.logoUrl
                ? <Image src={store.logoUrl} alt={store.name} width={80} height={80} style={{ borderRadius: 16, objectFit: 'cover' }} />
                : <div className={styles.logoFallback}>🏪</div>
              }
            </div>
            <div className={styles.headerInfo}>
              <h1 className={styles.storeName}>{store.name}</h1>
              {store.description && <p className={styles.storeDesc}>{store.description}</p>}
              <div className={styles.storeMeta}>
                <span className={`${styles.statusChip} ${store.isOpen ? styles.open : styles.closed}`}>
                  {store.isOpen ? '● Aberto' : '● Fechado'}
                </span>
                <span className={styles.metaItem}><Clock size={13} /> {store.prepTimeMin} min</span>
                <span className={styles.metaItem}><MapPin size={13} /> até {store.deliveryRadiusKm} km</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="container" style={{ padding: '32px 20px 120px' }}>
        {products.length === 0 ? (
          <div className={styles.empty}>Nenhum produto disponível no momento.</div>
        ) : (
          <div className={styles.grid}>
            {products.map(p => (
              <ProductCard key={p.id} product={p} onAdd={handleAdd} />
            ))}
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && storeId === store.id && (
        <div className={styles.cartBar}>
          <div className={styles.cartBarLeft}>
            <ShoppingCart size={18} />
            <span>{cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
          </div>
          <div className={styles.cartBarCenter}>{fmtBRL(total())}</div>
          <Link href="/cart" className={styles.cartBarBtn}>
            Ver carrinho <ChevronRight size={16} />
          </Link>
        </div>
      )}

      {/* Confirm clear cart modal */}
      {confirmClear && (
        <div className={styles.overlay} onClick={() => setConfirmClear(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Esvaziar carrinho?</h3>
            <p className={styles.modalText}>Você já tem itens de outra loja. Deseja limpar o carrinho e adicionar este item?</p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setConfirmClear(null)}>Cancelar</button>
              <button className={styles.modalConfirm} onClick={confirmClear}>Sim, limpar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ProductCard({ product, onAdd }: {
  product: Product
  onAdd: (p: Product, v?: { id: string; name: string; price: number }) => void
}) {
  const [selectedVar, setSelectedVar] = useState(product.variations?.[0])
  const price = selectedVar?.price ?? product.basePrice ?? 0
  const items = useCartStore(s => s.items)
  const qty = items.filter(
    i => i.productId === product.id && i.variationId === selectedVar?.id
  ).reduce((a, i) => a + i.quantity, 0)

  return (
    <div className={styles.productCard}>
      <div className={styles.productImg}>
        {product.imageUrl
          ? <Image src={product.imageUrl} alt={product.name} fill style={{ objectFit: 'cover' }} />
          : <div className={styles.productImgFallback}>📦</div>
        }
      </div>
      <div className={styles.productInfo}>
        <h3 className={styles.productName}>{product.name}</h3>
        {product.description && <p className={styles.productDesc}>{product.description}</p>}

        {product.hasVariations && product.variations && product.variations.length > 0 && (
          <div className={styles.varRow}>
            {product.variations.map(v => (
              <button
                key={v.id}
                className={`${styles.varChip} ${selectedVar?.id === v.id ? styles.varChipActive : ''}`}
                onClick={() => setSelectedVar(v)}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

        <div className={styles.productBottom}>
          <span className={styles.productPrice}>{fmtBRL(price)}</span>
          {qty > 0 ? (
            <div className={styles.qtyControl}>
              <button className={styles.qtyBtn} onClick={() => useCartStore.getState().updateQty(product.id, selectedVar?.id, qty - 1)}>
                <Minus size={14} />
              </button>
              <span className={styles.qtyNum}>{qty}</span>
              <button className={styles.qtyBtn} onClick={() => onAdd(product, selectedVar)}>
                <Plus size={14} />
              </button>
            </div>
          ) : (
            <button className={styles.addBtn} onClick={() => onAdd(product, selectedVar)}>
              <Plus size={15} /> Adicionar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
