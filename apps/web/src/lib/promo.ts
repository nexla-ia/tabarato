// Desconto progressivo "Leve X Pague Y" — espelha a regra do backend
// (orders.service.promoDiscountFor) pra exibir rótulos e prévia de economia na web.

export function promoLabel(buyQty?: number | null, payQty?: number | null): string | null {
  if (!buyQty || !payQty || buyQty < 2 || buyQty <= payQty) return null
  return `Leve ${buyQty} Pague ${payQty}`
}

export function promoFreeUnits(quantity: number, buyQty?: number | null, payQty?: number | null): number {
  if (!buyQty || !payQty || buyQty < 2 || buyQty <= payQty || quantity < buyQty) return 0
  return Math.floor(quantity / buyQty) * (buyQty - payQty)
}

// Valor (R$) economizado num item, dado quantidade e preço unitário.
export function promoDiscountFor(
  quantity: number,
  unitPrice: number,
  buyQty?: number | null,
  payQty?: number | null,
): number {
  return Math.round(promoFreeUnits(quantity, buyQty, payQty) * unitPrice * 100) / 100
}
