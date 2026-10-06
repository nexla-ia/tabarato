import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Callout, LegalTable } from '@/components/LegalPage'
import { EMPRESA, TERMOS_LOJISTA_VERSAO, brl, buscarPrecos, pendente } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Termos do Lojista — Tá Barato',
  description: 'Regras de venda, repasse, saque e sanções para as lojas cadastradas no Tá Barato.',
}

/**
 * Anexo dos Termos de Uso, só para quem vende.
 *
 * Existe separado porque a loja é a parte com mais obrigações e é a única que
 * aceita uma comissão — enfiar isso em sete bullets dentro do documento do
 * consumidor era o que havia antes, e não dava conta nem do repasse nem do saque.
 *
 * ⚠️ RASCUNHO — descreve fielmente o comportamento do sistema em 06/10/2026, mas
 * NÃO passou por revisão jurídica. As cláusulas marcadas com "pendente de
 * definição" são exatamente as que dependem de decisão do advogado.
 */
export default async function TermosLojistaPage() {
  const razao = pendente(EMPRESA.razaoSocial, 'razão social')
  const email = pendente(EMPRESA.emailContato, 'e-mail de contato')
  const { precos, aoVivo } = await buscarPrecos()

  return (
    <LegalPage
      title="Termos do Lojista"
      versao={TERMOS_LOJISTA_VERSAO}
      outro={{ href: '/termos', label: 'Voltar aos Termos de Uso' }}
    >
      <p>
        Este documento é um <strong>anexo dos <Link href="/termos">Termos de Uso</Link></strong> e
        vale para quem cadastra uma loja no <strong>Tá Barato</strong>, plataforma operada por{' '}
        {razao}. Ao criar a loja, e ao continuar vendendo depois de um aviso de alteração, você
        concorda com o que está escrito aqui.
      </p>
      <p>
        Onde este anexo e os Termos de Uso divergirem sobre a relação entre a loja e a plataforma,
        prevalece este anexo. Tudo que diz respeito ao consumidor continua regido pelos Termos de
        Uso e pelo Código de Defesa do Consumidor.
      </p>

      <h2>1. O papel de cada um</h2>
      <p>
        <strong>Quem vende é a loja.</strong> Ela escolhe o que anunciar, escreve a descrição,
        define o preço, controla o estoque e prepara o pedido. A plataforma oferece a vitrine,
        processa o pagamento, organiza a entrega e repassa o valor devido.
      </p>
      <Callout>
        <p>
          Perante o consumidor, <strong>a loja é a fornecedora</strong>. Garantia, vício do produto,
          informação correta, troca e devolução são responsabilidade dela. A plataforma não
          fabrica, não estoca e não inspeciona previamente os produtos anunciados.
        </p>
      </Callout>

      <h2>2. Cadastro e aprovação</h2>
      <ul>
        <li>
          O cadastro exige <strong>CNPJ ativo</strong> (inclusive MEI), documento da empresa (Cartão
          CNPJ ou CCMEI), endereço e telefone.
        </li>
        <li>
          A loja nasce <strong>pendente</strong> e não aparece no marketplace até ser aprovada. A
          análise confere se o CNPJ é da pessoa que está cadastrando — a medida existe para impedir
          loja falsa aberta com CNPJ de terceiro.
        </li>
        <li>
          Os dados precisam ser verdadeiros e atualizados. Mudou endereço, telefone ou titularidade,
          atualize no painel.
        </li>
        <li>Uma conta de lojista corresponde a uma loja.</li>
      </ul>

      <h2>3. Anúncios</h2>
      <ul>
        <li>
          O anúncio deve descrever o produto com precisão: nome, descrição, foto real, preço,
          variações e <strong>estoque disponível de verdade</strong>. Anunciar o que não se tem gera
          cancelamento e afeta a avaliação da loja.
        </li>
        <li>
          É proibido anunciar produto ilícito, falsificado, furtado, sem a certificação exigida por
          lei (Anvisa, Inmetro, Anatel, quando aplicável) ou vedado pelos Termos de Uso.
        </li>
        <li>
          A foto e o texto precisam ser seus ou de uso autorizado. Anúncio que viole marca, direito
          autoral ou imagem de terceiro é removido.
        </li>
        <li>
          O preço anunciado é o preço cobrado. Não é permitido anunciar um valor e condicionar a
          venda a outro, nem cobrar diferença por fora.
        </li>
      </ul>
      <p>
        <strong>Moderação.</strong> A plataforma pode bloquear um anúncio específico que viole estas
        regras, sem que isso afete os demais produtos nem a conta. O bloqueio{' '}
        <strong>sempre vem com o motivo</strong>, visível no painel da loja, e pode ser contestado
        pelo {email}. Corrigido o problema, o produto pode ser reenviado para análise.
      </p>

      <h2>4. Pedidos</h2>
      <ul>
        <li>
          Chegando o pedido, a loja confirma e prepara dentro do tempo de preparo que ela mesma
          declarou. Esse tempo alimenta a estimativa mostrada ao cliente.
        </li>
        <li>
          Na <strong>entrega</strong>, um entregador da plataforma coleta na loja e leva ao cliente.
          A loja não precisa ter entregador próprio.
        </li>
        <li>
          Na <strong>retirada</strong>, o cliente busca no balcão. A loja conclui o pedido digitando
          o <strong>código de retirada</strong> que o cliente mostra. Esse código é do cliente — a
          loja não tem acesso a ele antes, e não deve concluir o pedido sem conferi-lo.
        </li>
        <li>
          Pedidos acima de <strong>{brl(precos.maxDeliveryValue)}</strong> em produtos só podem ser
          retirados na loja. A entrega por entregador fica indisponível nessa faixa.
        </li>
        <li>
          A loja pode pausar o recebimento de pedidos e definir horário de funcionamento. Ficar com
          a loja aberta sem conseguir atender gera cancelamento e prejudica a avaliação.
        </li>
      </ul>

      <h2>5. Comissão e o que a loja absorve</h2>
      <p>
        Sobre o valor dos produtos incide a <strong>comissão de{' '}
        {precos.platformCommissionPct}%</strong>. O que a loja recebe por pedido concluído é:
      </p>
      <LegalTable
        head={['Componente', 'Efeito no repasse da loja']}
        rows={[
          ['Valor dos produtos', 'Base do cálculo'],
          ['− Cupom de desconto da loja', 'Descontado (a oferta é dela)'],
          ['− Promoção "Leve X, pague Y"', 'Descontado (a oferta é dela)'],
          [`− Comissão de ${precos.platformCommissionPct}%`, 'Descontada'],
          ['− Taxa de entrega, só em cupom de frete grátis', 'Descontada (a loja absorve o frete que ofereceu)'],
          ['Desconto de pontos de fidelidade', 'NÃO desconta — quem banca é a plataforma'],
        ]}
      />
      <Callout>
        <p>
          A taxa de entrega paga pelo cliente <strong>não passa pela loja</strong> e não entra no
          cálculo acima, salvo no caso de cupom de frete grátis oferecido pela própria loja. A
          remuneração do entregador é paga pela plataforma.
        </p>
      </Callout>
      {!aoVivo && (
        <Callout>
          <p>
            Não conseguimos consultar as taxas vigentes agora. Os valores citados nesta página são
            os da última atualização conhecida — os vigentes aparecem sempre no painel da loja.
          </p>
        </Callout>
      )}
      <p>
        A comissão e as taxas podem ser alteradas. Alteração que aumente a comissão é avisada com
        antecedência no painel, e a loja pode encerrar a operação antes de a mudança valer, sem
        penalidade e sem perder o saldo já acumulado.
      </p>

      <h2>6. Repasse</h2>
      <p>
        O cliente paga à plataforma, não à loja. O valor da loja é creditado na{' '}
        <strong>carteira dela dentro do Tá Barato</strong>, e de lá é sacado por PIX.
      </p>
      <ul>
        <li>
          <strong>Quando credita:</strong> no momento em que o pedido é <strong>concluído</strong> —
          entrega confirmada pelo entregador, ou retirada confirmada pela loja. Não credita no
          pagamento, e não credita em pedido cancelado.
        </li>
        <li>
          <strong>Pedido não pago não gera crédito.</strong> Se o pagamento não foi confirmado,
          nada é creditado ainda que o pedido tenha sido entregue.
        </li>
        <li>
          Cada crédito aparece no extrato da carteira identificado pelo número do pedido, e o
          extrato pode ser consultado e exportado a qualquer momento no painel.
        </li>
      </ul>

      <h2>7. Saque</h2>
      <ul>
        <li>
          O saque é feito pela loja, quando ela quiser, pelo valor que quiser até o saldo
          disponível. <strong>Não há valor mínimo e não cobramos taxa de saque.</strong>
        </li>
        <li>
          É preciso ter uma <strong>chave PIX cadastrada</strong> no painel. O PIX é enviado para
          essa chave, e só para ela — não enviamos repasse para conta de terceiro.
        </li>
        <li>
          Pedido o saque, o valor sai do saldo na hora e o PIX é enviado em seguida, normalmente em
          instantes. Enquanto o envio não é confirmado, o saque aparece como em processamento.
        </li>
        <li>
          <strong>Se o envio falhar, o valor volta para o saldo</strong> e o saque aparece como não
          concluído, com o motivo. Nenhum valor fica retido por falha nossa ou da operadora.
        </li>
        <li>
          Chave PIX errada ou de titularidade diferente pode fazer o PIX ser rejeitado ou cair na
          conta errada. Conferir a chave é responsabilidade da loja.
        </li>
      </ul>

      <h2>8. Cancelamento e estorno</h2>
      <ul>
        <li>
          O cliente pode cancelar enquanto o pedido não entrou em preparo. Depois disso, o
          cancelamento depende da loja.
        </li>
        <li>
          A loja pode cancelar, informando o motivo, até o entregador coletar o pedido. Cancelamento
          frequente por falta de estoque é tratado como descumprimento destas regras.
        </li>
        <li>
          Todo cancelamento devolve o dinheiro ao cliente. Como o crédito da loja só acontece na
          conclusão do pedido, <strong>cancelamento não gera cobrança retroativa</strong> contra a
          loja.
        </li>
        <li>
          O estoque e os benefícios usados no pedido (cupom e pontos) voltam automaticamente.
        </li>
      </ul>

      <h2>9. Contestação de pagamento</h2>
      <Callout>
        <p>
          <strong>Cláusula pendente de definição jurídica.</strong> Quando um pagamento em cartão é
          contestado pelo portador depois que o pedido já foi concluído e a loja já foi creditada, a
          operadora pode reverter o valor junto à plataforma. A regra sobre quem suporta essa perda,
          e em que condições, ainda será definida e passará a constar aqui antes de ser aplicada.
          Até lá, nenhum valor é debitado da loja por esse motivo.
        </p>
      </Callout>
      <p>
        Em qualquer contestação, a loja se compromete a fornecer, quando solicitada, as informações
        do pedido que ajudem a comprovar a entrega — comprovação de preparo, conferência do código e
        registro do atendimento.
      </p>

      <h2>10. Avaliações</h2>
      <p>
        Clientes avaliam a loja depois de receber o pedido, com nota, comentário e fotos. As
        avaliações são públicas, ficam visíveis no painel da loja e entram na nota média exibida no
        marketplace.
      </p>
      <p>
        A loja não pode condicionar atendimento, desconto ou brinde a uma avaliação positiva, nem
        pedir a remoção de avaliação verdadeira. Avaliação com ofensa, dado pessoal de terceiro ou
        conteúdo claramente falso pode ser removida mediante denúncia.
      </p>

      <h2>11. Dados dos clientes</h2>
      <p>
        Para atender o pedido, a loja recebe nome, telefone e endereço do cliente. Esses dados são
        confiados para aquela finalidade e nada além dela.
      </p>
      <ul>
        <li>
          Não podem ser usados para marketing próprio, lista de transmissão, cadastro paralelo ou
          qualquer contato fora do pedido.
        </li>
        <li>Não podem ser repassados, vendidos ou cedidos a terceiros.</li>
        <li>
          Devem ser descartados quando não forem mais necessários para a venda e para as obrigações
          legais da loja.
        </li>
      </ul>
      <p>
        A loja responde pelo uso que faz desses dados, inclusive perante a LGPD. Incidente que
        envolva dados de clientes recebidos pela plataforma deve ser comunicado pelo {email}.
      </p>

      <h2>12. Comunicação</h2>
      <p>
        A conversa com o cliente acontece no chat do pedido. Direcionar o cliente para fechar por
        fora — PIX direto para a loja, venda por aplicativo de mensagem, dinheiro na entrega — é
        <strong> infração grave</strong>: tira o cliente de qualquer proteção, e sujeita a loja às
        sanções desta seção.
      </p>

      <h2>13. Sanções</h2>
      <p>
        Conforme a gravidade e a reincidência, a plataforma pode advertir, remover anúncio,
        restringir funcionalidade, suspender temporariamente ou encerrar a loja.
      </p>
      <Callout>
        <p>
          <strong>Toda sanção vem com o motivo</strong>, visível no painel, e com o caminho para
          contestar pelo {email}. <strong>Saldo já devido à loja não é retido pela sanção</strong> —
          loja suspensa continua podendo sacar o que já ganhou.
        </p>
      </Callout>

      <h2>14. Encerramento</h2>
      <p>
        A loja pode encerrar a operação quando quiser, solicitando pelo {email}. Pedidos já pagos
        e em andamento precisam ser concluídos ou cancelados com estorno antes do encerramento, e o
        saldo remanescente deve ser sacado para a chave PIX cadastrada.
      </p>

      <h2>15. Alterações deste anexo</h2>
      <p>
        Este documento pode ser alterado para refletir mudanças no serviço ou na lei. A versão
        vigente fica sempre nesta página, com data e número de versão no topo. Mudanças relevantes
        são avisadas no painel da loja, e{' '}
        <strong>pode ser exigido um novo aceite para continuar vendendo</strong> — registramos qual
        versão foi aceita e quando.
      </p>

      <h2>16. Lei aplicável e foro</h2>
      <p>
        Aplica-se a lei brasileira. Para as questões entre a loja e a plataforma — relação entre
        empresas, não de consumo — fica eleito o foro de {EMPRESA.cidadeForo} — {EMPRESA.ufForo}.
      </p>
      <p>
        Sobre o tratamento de dados, veja a <Link href="/privacidade">Política de Privacidade</Link>.
      </p>
    </LegalPage>
  )
}
