# Deploy da Plataforma Web (Railway)

App Next.js 15 (consumidor + lojista) que consome a API do Tá Barato.
Já vem pronto pra Railway: `output: standalone`, usa `$PORT` e tem `railway.json`.

## Passo a passo

### 1. Criar o serviço no Railway
1. No projeto **perfect-enchantment** do Railway → **New → GitHub Repo** → `nexla-ia/tabarato`.
2. Em **Settings → Root Directory**, defina: `apps/web`
   - Isso faz o Railway buildar só a pasta do web (monorepo).
3. Build e start já vêm do `railway.json`:
   - Build: `npm run build`
   - Start: `npm start` (que roda `next start -p $PORT`)

### 2. Variáveis de ambiente do serviço web
Em **Variables**, adicione:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api-production-b730d.up.railway.app/api` |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | *(a mesma chave pública do Mercado Pago usada no app)* |

> As `NEXT_PUBLIC_*` são embutidas no build — se mudar, precisa rebuildar.

### 3. Gerar o domínio
Em **Settings → Networking → Generate Domain**. Anote a URL (ex.: `https://web-production-xxxx.up.railway.app`).

### 4. Liberar o domínio no CORS da API
No serviço **api** do Railway, adicione/edite a variável:

```
ALLOWED_ORIGINS=https://web-production-xxxx.up.railway.app
```

- Pode listar vários separados por vírgula.
- Esses domínios são **somados** aos defaults (admin/localhost continuam funcionando).
- Depois, faça um redeploy da API pra aplicar.

### 5. Testar
- Acesse a URL do web.
- **Consumidor:** criar conta → navegar lojas → carrinho → checkout.
- **Lojista:** `/cadastro-loja` (ou logar com uma loja existente) → cai em `/lojista` → pedidos/produtos/config.

## Ambiente de homologação (opcional)
Para ter um staging separado (entregável "ambiente de homologação" do contrato):
- Duplique o serviço apontando pra branch `homolog` (ou use os *Environments* do Railway),
- Aponte `NEXT_PUBLIC_API_URL` para uma API de homologação, se houver.

## Rodar local
```bash
cd apps/web
npm install
cp .env.example .env.local   # ajuste os valores
npm run dev                  # http://localhost:3000
```
