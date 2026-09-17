-- Migração: recusa de corrida pelo entregador (não re-ofertar a quem recusou).
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "refused_courier_ids" TEXT[] NOT NULL DEFAULT '{}';

-- LIMPEZA (opcional, teste): fecha entregas órfãs de pedidos já cancelados/entregues
-- que ficaram presas em SEARCHING_COURIER e seguem sendo re-ofertadas.
UPDATE "deliveries" d SET "status" = 'FAILED'
FROM "orders" o
WHERE d."order_id" = o."id"
  AND d."status" = 'SEARCHING_COURIER'
  AND d."courier_id" IS NULL
  AND o."status" IN ('CANCELLED', 'DELIVERED');
