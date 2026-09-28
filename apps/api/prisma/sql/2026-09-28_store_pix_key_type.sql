-- Migração: tipo da chave PIX da loja (pra saque via Asaas).
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.
--
--  stores.pix_key_type → CPF | CNPJ | EMAIL | PHONE | EVP
--  O Asaas infere CPF/CNPJ/email/telefone, mas NÃO infere chave aleatória (EVP):
--  sem o tipo, o saque de loja com chave EVP falha. Nulo = deixa o Asaas inferir.

ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "pix_key_type" TEXT;
