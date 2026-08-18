'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Clock, MapPin, Minus, Plus, ShoppingCart, Package, Star } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { useAuth } from '@/hooks/useAuth'
import { ProductGallery } from './ProductGallery'
import styles from './ProductClient.module.css'

interface Variation { id: string; name: string; price: number | string; stock?: number | null }
interface Category { id: string; name: string }
interface Product {
  id: string; name: string; description?: string | null
  imageUrl?: string | null; images?: string[] | null
  basePrice?: number | string | null
  stock?: number | null; hasVariations?: boolean
  avgRating?: number | null; reviewCount?: number; soldCount?: number
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
interface Suggestion {
  id: string; name: string; imageUrl?: string | null
  basePrice?: number | string | null; stock?: number | null
  storeName?: string | null
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

export function ProductClient({
  product, store, storeRating, storeReviewCount, reviews = [], storeSuggestions = [], marketSuggestions = [],
}: {
  product: Product; store: Store
  storeRating?: number | null; storeReviewCount?: number
  reviews?: Review[]; storeSuggestions?: Suggestion[]; marketSuggestions?: Suggestion[]
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
  const photos = Array.from(new Set([product.imageUrl, ...(product.images ?? [])].filter(Boolean))) as string[]
  const hasRating = product.avgRating != null && product.avgRating > 0
  const hasSoldCount = !!product.soldCount && product.soldCount > 0

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
    <div className="container" style={{ padding: '24px 20px 80px', maxWidth: 1280 }}>
      <Link href={`/store/${store.id}`} className={styles.backLink}>
        <ArrowLeft size={15} /> Voltar para {store.name}
      </Link>

      <div className={styles.pageGrid}>
        <div className={styles.mainCol}>
          <div className={styles.layout}>
            <ProductGallery photos={photos} alt={product.name} outOfStock={outOfStock} />

            <div className={styles.info}>
              {product.category && <span className={styles.breadcrumb}>{store.name} · {product.category.name}</span>}
              <h1 className={styles.name}>{product.name}</h1>

              {(hasRating || hasSoldCount) && (
                <div className={styles.productMeta}>
                  {hasRating && (
                    <span className={styles.productRating}>
                      <Stars n={Math.round(product.avgRating!)} size={15} />
                      <strong>{product.avgRating!.toFixed(1)}</strong>
                      <span className={styles.productRatingCount}>
                        ({product.reviewCount} avaliaç{product.reviewCount === 1 ? 'ão' : 'ões'})
                      </span>
                    </span>
                  )}
                  {hasRating && hasSoldCount && <span className={styles.productMetaDot}>·</span>}
                  {hasSoldCount && (
                    <span className={styles.soldCount}>
                      {product.soldCount} pessoa{product.soldCount === 1 ? '' : 's'} já compr{product.soldCount === 1 ? 'ou' : 'aram'} este produto
                    </span>
                  )}
                </div>
              )}

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
            </div>
          </div>

          {/* Sugestões de todas as lojas */}
          {marketSuggestions.length > 0 && (
            <section className={styles.relatedSection}>
              <h2 className={styles.sectionTitle}>Você também pode gostar</h2>
              <div className={`hideScroll ${styles.relatedRail}`}>
                {marketSuggestions.map((p, i) => {
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
                      {p.storeName && <span className={styles.relatedStore}>{p.storeName}</span>}
                      <span className={styles.relatedName}>{p.name}</span>
                      <span className={styles.relatedPrice}>{fmtBRL(p.basePrice)}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Avaliações da loja — não existe avaliação por produto, só por pedido/loja.
              Sempre visível: mostra estado vazio quando ainda não há nenhuma. */}
          <section className={styles.reviewsSection}>
            <div className={styles.reviewsHead}>
              <div>
                <h2 className={styles.sectionTitle}>Avaliações de {store.name}</h2>
                <p className={styles.reviewsSub}>Com base nos pedidos entregues pela loja</p>
              </div>
              {storeRating != null && storeRating > 0 && (
                <div className={styles.reviewsScore}>
                  <Star size={18} fill="#F59E0B" color="#F59E0B" />
                  <strong>{Number(storeRating).toFixed(1)}</strong>
                  <span className={styles.reviewsCount}>· {storeReviewCount} avaliaç{storeReviewCount === 1 ? 'ão' : 'ões'}</span>
                </div>
              )}
            </div>

            {reviews.length > 0 ? (
              <>
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
              </>
            ) : (
              <div className={styles.reviewsEmpty}>
                <Star size={24} strokeWidth={1.3} />
                <p className={styles.reviewsEmptyTitle}>Ainda não há avaliações de {store.name}.</p>
                <span className={styles.reviewsEmptySub}>Seja o primeiro a avaliar depois da sua compra!</span>
              </div>
            )}
          </section>
        </div>

        {/* Loja + sugestões — fixo na lateral, acompanha a rolagem */}
        <aside className={styles.sidebar}>
          <div className={styles.storeCard}>
            <div className={styles.storeCardHead}>
              {store.logoUrl
                ? <Image src={store.logoUrl} alt={store.name} width={44} height={44} style={{ borderRadius: 11, objectFit: 'cover' }} />
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

          {storeSuggestions.length > 0 && (
            <div className={styles.sideSuggestions}>
              <span className={styles.sideSuggestionsTitle}>Sugestões de {store.name}</span>
              <div className={styles.sideList}>
                {storeSuggestions.slice(0, 5).map((p) => {
                  const out = isOut(p.stock)
                  return (
                    <Link key={p.id} href={`/product/${p.id}`} className={styles.sideItem}>
                      <div className={styles.sideItemImg}>
                        {p.imageUrl ? (
                          <Image src={p.imageUrl} alt={p.name} fill sizes="72px" style={{ objectFit: 'cover' }} />
                        ) : (
                          <Package size={22} strokeWidth={1.4} />
                        )}
                        {out && <span className={styles.sideItemOut}>Esgotado</span>}
                      </div>
                      <div className={styles.sideItemInfo}>
                        <span className={styles.sideItemName}>{p.name}</span>
                        <span className={styles.sideItemPrice}>{fmtBRL(p.basePrice)}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </aside>
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
