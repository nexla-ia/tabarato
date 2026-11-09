-- Entrega feita pela loja (itens grandes demais para o baú do entregador).
-- Rodar ANTES do deploy da API.
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_delivery BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stores   ADD COLUMN IF NOT EXISTS own_delivery_fee DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS courier_box_width_cm  INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS courier_box_height_cm INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS courier_box_depth_cm  INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS courier_box_max_kg    INTEGER NOT NULL DEFAULT 20;
