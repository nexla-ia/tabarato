import { Injectable } from '@nestjs/common'

@Injectable()
export class PushService {
  async send(expoPushToken: string, title: string, body: string, data?: Record<string, any>) {
    if (!expoPushToken?.startsWith('ExponentPushToken')) return

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to: expoPushToken,
          sound: 'default',
          title,
          body,
          data: data ?? {},
        }),
      })
    } catch {
      // Push is best-effort — never throw
    }
  }
}
