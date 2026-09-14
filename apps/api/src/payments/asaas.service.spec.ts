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

  describe('flags de entrada (money-in)', () => {
    it('pixInEnabled: exige key E flag ligada', () => {
      expect(makeAsaas({ ASAAS_API_KEY: 'x', ASAAS_PIX_ENABLED: 'true' }).pixInEnabled).toBe(true)
      expect(makeAsaas({ ASAAS_API_KEY: 'x' }).pixInEnabled).toBe(false)
      expect(makeAsaas({ ASAAS_PIX_ENABLED: 'true' }).pixInEnabled).toBe(false)
    })
    it('cardInEnabled: exige key E flag ligada', () => {
      expect(makeAsaas({ ASAAS_API_KEY: 'x', ASAAS_CARD_ENABLED: 'true' }).cardInEnabled).toBe(true)
      expect(makeAsaas({ ASAAS_API_KEY: 'x' }).cardInEnabled).toBe(false)
    })
  })

  describe('cobrança (money-in)', () => {
    const OK = (body: any) => ({ ok: true, json: async () => body })
    let fetchSpy: jest.SpyInstance
    afterEach(() => fetchSpy?.mockRestore())

    it('createCustomer envia name+cpfCnpj (dígitos) e devolve o id', async () => {
      fetchSpy = jest.spyOn(global as any, 'fetch').mockResolvedValue(OK({ id: 'cus_1' }) as any)
      const a = makeAsaas({ ASAAS_API_KEY: 'k' })
      const r = await a.createCustomer({ name: 'Fulano', cpfCnpj: '123.456.789-00', email: 'a@b.c' })
      expect(r.id).toBe('cus_1')
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('/customers')
      const sent = JSON.parse((init as any).body)
      expect(sent.cpfCnpj).toBe('12345678900')
      expect((init as any).headers.access_token).toBe('k')
    })

    it('createPixCharge manda billingType PIX + externalReference = orderId', async () => {
      fetchSpy = jest.spyOn(global as any, 'fetch').mockResolvedValue(OK({ id: 'pay_1', status: 'PENDING' }) as any)
      const a = makeAsaas({ ASAAS_API_KEY: 'k' })
      const r = await a.createPixCharge({ customerId: 'cus_1', value: 12.3, orderId: 'ord-9', description: 'x' })
      expect(r).toEqual({ id: 'pay_1', status: 'PENDING' })
      const sent = JSON.parse(fetchSpy.mock.calls[0][1].body)
      expect(sent.billingType).toBe('PIX')
      expect(sent.externalReference).toBe('ord-9')
      expect(sent.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('getPixQrCode devolve payload + imagem', async () => {
      fetchSpy = jest.spyOn(global as any, 'fetch').mockResolvedValue(OK({ encodedImage: 'BASE64', payload: '00020126...' }) as any)
      const a = makeAsaas({ ASAAS_API_KEY: 'k' })
      const r = await a.getPixQrCode('pay_1')
      expect(r).toEqual({ encodedImage: 'BASE64', payload: '00020126...' })
    })

    it('createCardCharge com parcelas manda installmentCount + totalValue', async () => {
      fetchSpy = jest.spyOn(global as any, 'fetch').mockResolvedValue(OK({ id: 'pay_2', status: 'CONFIRMED' }) as any)
      const a = makeAsaas({ ASAAS_API_KEY: 'k' })
      const r = await a.createCardCharge({
        customerId: 'cus_1', value: 100, orderId: 'ord-1', installmentCount: 3,
        creditCard: { holderName: 'F', number: '5162 3062 1810 0001', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
        creditCardHolderInfo: { name: 'F', email: 'a@b.c', cpfCnpj: '12345678900', postalCode: '76980000', addressNumber: '10' },
      })
      expect(r.status).toBe('CONFIRMED')
      const sent = JSON.parse(fetchSpy.mock.calls[0][1].body)
      expect(sent.installmentCount).toBe(3)
      expect(sent.totalValue).toBe(100)
      expect(sent.value).toBeUndefined()
      expect(sent.creditCard.number).toBe('5162306218100001') // só dígitos
    })

    it('createCardCharge à vista manda value (sem parcelas)', async () => {
      fetchSpy = jest.spyOn(global as any, 'fetch').mockResolvedValue(OK({ id: 'pay_3', status: 'CONFIRMED' }) as any)
      const a = makeAsaas({ ASAAS_API_KEY: 'k' })
      await a.createCardCharge({
        customerId: 'cus_1', value: 50, orderId: 'ord-1', installmentCount: 1,
        creditCard: { holderName: 'F', number: '1', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
        creditCardHolderInfo: { name: 'F', email: 'a@b.c', cpfCnpj: '1', postalCode: '1', addressNumber: '1' },
      })
      const sent = JSON.parse(fetchSpy.mock.calls[0][1].body)
      expect(sent.value).toBe(50)
      expect(sent.installmentCount).toBeUndefined()
    })

    it('propaga a descrição do erro do Asaas quando !ok', async () => {
      fetchSpy = jest.spyOn(global as any, 'fetch').mockResolvedValue({
        ok: false, status: 400, json: async () => ({ errors: [{ description: 'Transação não autorizada.' }] }),
      } as any)
      const a = makeAsaas({ ASAAS_API_KEY: 'k' })
      await expect(a.createPixCharge({ customerId: 'c', value: 1, orderId: 'o' }))
        .rejects.toThrow('Transação não autorizada.')
    })
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
