// A rota /cart usa a MESMA tela de carrinho da aba (multi-loja, agrupada por loja).
// Reexporta pra não duplicar a UI nem divergir os dois arquivos.
export { default } from './(tabs)/cart'
