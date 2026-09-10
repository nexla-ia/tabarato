import { AsaasService } from './asaas.service'

function makeAsaas(env: Record<string, string | undefined>) {
  const config = { get: (k: string) => env[k] }
  return new AsaasService(config as any)
}

describe('AsaasService', () => {
  it('enabled só quando há ASAAS_API_KEY', () => {
    expect(makeAsaas({ ASAAS_API_KEY: 'x' }).enabled).toBe(true)
    expect(makeAsaas({}).enabled).toBe(false)
  })

  describe('isWebhookAuthorized', () => {
    it('sem token configurado → libera (dev/sandbox)', () => {
      expect(makeAsaas({}).isWebhookAuthorized('qualquer')).toBe(true)
    })
    it('com token → só o correto passa', () => {
      const a = makeAsaas({ ASAAS_WEBHOOK_TOKEN: 'secret' })
      expect(a.isWebhookAuthorized('secret')).toBe(true)
      expect(a.isWebhookAuthorized('errado')).toBe(false)
      expect(a.isWebhookAuthorized(undefined)).toBe(false)
    })
  })
})
