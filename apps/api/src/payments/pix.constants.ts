// Prazo pra pagar um código PIX gerado no checkout. Usado tanto na cobrança
// em si (date_of_expiration mandado ao Mercado Pago) quanto no Payment local
// (pixExpiresAt, que o front usa pro cronômetro e o PixExpirationService usa
// pra saber quando cancelar automaticamente um pedido não pago).
export const PIX_EXPIRATION_MINUTES = 10
export const PIX_EXPIRATION_MS = PIX_EXPIRATION_MINUTES * 60 * 1000
