// Beep de notificação gerado via Web Audio API — sem depender de arquivo de áudio.
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

function tone(c: AudioContext, freq: number, start: number, duration: number, peak: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, c.currentTime + start)
  gain.gain.linearRampToValueAtTime(peak, c.currentTime + start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(c.currentTime + start)
  osc.stop(c.currentTime + start + duration + 0.05)
}

// Dois tons ascendentes, tipo "ding-ding" de novo pedido.
export function playNewOrderSound() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  tone(c, 880, 0, 0.18, 0.22)
  tone(c, 1175, 0.16, 0.22, 0.22)
}

// Três bips graves — pedido "Aguardando" passou do prazo de confirmação.
// Grave + repetido de propósito, pra soar mais urgente que o de pedido novo.
export function playLateOrderAlert() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  tone(c, 660, 0, 0.14, 0.26)
  tone(c, 660, 0.2, 0.14, 0.26)
  tone(c, 660, 0.4, 0.18, 0.26)
}
