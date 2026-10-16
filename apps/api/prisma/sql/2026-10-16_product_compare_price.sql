-- Ofertas: preco "de" (antigo) para a vitrine de Ofertas Imperdiveis.
--
-- So conta como oferta quando compare_price > base_price. Produto sem oferta
-- fica NULL. O indice parcial serve a consulta da home, que busca exatamente
-- "quem tem preco de maior que o preco atual".

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS compare_price DECIMAL(65,30);

CREATE INDEX IF NOT EXISTS products_oferta_idx
  ON products (store_id)
  WHERE compare_price IS NOT NULL;
