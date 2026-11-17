-- Pedido do cliente (11/11/2026): tirar as categorias de alimentação e deixar só "Mercado".
-- Nada é apagado: lojas e produtos dessas categorias passam para "Mercado" e as
-- categorias antigas ficam desativadas (somem do app, do site e do cadastro).
-- Pode rodar mais de uma vez.
--
-- Se alguma da lista deve continuar (ex.: Hortifruti ou Bebidas), apague a linha dela
-- em "alimentos" antes de rodar.
BEGIN;

CREATE TEMP TABLE alimentos ON COMMIT DROP AS
SELECT id FROM categories WHERE name IN (
  'Restaurantes',
  'Lanches',
  'Pizzaria',
  'Padaria',
  'Açaí',
  'Sorvetes',
  'Sushi',
  'Marmita',
  'Churrasco',
  'Bebidas',
  'Hortifruti'
);

-- Garante que "Mercado" existe e está ativa.
INSERT INTO categories (id, name, icon, sort_order, is_active, created_at)
VALUES (gen_random_uuid()::text, 'Mercado', 'cart', 11, true, now())
ON CONFLICT (name) DO UPDATE SET is_active = true;

-- 1. Lojas: quem estava numa categoria de alimentação passa a estar em Mercado.
INSERT INTO "_StoresToCategories" ("A", "B")
SELECT m.id, sc."B"
FROM "_StoresToCategories" sc
JOIN alimentos a ON a.id = sc."A"
CROSS JOIN (SELECT id FROM categories WHERE name = 'Mercado') m
ON CONFLICT DO NOTHING;

DELETE FROM "_StoresToCategories" WHERE "A" IN (SELECT id FROM alimentos);

-- 2. Produtos: mesma coisa.
UPDATE products
SET category_id = (SELECT id FROM categories WHERE name = 'Mercado')
WHERE category_id IN (SELECT id FROM alimentos);

-- 3. Desativa as categorias de alimentação.
UPDATE categories SET is_active = false WHERE id IN (SELECT id FROM alimentos);

COMMIT;

-- Conferência: as ativas que sobraram (não pode ter nenhuma de alimentação, e Mercado tem que estar).
SELECT sort_order, name FROM categories WHERE is_active ORDER BY sort_order, name;
