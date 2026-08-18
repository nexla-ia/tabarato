'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Clock, MapPin, Minus, Plus, ShoppingCart, Package } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { useAuth } from '@/hooks/useAuth'
import styles from './ProductClient.module.css'

interface Variation { id: string; name: string; price: number | string; stock?: number | null }
interface Category { id: string; name: string }
interface Product {
  id: string; name: string; description?: string | null
  imageUrl?: string | null; basePrice?: number | string | null
  stock?: number | null; hasVariations?: boolean
  variations?: Variation[]; category?: Category | null
}
interface Store {
  id: string; name: string; logoUrl?: string | null; isOpen: boolean
  deliveryRadiusKm: number; prepTimeMin: number
}

function fmtBRL(v: number | string | null | undefined) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }
// estoque null = ilimitado; <= 0 = esgotado
function isOut(stock?: number | null) { return stock != null && stock <= 0 }

export function ProductClient({ product, store }: { product: Product; store: Store }) {
  const { addItem, storeId } = useCartStore()
  const { user } = useAuth()
  const [selectedVar, setSelectedVar] = useState(
    product.variations?.find(v => !isOut(v.stock)) ?? product.variations?.[0],
  )
  const [qty, setQty] = useState(1)
  const [confirmClear, setConfirmClear] = useState(false)
  const [added, setAdded] = useState(false)

  const hasVars = !!(product.variations && product.variations.length > 0)
  const allVarsOut = hasVars && product.variations!.every(v => isOut(v.stock))
  const productOut = !hasVars && isOut(product.stock)
  const outOfStock = productOut || allVarsOut
  const selectionOut = outOfStock || (selectedVar ? isOut(selectedVar.stock) : isOut(product.stock))
  const price = Number(selectedVar?.price ?? product.basePrice ?? 0)

  function doAdd() {
    addItem(store.id, store.name, {
      productId: product.id, variationId: selectedVar?.id, name: product.name,
      price, quantity: qty, imageUrl: product.imageUrl ?? undefined, variationName: selectedVar?.name,
    }, user?.id)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  function handleAdd() {
    if (storeId && storeId !== store.id) { setConfirmClear(true); return }
    doAdd()
  }

  return (
    <div className="container" style={{ padding: '24px 20px 80px', maxWidth: 1000 }}>
      <Link href={`/store/${store.id}`} className={styles.backLink}>
        <ArrowLeft size={15} /> Voltar para {store.name}
      </Link>

      <div className={styles.layout}>
        <div className={styles.imageBox}>
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.name} fill sizes="(max-width: 720px) 100vw, 420px" style={{ objectFit: 'cover' }} />
          ) : (
            <div className={styles.imageFallback}><Package size={48} strokeWidth={1.2} /></div>
          )}
          {outOfStock && <span className={styles.outRibbon}>Esgotado</span>}
        </div>

        <div className={styles.info}>
          {product.category && <span className={styles.breadcrumb}>{store.name} · {product.category.name}</span>}
          <h1 className={styles.name}>{product.name}</h1>
          <div className={styles.price}>{fmtBRL(price)}</div>

          {hasVars && (
            <div className={styles.varSection}>
              <span className={styles.varLabel}>Opções</span>
              <div className={styles.varRow}>
                {product.variations!.map(v => {
                  const vOut = isOut(v.stock)
                  return (
                    <button
                      key={v.id}
                      className={`${styles.varChip} ${selectedVar?.id === v.id ? styles.varChipActive : ''} ${vOut ? styles.varChipOut : ''}`}
                      onClick={() => setSelectedVar(v)}
                      disabled={vOut}
                      title={vOut ? 'Sem estoque' : undefined}
                    >
                      {v.name}{vOut ? ' · esgotado' : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {product.description && (
            <div className={styles.descSection}>
              <span className={styles.varLabel}>Descrição</span>
              <p className={styles.desc}>{product.description}</p>
            </div>
          )}

          {selectionOut ? (
            <div className={styles.outBox}>Produto indisponível no momento.</div>
          ) : (
            <div className={styles.buyBox}>
              <div className={styles.qtyControl}>
                <button className={styles.qtyBtn} onClick={() => setQty(q => Math.max(1, q - 1))} title="Diminuir">
                  <Minus size={14} />
                </button>
                <span className={styles.qtyNum}>{qty}</span>
                <button className={styles.qtyBtn} onClick={() => setQty(q => q + 1)} title="Aumentar">
                  <Plus size={14} />
                </button>
              </div>
              <button className={styles.addBtn} onClick={handleAdd}>
                <ShoppingCart size={16} /> {added ? 'Adicionado ✓' : 'Adicionar ao carrinho'}
              </button>
            </div>
          )}

          <div className={styles.storeCard}>
            <div className={styles.storeCardHead}>
              {store.logoUrl
                ? <Image src={store.logoUrl} alt={store.name} width={40} height={40} style={{ borderRadius: 10, objectFit: 'cover' }} />
                : <div className={styles.storeLogoFallback}>🏪</div>
              }
              <div>
                <div className={styles.storeName}>{store.name}</div>
                <span className={`${styles.statusChip} ${store.isOpen ? styles.open : styles.closed}`}>
                  {store.isOpen ? '● Aberto' : '● Fechado'}
                </span>
              </div>
            </div>
            <div className={styles.storeMeta}>
              <span className={styles.metaItem}><Clock size={13} /> ~{store.prepTimeMin} min</span>
              <span className={styles.metaItem}><MapPin size={13} /> até {store.deliveryRadiusKm} km</span>
            </div>
          </div>
        </div>
      </div>

      {confirmClear && (
        <div className={styles.overlay} onClick={() => setConfirmClear(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Esvaziar carrinho?</h3>
            <p className={styles.modalText}>Você já tem itens de outra loja. Deseja limpar o carrinho e adicionar este item?</p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setConfirmClear(false)}>Cancelar</button>
              <button
                className={styles.modalConfirm}
                onClick={() => { useCartStore.getState().clear(); doAdd(); setConfirmClear(false) }}
              >
                Sim, limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
