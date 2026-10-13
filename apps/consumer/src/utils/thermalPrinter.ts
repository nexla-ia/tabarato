/**
 * Thermal printer utility using react-native-bluetooth-escpos-printer.
 * Requires EAS Build — not available in Expo Go.
 */

let BluetoothManager: any = null
let BluetoothEscposPrinter: any = null

async function loadModules() {
  if (BluetoothManager) return true
  try {
    const mod = await import('react-native-bluetooth-escpos-printer')
    BluetoothManager = mod.BluetoothManager
    BluetoothEscposPrinter = mod.BluetoothEscposPrinter
    return true
  } catch {
    return false
  }
}

export interface PrintableOrder {
  id: string
  clientName: string
  address: string
  items: { name: string; qty: number; price: number; notes?: string }[]
  subtotal: number
  deliveryFee: number
  discount: number
  total: number
  paymentMethod: string
  notes?: string
  scheduledFor?: string
  createdAt: string
}

function formatOrderTicket(order: PrintableOrder): string {
  const line = '--------------------------------'
  const date = new Date(order.createdAt).toLocaleString('pt-BR')
  const id = `#${order.id.slice(-8).toUpperCase()}`

  let text = `
TÁ BARATO — COMPROVANTE
${line}
Pedido: ${id}
Data: ${date}
${order.scheduledFor ? `AGENDADO: ${new Date(order.scheduledFor).toLocaleString('pt-BR')}` : ''}
${line}
CLIENTE: ${order.clientName}
ENTREGA: ${order.address}
${line}
ITENS:
`
  for (const item of order.items) {
    text += `${item.qty}x ${item.name}\n`
    if (item.notes) text += `  Obs: ${item.notes}\n`
    text += `  R$ ${(item.qty * item.price).toFixed(2)}\n`
  }
  text += `${line}
Subtotal:     R$ ${order.subtotal.toFixed(2)}
Entrega:      R$ ${order.deliveryFee.toFixed(2)}
${order.discount > 0 ? `Desconto:    -R$ ${order.discount.toFixed(2)}\n` : ''}TOTAL:        R$ ${order.total.toFixed(2)}
Pagamento:    ${order.paymentMethod}
${line}
Obrigado pela preferência!
`
  return text
}

export async function scanPrinters(): Promise<{ name: string; address: string }[]> {
  const ok = await loadModules()
  if (!ok) throw new Error('Impressora térmica não disponível no Expo Go. Use um build EAS.')

  await BluetoothManager.enableBluetooth()
  const devices = await BluetoothManager.scanDevices()
  const found = JSON.parse(devices)
  return (found.found ?? []).map((d: any) => ({ name: d.name ?? d.address, address: d.address }))
}

export async function connectPrinter(address: string): Promise<void> {
  const ok = await loadModules()
  if (!ok) throw new Error('Impressora não disponível no Expo Go.')
  await BluetoothManager.connect(address)
}

export async function printOrder(order: PrintableOrder): Promise<void> {
  const ok = await loadModules()
  if (!ok) throw new Error('Impressora não disponível no Expo Go. Use um build EAS.')

  const text = formatOrderTicket(order)
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER)
  await BluetoothEscposPrinter.printText(text, {})
  await BluetoothEscposPrinter.printText('\n\n\n', {})
}
