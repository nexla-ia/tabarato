import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Callout, LegalTable } from '@/components/LegalPage'
import { EMPRESA, PRIVACIDADE_VERSAO, pendente } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Tá Barato',
  description: 'Quais dados o Tá Barato coleta, para que usa e com quem compartilha.',
}

/**
 * RASCUNHO — descreve o tratamento de dados que o app realmente faz hoje
 * (campos do schema Prisma e integrações do checkout/cadastro), mas não passou
 * por revisão jurídica. Ver comentário em src/lib/legal.ts.
 *
 * Ao adicionar coleta de dado novo ou integração com terceiro, atualize as
 * seções 2, 3 e 5 — a política só protege se descrever o que o código faz.
 */
export default function PrivacidadePage() {
  const razao = pendente(EMPRESA.razaoSocial, 'razão social')
  const cnpj = pendente(EMPRESA.cnpj, 'CNPJ')
  const emailPriv = pendente(EMPRESA.emailPrivacidade, 'e-mail de privacidade')

  return (
    <LegalPage
      title="Política de Privacidade"
      versao={PRIVACIDADE_VERSAO}
      outro={{ href: '/termos', label: 'Ler os Termos de Uso' }}
    >
      <p>
        Esta Política explica quais dados pessoais o <strong>Tá Barato</strong> coleta, por que
        coleta, com quem compartilha e o que você pode exigir de nós. Ela segue a Lei Geral de
        Proteção de Dados (Lei 13.709/2018).
      </p>
      <p>
        <strong>Controlador dos dados:</strong> {razao}, CNPJ {cnpj}, {EMPRESA.endereco}.
        <br />
        <strong>Canal de privacidade:</strong> {emailPriv}.
      </p>

      <h2>1. Princípio que seguimos</h2>
      <p>
        Coletamos apenas o que é necessário para o pedido acontecer: identificar você, cobrar,
        entregar no lugar certo e resolver problemas depois. Não vendemos seus dados, não montamos
        perfis para terceiros e não usamos seu endereço para publicidade de outras empresas.
      </p>

      <h2>2. Dados que coletamos</h2>

      <h3>De todo mundo que cria conta</h3>
      <ul>
        <li>Nome, e-mail e, se informado, telefone.</li>
        <li>Senha, guardada apenas como hash — nem nós conseguimos lê-la.</li>
        <li>Cidade e estado, foto de perfil e o tipo de conta (cliente, lojista ou entregador).</li>
        <li>Código de indicação usado ou gerado por você.</li>
        <li>
          Se entrar pelo Google: nome, e-mail e foto que o Google nos envia após você autorizar.
        </li>
      </ul>

      <h3>De clientes</h3>
      <ul>
        <li>
          Endereços de entrega completos — apelido, rua, número, complemento, bairro, cidade,
          estado, CEP e as coordenadas de latitude e longitude do ponto.
        </li>
        <li>
          Histórico de pedidos: itens, valores, descontos, cupons, forma de pagamento, status e
          data.
        </li>
        <li>Mensagens trocadas no chat do pedido.</li>
        <li>Avaliações e fotos que você publica.</li>
        <li>Saldo e movimentação de pontos de fidelidade.</li>
        <li>Token de notificação do aparelho, se você autorizar notificações.</li>
      </ul>

      <h3>De lojistas</h3>
      <ul>
        <li>CNPJ, razão social ou nome fantasia, telefone e descrição da loja.</li>
        <li>Endereço da loja e suas coordenadas.</li>
        <li>Documento da empresa enviado para aprovação (Cartão CNPJ ou CCMEI).</li>
        <li>Dados de recebimento: identificação da conta Mercado Pago conectada e chave PIX.</li>
        <li>Catálogo, pedidos recebidos, faturamento e avaliações da loja.</li>
      </ul>

      <h3>De entregadores</h3>
      <ul>
        <li>CPF, número da CNH, placa e tipo do veículo.</li>
        <li>Fotos de documentos enviadas para conferência: CNH, identidade e documento do veículo.</li>
        <li>
          <strong>Localização em tempo real enquanto estiver online</strong>, para roteamento das
          entregas e acompanhamento pelo cliente. Ao ficar offline, paramos de registrar a posição.
        </li>
        <li>Histórico de entregas, avaliações recebidas e repasses.</li>
      </ul>

      <Callout>
        <p>
          <strong>Sobre localização:</strong> no cadastro de loja e no preenchimento de endereço
          pedimos acesso à localização do navegador. É opcional — se negar, basta digitar o endereço
          manualmente. Já a localização do entregador durante a entrega é parte do serviço.
        </p>
      </Callout>

      <h2>3. Para que usamos, e com qual base legal</h2>
      <LegalTable
        head={['Finalidade', 'Base legal (LGPD)']}
        rows={[
          ['Criar e manter sua conta; autenticar o acesso', 'Execução de contrato'],
          ['Processar pagamento e repasses', 'Execução de contrato'],
          ['Levar o pedido ao endereço certo e calcular a taxa de entrega', 'Execução de contrato'],
          ['Avisar sobre o andamento do pedido (app, push, e-mail)', 'Execução de contrato'],
          ['Aprovar lojas e entregadores (conferência de documentos)', 'Execução de contrato e obrigação legal'],
          ['Prevenir fraude — múltiplas contas, abuso de cupom e de indicação', 'Legítimo interesse'],
          ['Guardar registros de pedidos e pagamentos por prazo legal', 'Obrigação legal'],
          ['Resolver reclamações e disputas', 'Execução de contrato e exercício de direitos'],
          ['Promoções e novidades por push', 'Consentimento — revogável a qualquer momento'],
        ]}
      />

      <h2>4. O que não fazemos</h2>
      <ul>
        <li>Não vendemos nem alugamos dados pessoais.</li>
        <li>Não compartilhamos seu contato com anunciantes.</li>
        <li>Não guardamos número de cartão de crédito nos nossos servidores.</li>
        <li>Não usamos suas mensagens do chat para publicidade.</li>
      </ul>

      <h2>5. Com quem compartilhamos</h2>

      <h3>Com a loja do seu pedido</h3>
      <p>
        A loja recebe o que precisa para separar e liberar o pedido: seu nome, o endereço de
        entrega, os itens, observações e o contato dentro da plataforma.
      </p>

      <h3>Com o entregador do seu pedido</h3>
      <p>
        O entregador recebe o endereço de entrega, seu nome e a referência do pedido, apenas
        enquanto a entrega estiver em andamento.
      </p>

      <Callout>
        <p>
          Loja e entregador podem usar esses dados <strong>somente</strong> para executar aquele
          pedido. Guardar sua base de contatos, usar seu telefone para oferta própria, repassar a
          terceiros ou expor seus dados publicamente viola os nossos Termos e a LGPD — e é motivo de
          suspensão. Se isso acontecer com você, avise em {emailPriv}.
        </p>
      </Callout>

      <h3>Com prestadores de serviço</h3>
      <LegalTable
        head={['Serviço', 'Para quê', 'O que recebe']}
        rows={[
          [
            'Mercado Pago',
            'Processar pagamento, estorno e repasse',
            'Dados da cobrança e do meio de pagamento',
          ],
          [
            'Google',
            'Login social, quando você escolhe essa opção',
            'Confirma sua identidade e nos devolve nome, e-mail e foto',
          ],
          [
            'OpenStreetMap / Nominatim',
            'Converter endereço em coordenadas e vice-versa',
            'O endereço ou o par de coordenadas consultado',
          ],
          [
            'BrasilAPI',
            'Conferir CNPJ no cadastro de loja',
            'O número do CNPJ consultado',
          ],
        ]}
      />
      <p>
        Também compartilhamos dados quando houver ordem judicial ou requisição de autoridade
        competente, no limite do que for exigido.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li>
          <strong>Dados da conta:</strong> enquanto ela existir.
        </li>
        <li>
          <strong>Pedidos, pagamentos e notas:</strong> pelo prazo exigido pela legislação fiscal e
          civil, mesmo após o encerramento da conta — são registros de uma transação que já
          aconteceu.
        </li>
        <li>
          <strong>Documentos de aprovação</strong> de loja e entregador: enquanto o cadastro estiver
          ativo e pelo prazo de eventual responsabilização.
        </li>
        <li>
          <strong>Localização do entregador:</strong> apenas o necessário para operar e auditar a
          entrega.
        </li>
        <li>
          <strong>Mensagens de chat:</strong> mantidas junto ao pedido, servindo de prova em caso de
          reclamação.
        </li>
      </ul>
      <p>Encerrado o prazo, os dados são excluídos ou anonimizados.</p>

      <h2>7. Seus direitos</h2>
      <p>A LGPD garante a você, a qualquer momento:</p>
      <ul>
        <li>Confirmar se tratamos dados seus e acessar quais são.</li>
        <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
        <li>Pedir anonimização, bloqueio ou exclusão de dados desnecessários ou excessivos.</li>
        <li>Solicitar a portabilidade dos seus dados.</li>
        <li>Revogar consentimento — por exemplo, desligar notificações promocionais.</li>
        <li>Saber com quem compartilhamos seus dados.</li>
        <li>Se opor a um tratamento feito com base em legítimo interesse.</li>
      </ul>
      <p>
        Para exercer qualquer um deles, escreva para {emailPriv}. Respondemos em até 15 dias.
        Precisamos confirmar sua identidade antes de atender — é o que impede que outra pessoa peça
        seus dados se passando por você.
      </p>
      <p>
        Alguns dados não podem ser apagados sob demanda quando existe obrigação legal de guarda,
        como o registro fiscal de uma compra já realizada. Nesses casos explicamos o motivo e o
        prazo.
      </p>

      <h2>8. Segurança</h2>
      <ul>
        <li>Tráfego criptografado entre o app e os nossos servidores.</li>
        <li>Senhas guardadas apenas como hash.</li>
        <li>
          Credenciais de recebimento das lojas e dos entregadores guardadas cifradas com AES-256-GCM.
        </li>
        <li>Acesso interno restrito a quem precisa dele para operar a plataforma.</li>
      </ul>
      <p>
        Nenhum sistema é imune. Se ocorrer incidente de segurança com risco relevante a você,
        comunicamos você e a ANPD, como exige a lei.
      </p>

      <h2>9. Armazenamento no seu dispositivo</h2>
      <p>
        Guardamos no seu navegador o token de sessão que mantém você conectado e preferências como o
        conteúdo do carrinho. Não usamos cookies de publicidade de terceiros. Limpar os dados do
        navegador desconecta a sua conta.
      </p>

      <h2>10. Crianças e adolescentes</h2>
      <p>
        A plataforma é destinada a maiores de 18 anos. Não coletamos intencionalmente dados de
        menores. Identificado um cadastro nessa situação, a conta é encerrada e os dados excluídos,
        salvo o que a lei obrigue a manter.
      </p>

      <h2>11. Mudanças nesta Política</h2>
      <p>
        Quando alterarmos esta Política, publicamos a nova versão aqui com data e número de versão
        atualizados. Mudanças relevantes no uso dos seus dados são comunicadas na plataforma.
      </p>
      <p>
        As regras de uso do serviço estão nos <Link href="/termos">Termos de Uso</Link>.
      </p>
    </LegalPage>
  )
}
