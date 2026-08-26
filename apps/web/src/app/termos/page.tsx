import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Callout, LegalTable } from '@/components/LegalPage'
import { EMPRESA, REGRAS, TERMOS_VERSAO, pendente } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Termos de Uso — Tá Barato',
  description: 'Regras de uso da plataforma Tá Barato para clientes, lojistas e entregadores.',
}

/**
 * RASCUNHO — o texto descreve fielmente o comportamento do app em 26/08/2026,
 * mas não passou por revisão jurídica. Ver comentário em src/lib/legal.ts.
 *
 * Ao mudar regra de negócio (comissão, taxa de entrega, pontos), atualize
 * src/lib/legal.ts — os números daqui vêm de lá justamente pra não desencontrar
 * do que a API cobra de fato.
 */
export default function TermosPage() {
  const razao = pendente(EMPRESA.razaoSocial, 'razão social')
  const cnpj = pendente(EMPRESA.cnpj, 'CNPJ')
  const email = pendente(EMPRESA.emailContato, 'e-mail de contato')

  return (
    <LegalPage
      title="Termos de Uso"
      versao={TERMOS_VERSAO}
      outro={{ href: '/privacidade', label: 'Ler a Política de Privacidade' }}
    >
      <p>
        Estes Termos regem o uso do <strong>Tá Barato</strong>, plataforma operada por {razao},
        inscrita no CNPJ {cnpj}, com sede em {EMPRESA.endereco}. Ao criar uma conta, fazer um
        pedido, cadastrar uma loja ou realizar entregas, você concorda com o que está escrito aqui.
      </p>
      <p>
        Se não concordar com alguma parte, não use a plataforma. Dúvidas sobre qualquer item:{' '}
        {email}.
      </p>

      <h2>1. O que é o Tá Barato</h2>
      <p>
        O Tá Barato é um marketplace local de entrega em {EMPRESA.endereco}. Ele conecta três
        grupos de pessoas:
      </p>
      <ul>
        <li><strong>Clientes</strong>, que compram produtos das lojas cadastradas;</li>
        <li><strong>Lojistas</strong>, que anunciam e vendem seus próprios produtos;</li>
        <li><strong>Entregadores</strong>, que levam o pedido da loja até o cliente.</li>
      </ul>
      <p>
        Quem vende o produto é a loja — ela define o que anuncia, a descrição, o preço e o estoque.
        O Tá Barato oferece a vitrine, processa o pagamento e organiza a entrega. Nós não
        fabricamos, não estocamos e não inspecionamos previamente os produtos anunciados.
      </p>
      <Callout>
        <p>
          Isso não afasta os seus direitos como consumidor. O Código de Defesa do Consumidor
          continua valendo integralmente para a sua compra, e nós participamos da relação como
          intermediários do pagamento e da entrega.
        </p>
      </Callout>

      <h2>2. Conta e cadastro</h2>
      <ul>
        <li>É preciso ter 18 anos ou mais. Menores só com assistência do responsável legal.</li>
        <li>
          Os dados informados devem ser verdadeiros e atualizados — nome, e-mail e telefone para
          clientes; CNPJ ativo para lojas; CPF, CNH e documentos do veículo para entregadores.
        </li>
        <li>
          A conta é pessoal. Você responde pelo que acontece nela, inclusive por uso indevido da
          senha. Se suspeitar de acesso não autorizado, troque a senha imediatamente.
        </li>
        <li>
          Você pode entrar com e-mail e senha ou com sua conta Google. No login com Google
          recebemos apenas nome, e-mail e foto de perfil.
        </li>
        <li>
          Manter mais de uma conta para burlar limites de cupom, pontos ou indicação é proibido e
          leva ao cancelamento dos benefícios.
        </li>
      </ul>

      <h2>3. Como funciona um pedido</h2>
      <p>
        Você monta o carrinho, escolhe o endereço de entrega e paga. Se o carrinho tiver itens de
        lojas diferentes, geramos um pedido para cada loja — um único pagamento pode cobrir todos.
      </p>
      <p>
        A loja confirma e prepara o pedido; em seguida um entregador da plataforma faz a coleta e
        leva até o endereço informado. Você acompanha cada etapa pelo app e pode falar com a loja
        no chat do próprio pedido.
      </p>
      <p>
        Na entrega, você informa ao entregador o <strong>código de entrega</strong> que aparece no
        seu pedido. Ele confirma que o pedido chegou a quem devia.
      </p>
      <p>
        Os tempos exibidos (preparo e deslocamento) são <strong>estimativas</strong>, calculadas a
        partir do tempo de preparo declarado pela loja e da distância até o endereço. Atrasos podem
        acontecer por fatores fora do nosso controle, como trânsito, clima e volume de pedidos.
      </p>

      <h2>4. Preços, taxas e pagamento</h2>
      <p>
        O preço dos produtos é definido pela loja. Sobre ele incidem a taxa de entrega e eventuais
        descontos, tudo detalhado na tela de pagamento antes de você confirmar.
      </p>
      <LegalTable
        head={['Item', 'Como é calculado', 'Quem paga']}
        rows={[
          ['Produtos', 'Preço definido pela loja', 'Cliente'],
          [
            'Taxa de entrega',
            `R$ ${REGRAS.entregaBase} + R$ ${REGRAS.entregaPorKm} por km entre a loja e o endereço`,
            'Cliente (repassada ao entregador)',
          ],
          [
            'Comissão da plataforma',
            `${REGRAS.comissaoPlataformaPct}% sobre o valor dos produtos`,
            'Loja',
          ],
        ]}
      />
      <p>
        Aceitamos <strong>PIX, cartão de crédito e cartão de débito</strong>, processados pelo
        Mercado Pago. Os dados do seu cartão são tratados diretamente por ele — não guardamos
        número de cartão nos nossos servidores.
      </p>
      <p>
        O valor é dividido automaticamente no momento do pagamento: a loja recebe o valor dos
        produtos menos a comissão, o entregador recebe a taxa de entrega e a plataforma retém a
        comissão.
      </p>
      <Callout>
        <p>
          <strong>Pague sempre dentro da plataforma.</strong> Combinar pagamento por fora — PIX
          direto para a loja ou para o entregador, dinheiro na entrega — tira você de qualquer
          proteção que possamos oferecer, e é conduta passível de sanção para quem propõe.
        </p>
      </Callout>

      <h2>5. Cupons, pontos e indicações</h2>
      <ul>
        <li>
          <strong>Pontos:</strong> você acumula {REGRAS.pontosPorReal} ponto por R$ 1,00 em
          produtos. Os pontos entram na sua conta quando o pedido é <strong>entregue</strong> — não
          no pagamento. A cada {REGRAS.pontosParaDesconto} pontos você troca por R${' '}
          {REGRAS.descontoPorLote},00 de desconto.
        </li>
        <li>
          <strong>Indicação:</strong> quem indica e quem foi indicado ganham{' '}
          {REGRAS.bonusIndicacao} pontos cada, creditados apenas quando o indicado tem o{' '}
          <strong>primeiro pedido entregue</strong>. Contas criadas só para gerar bônus perdem os
          pontos.
        </li>
        <li>
          <strong>Cupons:</strong> cada cupom pode ter valor mínimo de pedido, prazo de validade e
          limite de usos. Cada cliente usa um mesmo cupom uma única vez. Descontos nunca
          ultrapassam o valor dos produtos.
        </li>
      </ul>
      <p>
        Se um pedido é cancelado, os pontos e o cupom usados nele voltam para você, e o estoque
        retorna para a loja.
      </p>

      <h2>6. Cancelamento e reembolso</h2>
      <ul>
        <li>
          <strong>Você pode cancelar</strong> enquanto o pedido ainda não entrou em preparo. Depois
          disso, o cancelamento passa a depender da loja — fale pelo chat do pedido.
        </li>
        <li>
          <strong>A loja pode cancelar</strong> até o momento em que o entregador coleta o pedido,
          informando o motivo. Depois da coleta, não é mais possível cancelar.
        </li>
        <li>
          <strong>Todo cancelamento devolve o dinheiro.</strong> O estorno é solicitado ao Mercado
          Pago antes de o pedido ser marcado como cancelado — se o estorno falhar, o cancelamento
          não se completa.
        </li>
        <li>
          Pagamentos em PIX voltam para a conta de origem. Pagamentos em cartão aparecem como
          estorno na fatura seguinte ou na subsequente, conforme a data e o emissor.
        </li>
      </ul>

      <h2>7. Produto com problema e direito de arrependimento</h2>
      <p>
        Se o pedido chegar errado, incompleto ou com defeito, fale primeiro com a loja pelo chat do
        pedido. Não havendo solução, acione o nosso contato em {email} — vamos intermediar.
      </p>
      <p>Independentemente da nossa política, a lei garante a você:</p>
      <ul>
        <li>
          <strong>Arrependimento (art. 49 do CDC):</strong> 7 dias corridos a partir do recebimento
          para desistir da compra, sem precisar justificar. Não se aplica a produtos que, por
          natureza, não podem ser devolvidos — alimentos preparados, perecíveis e itens de consumo
          imediato.
        </li>
        <li>
          <strong>Vícios do produto (art. 26 do CDC):</strong> 30 dias para produtos não duráveis e
          90 dias para duráveis, contados do recebimento ou da constatação do defeito oculto.
        </li>
        <li>
          <strong>Garantia do fabricante</strong>, quando houver, corre de forma independente.
        </li>
      </ul>
      <p>
        Para devoluções, o produto precisa estar em condições compatíveis com o motivo alegado, com
        os acessórios e embalagens que vieram com ele.
      </p>

      <h2>8. Avaliações</h2>
      <p>
        Depois de receber o pedido você pode avaliar a loja e o entregador — uma avaliação por
        pedido, com nota, comentário e fotos. As avaliações são públicas e servem para outros
        clientes decidirem.
      </p>
      <p>
        Avaliações precisam refletir a sua experiência real. Usar a nota como forma de pressionar a
        loja, publicar dados pessoais de terceiros ou ofensas, ou combinar avaliações em troca de
        vantagem são condutas sujeitas a remoção do conteúdo e sanção na conta.
      </p>

      <h2>9. Regras para lojistas</h2>
      <ul>
        <li>
          A loja só passa a vender depois de aprovada. Analisamos CNPJ ativo, documento da empresa e
          endereço antes de liberar.
        </li>
        <li>
          O anúncio deve descrever o produto com precisão — nome, descrição, foto, preço, variações
          e estoque reais. Anunciar o que não se tem em estoque gera cancelamento e afeta a
          avaliação da loja.
        </li>
        <li>
          A loja é a fornecedora perante o consumidor: garantia, vício do produto e informação
          correta são responsabilidade dela.
        </li>
        <li>
          É proibido anunciar produtos ilícitos, falsificados, sem a certificação exigida por lei
          (Anvisa, Inmetro, Anatel, quando aplicável) ou vedados por estes Termos.
        </li>
        <li>
          Obrigações fiscais — emissão de nota, tributos, inscrições — são da loja. A plataforma não
          emite documento fiscal em nome dela.
        </li>
        <li>
          Toda a comunicação com o cliente deve acontecer dentro da plataforma. Direcionar o cliente
          para fechar por fora é infração grave.
        </li>
        <li>
          Para receber, a loja conecta a própria conta Mercado Pago. O repasse é automático a cada
          pedido pago, já descontada a comissão de {REGRAS.comissaoPlataformaPct}%.
        </li>
      </ul>

      <h2>10. Regras para entregadores</h2>
      <ul>
        <li>
          O cadastro exige CPF, CNH válida e documentos do veículo, conferidos antes da aprovação.
        </li>
        <li>
          Enquanto estiver online, sua localização é compartilhada para permitir o roteamento e o
          acompanhamento pelo cliente. Ao ficar offline, o compartilhamento para.
        </li>
        <li>
          O pedido deve ser entregue à pessoa no endereço informado, mediante o código de entrega.
          Não é permitido abrir, consumir ou desviar itens.
        </li>
        <li>
          Os dados do cliente recebidos para a entrega servem apenas para ela — não podem ser
          guardados, usados para contato pessoal ou repassados a terceiros.
        </li>
      </ul>

      <h2>11. Condutas proibidas</h2>
      <p>Valem para todos os perfis:</p>
      <ul>
        <li>Fornecer dados falsos ou se passar por outra pessoa.</li>
        <li>Combinar pagamento ou venda fora da plataforma.</li>
        <li>
          Alegar falsamente que não recebeu o pedido, ou abrir contestação no cartão em paralelo a
          uma reclamação em andamento conosco.
        </li>
        <li>Manipular avaliações, pontos, cupons ou indicações, inclusive com múltiplas contas.</li>
        <li>Usar linguagem ofensiva, discriminatória ou ameaçadora no chat e nas avaliações.</li>
        <li>Tentar burlar, sobrecarregar ou explorar falhas da plataforma.</li>
        <li>Divulgar dados pessoais de outro usuário.</li>
      </ul>

      <h2>12. Sanções</h2>
      <p>
        Conforme a gravidade e a reincidência, podemos advertir, restringir funcionalidades, remover
        anúncios ou conteúdo, suspender temporariamente ou encerrar a conta, além de cancelar
        benefícios obtidos de forma irregular.
      </p>
      <Callout>
        <p>
          <strong>Você sempre será informado do motivo.</strong> Toda suspensão ou encerramento vem
          acompanhado da razão e do caminho para contestar, respondendo pelo {email}. Valores já
          devidos a você não são retidos pela sanção.
        </p>
      </Callout>

      <h2>13. Disponibilidade</h2>
      <p>
        Trabalhamos para manter a plataforma no ar, mas ela pode ficar indisponível por manutenção,
        falha técnica ou fatores externos. Fora das hipóteses previstas em lei, a indisponibilidade
        temporária não gera indenização. Pedidos já pagos e não entregues por indisponibilidade são
        cancelados com estorno.
      </p>

      <h2>14. Alterações destes Termos</h2>
      <p>
        Podemos alterar estes Termos para refletir mudanças no serviço ou na lei. A versão vigente
        fica sempre nesta página, com a data no topo. Mudanças relevantes são avisadas na
        plataforma, e o uso após o aviso vale como concordância.
      </p>

      <h2>15. Lei aplicável e foro</h2>
      <p>
        Aplica-se a lei brasileira. Fica eleito o foro de {EMPRESA.cidadeForo} — {EMPRESA.ufForo},
        sem prejuízo do direito de o consumidor demandar no foro do seu domicílio, como assegura o
        Código de Defesa do Consumidor.
      </p>
      <p>
        Sobre o tratamento dos seus dados, veja a{' '}
        <Link href="/privacidade">Política de Privacidade</Link>.
      </p>
    </LegalPage>
  )
}
