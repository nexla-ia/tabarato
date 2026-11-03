-- Login com Apple + exclusão de conta pelo próprio usuário (exigências das lojas).
-- Só ADIÇÃO e idempotente: pode rodar duas vezes.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apple_sub  TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub_key ON users(apple_sub);
