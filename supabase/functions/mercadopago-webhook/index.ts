import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_TOKEN  = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')!
const SUPA_URL  = Deno.env.get('SUPABASE_URL')!
const SUPA_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  let body: any
  try { body = await req.json() } catch { return new Response('ok') }

  // MP envia: { type: "payment", action: "payment.updated", data: { id: "123456" } }
  if (body?.type !== 'payment' && body?.action !== 'payment.updated') {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  const mpId = body?.data?.id
  if (!mpId) return new Response('ok')

  // ── Re-fetch do MP (não confiamos no payload — verificamos na fonte) ──────
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${mpId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  })
  if (!mpRes.ok) return new Response('mp_error', { status: 200 })

  const mpPayment = await mpRes.json()
  const orderId   = mpPayment.external_reference as string | undefined
  const mpStatus  = mpPayment.status as string // approved | rejected | cancelled | pending

  if (!orderId) return new Response('ok')

  const db = createClient(SUPA_URL, SUPA_KEY)

  // Busca o pedido com pagamento e dados do usuário
  const { data: order } = await db
    .from('orders')
    .select(`
      id, status, store_id,
      payment:payments!payment_id(id, status),
      user:users!user_id(id, push_token),
      store:stores!store_id(name)
    `)
    .eq('id', orderId)
    .single()

  if (!order?.payment) return new Response('ok')

  // ── Pagamento aprovado ────────────────────────────────────────────────────
  if (mpStatus === 'approved' && order.payment.status !== 'PAID') {
    await Promise.all([
      db.from('payments').update({
        status:     'PAID',
        paid_at:    new Date().toISOString(),
        gateway_id: String(mpId),
      }).eq('id', order.payment.id),

      db.from('orders').update({ status: 'CONFIRMED' }).eq('id', orderId),
    ])

    // Push notification
    const pushToken = order.user?.push_token
    if (pushToken) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:    pushToken,
          title: '✅ Pagamento confirmado!',
          body:  `Seu pedido em ${order.store?.name ?? 'Tá Barato'} foi pago e já está sendo preparado.`,
          data:  { orderId },
        }),
      }).catch(() => {})
    }

    // Notificação in-app
    if (order.user?.id) {
      await db.from('notifications').insert({
        recipient_id: order.user.id,
        type:         'PAYMENT',
        title:        '✅ Pagamento confirmado!',
        body:         `Pedido #${orderId.slice(0, 8)} pago com sucesso.`,
        data:         JSON.stringify({ orderId }),
        is_read:      false,
      }).catch(() => {})
    }
  }

  // ── Pagamento rejeitado / cancelado ───────────────────────────────────────
  if ((mpStatus === 'rejected' || mpStatus === 'cancelled') && order.payment.status === 'PENDING') {
    await db.from('payments').update({ status: 'FAILED' }).eq('id', order.payment.id)

    const pushToken = order.user?.push_token
    if (pushToken) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:    pushToken,
          title: '❌ Pagamento não confirmado',
          body:  'Seu PIX não foi confirmado. Tente novamente.',
          data:  { orderId },
        }),
      }).catch(() => {})
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
