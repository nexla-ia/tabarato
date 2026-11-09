-- Taxa do pagamento paga pela LOJA + parcelamento com juros a partir de X parcelas.
-- Rodar no Supabase ANTES do deploy da API.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS card_max_installments     integer        NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS card_free_installments    integer        NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS card_interest_monthly_pct decimal(65,30) NOT NULL DEFAULT 2.99,
  ADD COLUMN IF NOT EXISTS card_fee_pct_1x           decimal(65,30) NOT NULL DEFAULT 2.99,
  ADD COLUMN IF NOT EXISTS card_fee_pct_2to6         decimal(65,30) NOT NULL DEFAULT 3.49,
  ADD COLUMN IF NOT EXISTS card_fee_pct_7to12        decimal(65,30) NOT NULL DEFAULT 3.99,
  ADD COLUMN IF NOT EXISTS card_fee_fixed            decimal(65,30) NOT NULL DEFAULT 0.49,
  ADD COLUMN IF NOT EXISTS pix_fee                   decimal(65,30) NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS installments         integer        NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_interest decimal(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee          decimal(65,30) NOT NULL DEFAULT 0;
