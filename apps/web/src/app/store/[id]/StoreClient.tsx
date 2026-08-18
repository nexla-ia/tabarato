'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ShoppingCart, Plus, Minus, Clock, MapPin, ChevronRight, ArrowLeft, Star, Search, Phone, Store as StoreIcon } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { useAuth } from '@/hooks/useAuth'
import { formatPhone } from '@/lib/masks'
import styles from './StoreClient.module.css'

interface Variation { id: string; name: string; price: number | string; stock?: number | null }
interface Category { id: string; name: string; icon?: string | null }
interface Product {
  id: string; name: string; description?: string
  imageUrl?: string; basePrice?: number | string; isActive: boolean
  stock?: number | null
  hasVariations?: boolean
  variations?: Variation[]
  category?: Category | null
}

// estoque null = ilimitado; <= 0 = esgotado
function isOut(stock?: number | null) { return stock != null && stock <= 0 }

interface Store {
  id: string; name: string; description?: string; logoUrl?: string
  deliveryRadiusKm: number; prepTimeMin: number; isOpen: boolean
  address?: string | null; phone?: string | null
}
interface Review {
  id: string; rating: number; comment?: string | null
  photos?: string[]; createdAt: string; user?: { name?: string } | null
}

function fmtBRL(v: number | string) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }
function digits(s?: string | null) { return (s ?? '').replace(/\D/g, '') }
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

