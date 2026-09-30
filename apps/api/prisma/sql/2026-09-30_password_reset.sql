-- Migração: recuperação de senha por código de 6 dígitos.
-- Rodar no SQL editor do Supabase ANTES do deploy. Idempotente.
--
--   users.password_changed_at → tokens emitidos antes disso deixam de valer
--   password_resets           → código (só o HASH), validade, uso único, tentativas

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "password_resets" (
  "id"         TEXT         NOT NULL,
  "user_id"    TEXT         NOT NULL,
  "code_hash"  TEXT         NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "attempts"   INTEGER      NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "password_resets_user_id_idx" ON "password_resets"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_user_id_fkey'
  ) THEN
    ALTER TABLE "password_resets"
      ADD CONSTRAINT "password_resets_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
