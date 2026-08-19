'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { StoreCardsGrid } from '../StoreCardsGrid'
import { Store } from '../storesData'

interface FavoriteRow { id: string; storeId: string; store: Store }

export default function FavoritesPage() {
  const router = useRouter()
  const { user, ready } = useAuth()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ready) return
    if (!user) { router.push('/login?redirect=/favorites'); return }
    api.get<FavoriteRow[]>('/users/me/favorites')
      .then((r) => setStores(r.data.map((f) => f.store)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ready, user, router])

  if (!ready || !user || loading) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
          Carregando...
        </div>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '32px 20px 60px' }}>
        {stores.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: 48, textAlign: 'center', color: 'var(--muted)',
          }}>
            <Heart size={32} strokeWidth={1.5} />
            <p>Você ainda não favoritou nenhuma loja.</p>
            <Link
              href="/"
              style={{ background: 'var(--orange)', color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 15 }}
            >
              Ver lojas
            </Link>
          </div>
        ) : (
          <StoreCardsGrid
            heading={<><Heart size={20} style={{ verticalAlign: -3, marginRight: 6 }} fill="var(--orange)" color="var(--orange)" /> Lojas favoritas</>}
            stores={stores}
            filtering={false}
          />
        )}
      </div>
    </>
  )
}
