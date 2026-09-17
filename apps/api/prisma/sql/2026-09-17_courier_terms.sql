-- Migração: aceite do Termo de Responsabilidade do entregador (no cadastro).
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.

ALTER TABLE "couriers"
  ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMP(3);
