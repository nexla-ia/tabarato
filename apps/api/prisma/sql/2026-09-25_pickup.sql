-- Migração: retirada na loja (pickup) + teto de valor para entrega por motoboy.
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.
--
--  orders.fulfillment_type          → DELIVERY (padrão) | PICKUP (cliente retira na loja)
--  platform_settings.max_delivery_value → acima disso (subtotal), só retirada. 0 = sem limite.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "fulfillment_type" TEXT NOT NULL DEFAULT 'DELIVERY';

ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "max_delivery_value" DECIMAL(65,30) NOT NULL DEFAULT 1000;
