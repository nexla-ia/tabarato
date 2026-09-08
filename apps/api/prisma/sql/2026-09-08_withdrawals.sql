-- Migração: entidade de saque (Withdrawal) + tipo da chave PIX do entregador.
-- Rodar no SQL editor do Supabase ANTES do deploy do backend.

-- 1) Enum de status do saque
DO $$ BEGIN
  CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) Tipo da chave PIX no entregador (CPF | CNPJ | EMAIL | PHONE | EVP)
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "pix_key_type" TEXT;

-- 3) Tabela de saques
CREATE TABLE IF NOT EXISTS "withdrawals" (
  "id" TEXT NOT NULL,
  "courier_id" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "pix_key" TEXT NOT NULL,
  "pix_key_type" TEXT,
  "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
  "asaas_transfer_id" TEXT,
  "fail_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "withdrawals_courier_id_idx" ON "withdrawals"("courier_id");
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals"("status");

DO $$ BEGIN
  ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_courier_id_fkey"
    FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
