-- Biblia de cortesia: o cliente pode pedir um exemplar no cadastro e a
-- plataforma envia pelos Correios.
--
-- Privacidade: conviccao religiosa e DADO SENSIVEL na LGPD (art. 5, II). Por
-- isso guardamos linha so de quem ACEITOU, por pedido expresso dele. De quem
-- recusou fica apenas `users.bible_offered_at`, que diz que a oferta ja foi
-- exibida (para nao perguntar de novo) e nao guarda a resposta.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bible_offered_at TIMESTAMP(3);

DO $$ BEGIN
  CREATE TYPE "BibleRequestStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS bible_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status     "BibleRequestStatus" NOT NULL DEFAULT 'PENDING',
  notes      TEXT,
  sent_at    TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bible_requests_status_idx ON bible_requests(status);
