'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Clock, MapPin, Minus, Plus, ShoppingCart, Package, Star } from 'lucide-react'
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
interface Review {
  id: string; rating: number; comment?: string | null
  createdAt: string; user?: { name?: string } | null
}
interface RelatedProduct {
  id: string; name: string; imageUrl?: string | null
  basePrice?: number | string | null; stock?: number | null
}

function fmtBRL(v: number | string | null | undefined) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }
// estoque null = ilimitado; <= 0 = esgotado
function isOut(stock?: number | null) { return stock != null && stock <= 0 }
function initials(name?: string) { return (name ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() }
function reviewDate(d: string) { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} fill={i <= n ? '#F59E0B' : 'none'} color={i <= n ? '#F59E0B' : '#D6C9BF'} />
      ))}
    </span>
  )
}

export function ProductClient({ product, store, rating, reviewCount, reviews = [], relatedProducts = [] }: {
  product: Product; store: Store
  rating?: number | null; reviewCount?: number
  reviews?: Review[]; relatedProducts?: RelatedProduct[]
}) {
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

      {/* Você também pode gostar */}
      {relatedProducts.length > 0 && (
        <section className={styles.relatedSection}>
          <h2 className={styles.sectionTitle}>Você também pode gostar</h2>
          <div className={`hideScroll ${styles.relatedRail}`}>
            {relatedProducts.map((p, i) => {
              const out = isOut(p.stock)
              return (
                <Link
                  key={p.id}
                  href={`/product/${p.id}`}
                  className={`${styles.relatedCard} reveal`}
                  style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}
                >
                  <div className={styles.relatedImg}>
                    {p.imageUrl ? (
                      <Image src={p.imageUrl} alt={p.name} fill sizes="150px" style={{ objectFit: 'cover' }} />
                    ) : (
                      <div className={styles.relatedImgFallback}><Package size={22} strokeWidth={1.3} /></div>
                    )}
                    {out && <span className={styles.relatedOut}>Esgotado</span>}
                  </div>
                  <span className={styles.relatedName}>{p.name}</span>
                  <span className={styles.relatedPrice}>{fmtBRL(p.basePrice)}</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Avaliações da loja — não existe avaliação por produto, só por pedido/loja */}
      {reviews.length > 0 && (
        <section className={styles.reviewsSection}>
          <div className={styles.reviewsHead}>
            <div>
              <h2 className={styles.sectionTitle}>Avaliações de {store.name}</h2>
              <p className={styles.reviewsSub}>Com base nos pedidos entregues pela loja</p>
            </div>
            {rating != null && rating > 0 && (
              <div className={styles.reviewsScore}>
                <Star size={18} fill="#F59E0B" color="#F59E0B" />
                <strong>{Number(rating).toFixed(1)}</strong>
                <span className={styles.reviewsCount}>· {reviewCount} avaliaç{reviewCount === 1 ? 'ão' : 'ões'}</span>
              </div>
            )}
          </div>
          <div className={styles.reviewGrid}>
            {reviews.map((r, i) => (
              <div key={r.id} className={`${styles.reviewCard} reveal`} style={{ animationDelay: `${Math.min(i, 6) * 0.06}s` }}>
                <div className={styles.reviewTop}>
                  <span className={styles.reviewAvatar}>{initials(r.user?.name)}</span>
                  <div className={styles.reviewWho}>
                    <span className={styles.reviewName}>{r.user?.name?.split(' ')[0] ?? 'Cliente'}</span>
                    <span className={styles.reviewDateText}>{reviewDate(r.createdAt)}</span>
                  </div>
                  <Stars n={r.rating} />
                </div>
                {r.comment && <p className={styles.reviewComment}>{r.comment}</p>}
              </div>
            ))}
          </div>
          <Link href={`/store/${store.id}`} className={styles.seeAllLink}>
            Ver loja e todas as avaliações <ArrowRight size={14} />
          </Link>
        </section>
      )}

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
