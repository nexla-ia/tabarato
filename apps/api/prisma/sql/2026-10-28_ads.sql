-- Anuncios pagos na vitrine.
--
-- A empresa pede (dias + arte), o admin aprova, ela paga por PIX e o banner entra
-- no ar sozinho. "No ar" nao e status: e PAID com starts_at <= agora < ends_at.
-- Tudo aqui e ADICAO e idempotente (IF NOT EXISTS): pode rodar duas vezes.

DO $$ BEGIN
  CREATE TYPE "AdStatus" AS ENUM ('PENDING_REVIEW','REJECTED','AWAITING_PAYMENT','EXPIRED_UNPAID','PAID','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AdLinkType" AS ENUM ('NONE','STORE','WHATSAPP','URL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ads (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  company_name     TEXT NOT NULL,
  document         TEXT NOT NULL,
  image_url        TEXT NOT NULL,
  link_type        "AdLinkType" NOT NULL DEFAULT 'NONE',
  link_target      TEXT,
  days             INTEGER NOT NULL,
  price_per_day    DECIMAL(65,30) NOT NULL,
  total_price      DECIMAL(65,30) NOT NULL,
  status           "AdStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  reject_reason    TEXT,
  reviewed_at      TIMESTAMP(3),
  pay_deadline     TIMESTAMP(3),
  payment_id       TEXT REFERENCES payments(id),
  paid_at          TIMESTAMP(3),
  starts_at        TIMESTAMP(3),
  ends_at          TIMESTAMP(3),
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  live_notified    BOOLEAN NOT NULL DEFAULT false,
  renewal_notified BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ads_status_idx      ON ads(status);
CREATE INDEX IF NOT EXISTS ads_user_id_idx     ON ads(user_id);
CREATE INDEX IF NOT EXISTS ads_starts_ends_idx ON ads(starts_at, ends_at);

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS ad_price_per_day     DECIMAL(65,30) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ad_min_days          INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS ad_slots             INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS ad_pay_deadline_days INTEGER NOT NULL DEFAULT 3;