export function StoreClient({ store, products, rating, reviewCount, reviews = [], photos = [] }: {
  store: Store; products: Product[]; rating?: number | null; reviewCount?: number
  reviews?: Review[]; photos?: string[]
}) {
  const { items, addItem, total, storeId } = useCartStore()
  const [query, setQuery] = useState('')
  const { user } = useAuth()
  const [confirmClear, setConfirmClear] = useState<(() => void) | null>(null)
  const cartCount = items.reduce((a, i) => a + i.quantity, 0)

  function handleAdd(product: Product, variation?: { id: string; name: string; price: number | string }) {
    const price = Number(variation?.price ?? product.basePrice ?? 0)
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
          <Link href="/" className={styles.backLink}><ArrowLeft size={16} /> Voltar às lojas</Link>
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
                {rating != null && rating > 0 && (
                  <span className={styles.ratingMeta}>
                    <Star size={13} fill="#F59E0B" color="#F59E0B" /> {Number(rating).toFixed(1)}
                    {reviewCount ? <span className={styles.ratingCount}>({reviewCount})</span> : null}
                  </span>
                )}
                <span className={styles.metaItem}><Clock size={13} /> {store.prepTimeMin} min</span>
                <span className={styles.metaItem}><MapPin size={13} /> até {store.deliveryRadiusKm} km</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info + Products */}
      <div className="container" style={{ padding: '24px 20px 120px' }}>
        {/* Galeria de fotos */}
        {photos.length > 0 && (
          <div className={`hideScroll ${styles.gallery}`}>
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={styles.galleryItem}>
                <Image src={url} alt={`${store.name} foto ${i + 1}`} fill sizes="220px" style={{ objectFit: 'cover' }} />
              </a>
            ))}
          </div>
        )}

        {/* Sobre a loja */}
        {(store.address || store.phone) && (
          <div className={styles.infoCard}>
            <div className={styles.infoItem}>
              <StoreIcon size={16} />
              <div>
                <div className={styles.infoLabel}>Loja</div>
                <div className={styles.infoValue}>{store.isOpen ? 'Aberta agora' : 'Fechada'} · entrega até {store.deliveryRadiusKm} km · ~{store.prepTimeMin} min</div>
              </div>
            </div>
            {store.address && (
              <div className={styles.infoItem}>
                <MapPin size={16} />
                <div>
                  <div className={styles.infoLabel}>Endereço</div>
                  <div className={styles.infoValue}>{store.address}</div>
                </div>
              </div>
            )}
            {store.phone && (
              <a className={styles.infoItem} href={`https://wa.me/55${digits(store.phone)}`} target="_blank" rel="noopener noreferrer">
                <Phone size={16} />
                <div>
                  <div className={styles.infoLabel}>Contato</div>
                  <div className={`${styles.infoValue} ${styles.infoLink}`}>{formatPhone(store.phone)}</div>
                </div>
              </a>
            )}
          </div>
        )}

        {products.length === 0 ? (
          <div className={styles.empty}>Nenhum produto disponível no momento.</div>
        ) : (
          <>
            <div className={styles.menuHead}>
              <h2 className={styles.menuTitle}>Produtos</h2>
              <span className={styles.menuCount}>{products.length} {products.length === 1 ? 'item' : 'itens'}</span>
            </div>

            <div className={styles.searchBar}>
              <Search size={18} />
              <input
                className={styles.searchInput}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Buscar em ${store.name}…`}
              />
            </div>

            {(() => {
              const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
              const q = norm(query.trim())
              const filtered = q
                ? products.filter(p => norm(p.name).includes(q) || norm(p.description ?? '').includes(q))
                : products

              if (!filtered.length) {
                return <div className={styles.empty}>Nenhum produto encontrado para “{query}”.</div>
              }

              // agrupa por categoria preservando ordem de aparição
              const groups: { name: string; items: Product[] }[] = []
              for (const p of filtered) {
                const catName = p.category?.name ?? 'Outros'
                let g = groups.find(x => x.name === catName)
                if (!g) { g = { name: catName, items: [] }; groups.push(g) }
                g.items.push(p)
              }

              return groups.map(g => (
                <section key={g.name} className={styles.catSection}>
                  <h3 className={styles.catTitle}>{g.name}</h3>
                  <div className={styles.grid}>
                    {g.items.map(p => <ProductCard key={p.id} product={p} onAdd={handleAdd} />)}
                  </div>
                </section>
              ))
            })()}
          </>
        )}

        {/* Avaliações — sempre visível, com estado vazio quando ainda não há nenhuma */}
        <section className={styles.reviews}>
          <div className={styles.reviewsHead}>
            <h2 className={styles.menuTitle}>Avaliações</h2>
            {rating != null && rating > 0 && (
              <div className={styles.reviewsScore}>
                <Star size={16} fill="#F59E0B" color="#F59E0B" />
                <strong>{Number(rating).toFixed(1)}</strong>
                <span className={styles.menuCount}>· {reviewCount} avaliaç{reviewCount === 1 ? 'ão' : 'ões'}</span>
              </div>
            )}
          </div>
          {reviews.length > 0 ? (
            <div className={styles.reviewGrid}>
              {reviews.map(r => (
                <div key={r.id} className={styles.reviewCard}>
                  <div className={styles.reviewTop}>
                    <span className={styles.reviewAvatar}>{initials(r.user?.name)}</span>
                    <div className={styles.reviewWho}>
                      <span className={styles.reviewName}>{r.user?.name?.split(' ')[0] ?? 'Cliente'}</span>
                      <span className={styles.reviewDate}>{reviewDate(r.createdAt)}</span>
                    </div>
                    <Stars n={r.rating} />
                  </div>
                  {r.comment && <p className={styles.reviewComment}>{r.comment}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.reviewsEmpty}>
              <Star size={24} strokeWidth={1.3} />
              <p className={styles.reviewsEmptyTitle}>Ainda não há avaliações de {store.name}.</p>
              <span className={styles.reviewsEmptySub}>Seja o primeiro a avaliar depois da sua compra!</span>
            </div>
          )}
        </section>
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
  onAdd: (p: Product, v?: Variation) => void
}) {
  const [selectedVar, setSelectedVar] = useState(
    product.variations?.find(v => !isOut(v.stock)) ?? product.variations?.[0],
  )
  const price = Number(selectedVar?.price ?? product.basePrice ?? 0)
  const items = useCartStore(s => s.items)
  const qty = items.filter(
    i => i.productId === product.id && i.variationId === selectedVar?.id
  ).reduce((a, i) => a + i.quantity, 0)

  const hasVars = !!(product.variations && product.variations.length > 0)
  // esgotado: sem variações → estoque do produto; com variações → todas esgotadas
  const allVarsOut = hasVars && product.variations!.every(v => isOut(v.stock))
  const productOut = !hasVars && isOut(product.stock)
  const outOfStock = productOut || allVarsOut
  // esgotado da opção atualmente selecionada
  const selectionOut = outOfStock || (selectedVar ? isOut(selectedVar.stock) : isOut(product.stock))

  return (
    <div className={`${styles.productCard} ${outOfStock ? styles.cardOut : ''}`}>
      <Link href={`/product/${product.id}`} className={styles.productImg}>
        {product.imageUrl
          ? <Image src={product.imageUrl} alt={product.name} fill style={{ objectFit: 'cover' }} />
          : <div className={styles.productImgFallback}>📦</div>
        }
        {outOfStock && <span className={styles.outRibbon}>Esgotado</span>}
      </Link>
      <div className={styles.productInfo}>
        <Link href={`/product/${product.id}`} className={styles.nameLink}><h3 className={styles.productName}>{product.name}</h3></Link>
        {product.description && <p className={styles.productDesc}>{product.description}</p>}

        {hasVars && (
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
        )}

        <div className={styles.productBottom}>
          <span className={styles.productPrice}>{fmtBRL(price)}</span>
          {selectionOut ? (
            <span className={styles.outLabel}>Indisponível</span>
          ) : qty > 0 ? (
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
