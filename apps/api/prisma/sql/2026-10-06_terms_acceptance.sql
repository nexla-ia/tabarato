-- Aceite dos Termos: quando e QUAL versao.
--
-- Hoje o lojista "aceita" os Termos numa frase ao lado do botao de criar a loja,
-- e nada fica gravado — nao da pra provar o que ele concordou nem quando, e e
-- justamente ele quem aceita a comissao da plataforma. O entregador ja tinha o
-- timestamp, mas nao a versao: se o texto muda, o registro antigo nao diz qual
-- texto foi aceito.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS terms_version     TEXT;

ALTER TABLE couriers
  ADD COLUMN IF NOT EXISTS terms_version     TEXT;

-- Lojas que ja existem (12 na producao em 06/10/2026): aceite desconhecido, fica
-- NULL de proposito — nao da pra inventar uma data. O painel do lojista detecta o
-- NULL (ou uma versao antiga) e pede o aceite da versao vigente via
-- POST /stores/me/accept-terms.
