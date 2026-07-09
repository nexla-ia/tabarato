# Mercado Pago — Split de Pagamento (Marketplace)

Cada lojista conecta a **própria conta Mercado Pago**. Em cada venda, o MP divide o valor
**automaticamente**: a parte da loja cai na conta dela e a comissão da Tá Barato cai na conta
da Tá Barato. **Sem repasse manual.**

## Como o valor é dividido

Para um pedido com `subtotal` + `taxa de entrega`:

| Quem | Recebe | Como |
|---|---|---|
| **Loja** | `subtotal − 10%` | direto, via split (na conta MP da loja) |
| **Tá Barato** | `10% do subtotal + taxa de entrega` | via `application_fee` (na conta MP da Tá Barato) |
| **Entregador** | taxa de entrega dele | pago pela Tá Barato pela carteira/saque do app |

> O split do MP é de 2 vias (loja + plataforma). O entregador é pago pela plataforma a partir
> da parte que ela retém — usando a carteira que já existe.

## Feature flag

O split só liga quando as 3 variáveis abaixo existem. **Sem elas, o sistema fica no modo
centralizado atual** (tudo cai na conta da plataforma) — então dá pra fazer deploy sem quebrar nada.

## Passo a passo (dono da Tá Barato)

### 1. Criar o app de Marketplace no Mercado Pago
1. Acesse https://www.mercadopago.com.br/developers → **Suas integrações → Criar aplicação**
2. Em "modelo de negócio", escolha **Marketplace / Pagamentos para terceiros (split)**
3. Anote o **Client ID** e o **Client Secret** (produção)

### 2. Configurar a Redirect URI
No app MP, em **Redirect URLs**, adicione exatamente:

```
https://api-production-b730d.up.railway.app/api/stores/mp/callback
```

### 3. Variáveis de ambiente (serviço `api` no Railway)

| Variável | Valor |
|---|---|
| `MERCADO_PAGO_CLIENT_ID` | Client ID do app marketplace |
| `MERCADO_PAGO_CLIENT_SECRET` | Client Secret do app marketplace |
| `MERCADO_PAGO_REDIRECT_URI` | `https://api-production-b730d.up.railway.app/api/stores/mp/callback` |
| `WEB_URL` | `https://tabarato-production.up.railway.app` (pra onde o lojista volta após conectar) |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token de **produção** da conta da Tá Barato (recebe a comissão) |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Secret do webhook (assinatura) |

Depois de setar, **redeploy** da API. O card "Conectar Mercado Pago" passa a aparecer no painel do lojista.

### 4. Cada lojista conecta (uma vez)
No painel (web `/lojista/config` ou app → Configurações da loja), o lojista clica em
**"Conectar Mercado Pago"**, autoriza, e pronto. A partir daí recebe automático.

> Enquanto a loja **não** conectar, ela **não recebe pedidos** (bloqueio de segurança pra
> evitar dinheiro na conta errada).

## Endpoints (referência)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/stores/mp/status` | Status da conexão (enabled/connected) |
| GET | `/api/stores/mp/connect` | Retorna a URL de autorização |
| GET | `/api/stores/mp/callback` | Callback do MP (troca o code, salva o token) |
| GET | `/api/stores/mp/disconnect` | Desconecta a conta |

Tokens do lojista são renovados automaticamente (refresh) antes de cada cobrança.

---

## Repasse automático ao ENTREGADOR (split 1:N) — opcional

O split da venda é **2 vias** (loja + plataforma), e o entregador só é definido **depois** do
pagamento. Por isso o repasse ao entregador acontece **na entrega**, transferindo a taxa dele
da conta da plataforma pra conta MP do entregador.

Isso usa o modelo **1:N (Advanced Payments)** do Mercado Pago, que **exige aprovação comercial**
(falar com o time do MP). Está tudo pronto no código, atrás de uma flag:

| Variável | Valor |
|---|---|
| `MERCADO_PAGO_ADVANCED` | `true` (liga o repasse automático ao entregador) |

Enquanto `MERCADO_PAGO_ADVANCED` **não** for `true`:
- o entregador continua recebendo pela **carteira + saque PIX** (fluxo atual);
- o card "Conectar Mercado Pago" **não aparece** no app do entregador.

Quando ligar (após aprovação 1:N do MP):
- cada entregador conecta a conta MP dele (app → Carteira → "Conectar Mercado Pago");
- endpoints: `GET /couriers/mp/status | connect | disconnect` (callback compartilhado em `/stores/mp/callback`);
- na entrega, `MpOauthService.payoutCourier()` transfere a taxa direto pra conta dele.

> ⚠️ **Ponto único a finalizar com o MP:** a chamada exata de transferência em
> `payoutCourier()` (endpoint de disbursement/transferência do modelo 1:N). Até confirmar,
> o método retorna `done:false` e o valor cai na carteira (nada é movimentado "no escuro").

### Tokens criptografados
Os access/refresh tokens do MP (loja e entregador) são guardados **criptografados**
(AES-256-GCM). Defina `MP_ENCRYPTION_KEY` (32 bytes hex/base64) — senão é derivada do `JWT_SECRET`.
