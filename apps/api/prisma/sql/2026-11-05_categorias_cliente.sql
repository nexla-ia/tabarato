-- Categorias pedidas pelo cliente (05/11/2026), juntadas com as que já existiam.
-- Renomear mantém o id, então lojas e produtos continuam ligados.
-- Pode rodar mais de uma vez: cada passo confere o estado antes de mexer.
BEGIN;

-- 1. Parecidas: passam a ter o nome do cliente.
UPDATE categories SET name = 'Eletrônicos e eletrodomésticos', icon = 'tv'       WHERE name = 'Eletronicos';
UPDATE categories SET name = 'Móveis e decoração',             icon = 'bed'      WHERE name = 'Casa e Decoracao';
UPDATE categories SET name = 'Moda, calçados e acessórios',    icon = 'shirt'    WHERE name = 'Roupas';
UPDATE categories SET name = 'Materiais de construção',        icon = 'construct' WHERE name = 'Construcao';
UPDATE categories SET name = 'Perfumaria, cosméticos e cuidados pessoais', icon = 'rose' WHERE name = 'Saude e Beleza';
UPDATE categories SET name = 'Autopeças'                                         WHERE name = 'Autopecas';
UPDATE categories SET name = 'Artigos pet'                                       WHERE name = 'Pet Shop';
UPDATE categories SET name = 'Papelaria e escritório'                            WHERE name = 'Papelaria';
UPDATE categories SET name = 'Artigos esportivos'                                WHERE name = 'Esportes';

-- 2. Calçados entra em "Moda, calçados e acessórios": move lojas e produtos e desativa.
INSERT INTO "_StoresToCategories" ("A", "B")
SELECT moda.id, sc."B"
FROM "_StoresToCategories" sc
JOIN categories calc ON calc.id = sc."A" AND calc.name = 'Calcados'
CROSS JOIN (SELECT id FROM categories WHERE name = 'Moda, calçados e acessórios') moda
ON CONFLICT DO NOTHING;

DELETE FROM "_StoresToCategories"
WHERE "A" = (SELECT id FROM categories WHERE name = 'Calcados');

UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Moda, calçados e acessórios')
WHERE category_id = (SELECT id FROM categories WHERE name = 'Calcados')
  AND EXISTS (SELECT 1 FROM categories WHERE name = 'Moda, calçados e acessórios');

UPDATE categories SET is_active = false WHERE name = 'Calcados';

-- 3. Novas.
INSERT INTO categories (id, name, icon, sort_order, is_active, created_at) VALUES
  (gen_random_uuid()::text, 'Ferramentas',           'hammer',          29, true, now()),
  (gen_random_uuid()::text, 'Acessórios',            'watch',           30, true, now()),
  (gen_random_uuid()::text, 'Gás de cozinha',        'flame-outline',   31, true, now()),
  (gen_random_uuid()::text, 'Brinquedos e jogos',    'game-controller', 32, true, now()),
  (gen_random_uuid()::text, 'Instrumentos musicais', 'musical-notes',   33, true, now()),
  (gen_random_uuid()::text, 'Produtos de limpeza',   'sparkles',        34, true, now()),
  (gen_random_uuid()::text, 'Casa',                  'home',            35, true, now())
ON CONFLICT (name) DO NOTHING;

-- 4. Acentos que faltavam nas antigas (para não destoar das novas).
UPDATE categories SET name = 'Farmácia'                WHERE name = 'Farmacia';
UPDATE categories SET name = 'Açaí'                    WHERE name = 'Acai';
UPDATE categories SET name = 'Informática'             WHERE name = 'Informatica';
UPDATE categories SET name = 'Farmácia de Manipulação' WHERE name = 'Farmacia de Manipulacao';
UPDATE categories SET name = 'Ótica'                   WHERE name = 'Otica';

COMMIT;

-- Conferência: deve listar as ativas, já com os nomes novos.
SELECT sort_order, name, icon FROM categories WHERE is_active ORDER BY sort_order, name;
