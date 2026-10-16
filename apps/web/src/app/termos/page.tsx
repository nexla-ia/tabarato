import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Callout, LegalTable } from '@/components/LegalPage'
import { EMPRESA, REGRAS, TERMOS_VERSAO, brl, buscarPrecos, pendente } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Termos de Uso — Tá Barato',
  description: 'Regras de uso da plataforma Tá Barato para clientes, lojistas e entregadores.',
}

/**
 * RASCUNHO — o texto descreve fielmente o comportamento do app em 06/10/2026,
 * mas não passou por revisão jurídica. Ver comentário em src/lib/legal.ts.
 *
 * As taxas são lidas da API (`GET /config/pricing`), não escritas aqui: elas são
 * editáveis pelo admin, e número de contrato que desencontra do que é cobrado é
 * pior do que número nenhum. Os valores de fidelidade seguem em src/lib/legal.ts
 * porque são constantes no código da API.
 */
export default async function TermosPage() {
  const razao = pendente(EMPRESA.razaoSocial, 'razão social')
  const cnpj = pendente(EMPRESA.cnpj, 'CNPJ')
  const email = pendente(EMPRESA.emailContato, 'e-mail de contato')
  const { precos, aoVivo } = await buscarPrecos()

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
        <strong>Retirada na loja.</strong> Quando a loja oferece essa opção, você pode escolher
        buscar o pedido no balcão dela em vez de receber em casa. Nesse caso não há taxa de entrega
        nem entregador: você vai até o endereço da loja e informa o{' '}
        <strong>código de retirada</strong> que aparece no pedido. Esse código é seu — a loja não o
        vê antes de você mostrar.
      </p>
      <Callout>
        <p>
          <strong>Pedidos de valor alto só por retirada.</strong> Acima de{' '}
          {brl(precos.maxDeliveryValue)} em produtos, a entrega por entregador fica indisponível e o
          pedido só pode ser retirado na loja. É uma medida de segurança, para o entregador e para a
          mercadoria.
        </p>
      </Callout>
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
            `${brl(precos.deliveryBaseFee)} + ${brl(precos.deliveryPerKm)} por km entre a loja e o `
              + `endereço, com mínimo de ${brl(precos.deliveryMinFee)}. Não há taxa na retirada na loja.`,
            'Cliente',
          ],
          [
            'Remuneração do entregador',
            `${brl(precos.courierBaseFee)} + ${brl(precos.courierPerKm)} por km, paga pela plataforma`,
            'Plataforma',
          ],
          [
            'Comissão da plataforma',
            `${precos.platformCommissionPct}% sobre o valor dos produtos`,
            'Loja',
          ],
        ]}
      />
      <p>
        A taxa de entrega e a remuneração do entregador são calculadas separadamente — elas não são
        necessariamente iguais, e a diferença fica com a plataforma para custear o serviço.
      </p>
      <p>
        Aceitamos <strong>PIX e cartão</strong>, processados por operadora de pagamento contratada.
        Os dados do seu cartão são tratados diretamente por ela — não guardamos número de cartão nos
        nossos servidores.
      </p>
      <p>
        O pagamento é recebido pela plataforma, que repassa a loja e o entregador depois que o
        pedido é concluído — não no momento do pagamento. O caminho do dinheiro da loja está
        detalhado nos <Link href="/termos/lojista">Termos do Lojista</Link>.
      </p>
      {!aoVivo && (
        <Callout>
          <p>
            Não conseguimos consultar as taxas vigentes agora. Os valores acima são os da última
            atualização conhecida — os valores que realmente serão cobrados aparecem sempre na tela
            de pagamento, antes de você confirmar o pedido.
          </p>
        </Callout>
      )}
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
          <strong>Todo cancelamento devolve o dinheiro.</strong> O estorno é solicitado à operadora
          de pagamento antes de o pedido ser marcado como cancelado — se o estorno falhar, o
          cancelamento não se completa.
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
      <p>
        Quem vende no Tá Barato aceita, além destes Termos, os{' '}
        <strong><Link href="/termos/lojista">Termos do Lojista</Link></strong> — documento à parte,
        com as regras de anúncio, repasse, saque, cancelamento e sanções que valem para a loja. Em
        caso de divergência sobre a relação entre loja e plataforma, prevalece aquele documento.
      </p>
      <p>Em resumo, e sem substituir o texto completo:</p>
      <ul>
        <li>
          A loja só passa a vender depois de aprovada. Analisamos CNPJ ativo, documento da empresa e
          endereço antes de liberar.
        </li>
        <li>
          <strong>A loja é a fornecedora perante o consumidor</strong>: garantia, vício do produto e
          informação correta são responsabilidade dela. A plataforma intermedeia pagamento e
          entrega.
        </li>
        <li>
          O anúncio deve descrever o produto com precisão, e é proibido anunciar produto ilícito,
          falsificado ou sem a certificação exigida por lei.
        </li>
        <li>
          Obrigações fiscais — emissão de nota, tributos, inscrições — são da loja. A plataforma não
          emite documento fiscal em nome dela.
        </li>
        <li>
          A loja recebe o valor dos produtos menos a comissão de{' '}
          {precos.platformCommissionPct}%, creditado quando o pedido é concluído e sacável por PIX.
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
        <li>
          Criar contas falsas, ou usar robôs, scripts e automações para operar na plataforma,
          manipular pedidos, avaliações ou benefícios.
        </li>
        <li>
          Tentar burlar as regras de repasse ou as taxas — combinando pagamento por fora,
          cancelando pedido já entregue ou fracionando venda para pagar menos comissão.
        </li>
        <li>
          Extrair dados da plataforma em massa, por raspagem ou qualquer sistema automatizado, e
          monitorar ou acessar áreas sem autorização.
        </li>
        <li>Divulgar dados pessoais de outro usuário.</li>
      </ul>

      <h2>12. Sanções</h2>
      <p>
        Conforme a gravidade e a reincidência, podemos advertir, restringir funcionalidades, remover
        anúncios ou conteúdo, suspender temporariamente ou encerrar a conta, além de cancelar
        benefícios obtidos de forma irregular.
      </p>
      <p>
        Em caso de <strong>suspeita fundada de fraude</strong> — conta falsa, automação, manipulação
        de repasses ou atividade ilegal — a conta pode ser bloqueada <strong>de imediato</strong>,
        antes da apuração, para conter o dano. Também podemos adotar as medidas legais cabíveis.
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

      <h2>14. Propriedade intelectual</h2>
      <p>
        O aplicativo, o site, a marca <strong>Tá Barato</strong>, o logotipo, o design, os textos e o
        software são protegidos por direito autoral e de marca, e pertencem a {razao}. Usar a
        plataforma não transfere nenhum desses direitos a você.
      </p>
      <p>
        Sem autorização por escrito, não é permitido copiar, modificar, distribuir, descompilar ou
        criar produto derivado da plataforma, nem usar a marca e o logotipo em qualquer material.
      </p>
      <p>
        O que você publica continua seu. Fotos de produto, descrições e avaliações seguem pertencendo
        a quem as enviou — ao publicá-las, você nos autoriza a exibi-las na plataforma e a usá-las
        para divulgar o próprio Tá Barato, e garante que tem o direito de publicá-las.
      </p>

      <h2>15. Limitação de responsabilidade</h2>
      <p>
        Não respondemos por danos indiretos, lucros cessantes ou perda de oportunidade decorrentes
        de falha técnica temporária, queda de conexão, indisponibilidade de serviço de terceiro ou
        uso indevido da plataforma por outra pessoa.
      </p>
      <Callout>
        <p>
          Esta limitação <strong>não afasta</strong> o que a lei garante ao consumidor. Permanecem
          integralmente válidas as nossas obrigações de reembolso, as regras de cancelamento e tudo
          que o Código de Defesa do Consumidor assegura — inclusive a responsabilidade por vício ou
          defeito na prestação do serviço.
        </p>
      </Callout>

      <h2>16. Alterações destes Termos</h2>
      <p>
        Podemos alterar estes Termos para refletir mudanças no serviço ou na lei. A versão vigente
        fica sempre nesta página, com a data e o número de versão no topo. Mudanças relevantes são
        avisadas na plataforma, e o uso após o aviso vale como concordância.
      </p>
      <p>
        Para quem vende, a regra é mais estrita: registramos <strong>qual versão</strong> cada loja
        aceitou e <strong>quando</strong>, e uma mudança relevante faz o painel pedir um novo aceite
        antes de continuar vendendo. Aumento de comissão é sempre avisado com antecedência.
      </p>

      <h2>17. Lei aplicável e foro</h2>
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
