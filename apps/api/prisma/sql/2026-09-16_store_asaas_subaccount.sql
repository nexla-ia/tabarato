-- Migração: split de pagamento por loja (subconta Asaas).
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.
--
-- A parte da loja passa a cair DIRETO na subconta Asaas dela (split no pagamento),
-- em vez de passar pela conta da plataforma. asaas_api_key fica CRIPTOGRAFADO.

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "asaas_account_id" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "asaas_wallet_id" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "asaas_api_key" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "asaas_onboarded" BOOLEAN NOT NULL DEFAULT false;
