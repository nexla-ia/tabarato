import { useRef } from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'

/**
 * WebView invisível que roda o security.js do Mercado Pago para gerar o
 * "device fingerprint" (MP_DEVICE_SESSION_ID). Esse id é enviado ao backend
 * e repassado ao MP no header X-Meli-Session-Id — é o dado que MAIS reduz o
 * "cc_rejected_high_risk" do antifraude. Sem ele, integração nova toma recusa
 * em quase todo cartão.
 *
 * Monte este componente assim que a tela de checkout abrir, para o id já estar
 * pronto quando o cliente finalizar o pagamento.
 */
const HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<script src="https://www.mercadopago.com/v2/security.js" view="checkout"></script>
<script>
  (function () {
    var tries = 0;
    function post(id){ try { window.ReactNativeWebView.postMessage(id || ''); } catch (e) {} }
    function check(){
      tries++;
      var id = window.MP_DEVICE_SESSION_ID;
      if (id) { post(id); return; }
      if (tries > 40) { post(''); return; } // ~12s: desiste e segue sem o id
      setTimeout(check, 300);
    }
    check();
  })();
</script>
</body>
</html>`

export function MpDeviceWebView({ onDeviceId }: { onDeviceId: (id: string) => void }) {
  const done = useRef(false)
  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        source={{ html: HTML, baseUrl: 'https://www.mercadopago.com' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => {
          const id = e.nativeEvent.data
          if (id && !done.current) {
            done.current = true
            onDeviceId(id)
          }
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // 1x1 fora da tela: alguns WebViews Android não executam timers com tamanho 0.
  hidden: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
})
