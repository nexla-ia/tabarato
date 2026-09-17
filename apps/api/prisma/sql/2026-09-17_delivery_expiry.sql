-- Migração: expiração da busca por entregador (a loja reanuncia se ninguém aceitar).
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "matching_expired" BOOLEAN NOT NULL DEFAULT false;
