-- Migração: saque automático da loja (generaliza a tabela de saques).
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.
--
-- withdrawals.owner_type / owner_id → dono genérico do saque (STORE | COURIER).
-- courier_id vira NULLABLE (só usado pelos saques de entregador, por compat/relação).
-- Backfill: saques existentes são de entregador → owner_id = courier_id.

ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "owner_type" TEXT DEFAULT 'COURIER';
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "owner_id" TEXT;
ALTER TABLE "withdrawals" ALTER COLUMN "courier_id" DROP NOT NULL;

UPDATE "withdrawals" SET "owner_id" = "courier_id" WHERE "owner_id" IS NULL;

CREATE INDEX IF NOT EXISTS "withdrawals_owner_type_owner_id_idx"
  ON "withdrawals" ("owner_type", "owner_id");
