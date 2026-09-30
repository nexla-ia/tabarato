-- Migração: moderação de produtos pelo admin.
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.
--   products.blocked_by_admin → true = admin bloqueou (some pro cliente, não pode ser pedido)
--   products.block_reason     → motivo opcional do bloqueio
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "blocked_by_admin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "block_reason" TEXT;
