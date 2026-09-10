-- Migração: tabela de configuração de preços (singleton) — editável no admin.
-- Rodar no SQL editor do Supabase ANTES do deploy. Padrões = comportamento atual.

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" TEXT NOT NULL,
  "delivery_base_fee" DECIMAL(65,30) NOT NULL DEFAULT 10,
  "delivery_per_km" DECIMAL(65,30) NOT NULL DEFAULT 2,
  "delivery_min_fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "courier_base_fee" DECIMAL(65,30) NOT NULL DEFAULT 10,
  "courier_per_km" DECIMAL(65,30) NOT NULL DEFAULT 2,
  "platform_commission_pct" DECIMAL(65,30) NOT NULL DEFAULT 10,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- Linha única "default" (o serviço já cai nos padrões se ela não existir).
INSERT INTO "platform_settings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;
