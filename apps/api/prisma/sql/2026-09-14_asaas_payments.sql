-- Migração: entrada de dinheiro via Asaas (centralizado).
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente (IF NOT EXISTS).
--
--  users.cpf                → CPF do pagador (exigido pelo Asaas p/ emitir cobrança)
--  users.asaas_customer_id  → id do cliente no Asaas (cacheado p/ reuso)
--  payments.gateway         → provedor onde a cobrança foi criada (MP | ASAAS).
--                             Default MP: todos os pagamentos existentes continuam MP.

ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "cpf" TEXT;
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "asaas_customer_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "gateway" TEXT DEFAULT 'MP';
