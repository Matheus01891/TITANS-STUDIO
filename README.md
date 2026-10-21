# Titans Studio — loja e prévia demonstrativa

## Arquivos do projeto

- `index.html`: loja, carrinho e formulário de solicitação da prévia.
- `preview.html`: página de demonstração protegida por login do Discord e marca d'água por pedido.
- `api/preview.js`: gera o código individual de uso único e envia o link por DM.
- `api/support.js`: atende o widget com IA pelo servidor e revela o contato humano configurado quando necessário. A chave do modelo fica somente nas variáveis da Vercel.
- `api/preview-login.js`: valida o link e inicia o login oficial do Discord.
- `api/discord-callback.js`: confirma a conta Discord, consome o link e registra a abertura.
- `api/preview-access.js`: valida a sessão temporária da prévia.
- `titans-studio-logo.png`: logo utilizada na loja e na demonstração.
- `assets/formas-de-pagamento-titans.webp`: arte enviada pelo dono da loja com os métodos previstos de pagamento.

## Como funciona a entrega

Ao solicitar uma prévia, o site cria um código aleatório, de uso único, associado ao ID Discord e ao pedido. O código vence após 60 minutos se não for usado. O cliente precisa entrar na conta Discord correspondente àquele ID; só então o link é consumido e uma sessão temporária de até 20 minutos é criada. Recarregar funciona no mesmo navegador até a sessão expirar. O canal interno recebe o código do pedido e o nome/ID da conta Discord confirmada quando o acesso começa.

A página continua sendo uma demonstração visual temporária, não o script FiveM real. Atualize `preview.html` quando tiver a demonstração verdadeira. Não coloque o código-fonte real do script no navegador: qualquer conteúdo enviado ao navegador pode ser inspecionado ou copiado.

O webhook `DISCORD_WEBHOOK_URL` serve apenas para um aviso interno no canal da loja. Para mandar a prévia por DM ao cliente, use um bot da Titans Studio e peça o ID numérico do usuário. O bot deve poder abrir uma conversa com essa pessoa; se o Discord bloquear a DM, o site informará que não conseguiu entregar.

## Configurar na Vercel

Abra **Project → Settings → Environment Variables**. Adicione as variáveis necessárias ao ambiente **Production**. Deixe tokens e chaves como **Secret**.

### Armazenamento de códigos e sessões

Crie uma base Redis no Upstash e copie a URL REST e o token da base. O plano gratuito atual lista limites de 256 MB e 500 mil comandos mensais, suficientes para protótipo e baixo volume; confira os limites vigentes na conta. Configure na Vercel:

- `UPSTASH_REDIS_REST_URL` — URL REST do Upstash (**Secret**).
- `UPSTASH_REDIS_REST_TOKEN` — token de acesso do Upstash (**Secret**).
- `PREVIEW_URL` — endereço público de produção seguido de `/preview.html`, por exemplo `https://titans-studio.vercel.app/preview.html`.

Use o domínio que aparece em **Project → Settings → Domains** e que abre sem login da Vercel. Nunca use o endereço com identificador longo de uma implantação de prévia.

### Entregar por Discord

No Discord Developer Portal, use a aplicação do bot e configure o OAuth2. Adicione a URL de callback exata (`https://SEU-DOMINIO-VERCEL/api/discord-callback`) em OAuth2 → Redirects. Na Vercel, configure:

- `DISCORD_CLIENT_ID` — Application ID do app Discord.
- `DISCORD_CLIENT_SECRET` — segredo OAuth2 (**Secret**).
- `DISCORD_REDIRECT_URI` — URL exata registrada como redirect, terminando em `/api/discord-callback`.
- `DISCORD_BOT_TOKEN` — token do bot (**Secret**), para enviar a DM com o link.
- `DISCORD_WEBHOOK_URL` — webhook privado do canal da loja (**Secret**), para receber pedido e registro de quem abriu.

O cliente informa o ID numérico do Discord, permite a DM do bot e autentica a conta no Discord ao abrir o link. O login só pede a permissão `identify` para conferir a conta.

### Endereço de demonstração opcional

Configure `PREVIEW_URL` como o endereço de produção público da loja seguido de `/preview.html`, por exemplo `https://titans-studio.vercel.app/preview.html`. O link da mensagem usa a rota `/api/preview-login` no mesmo domínio.

Depois de alterar as variáveis, faça um novo deploy da Vercel. Nunca coloque webhook ou token no GitHub, no `index.html` ou em prints. Se algum segredo já apareceu em um print, revogue-o e crie outro antes de continuar.

## Limites da proteção

- O código individual só pode ser resgatado uma vez e apenas pela conta Discord associada. A sessão funciona por até 20 minutos no navegador que concluiu o login.
- A marca d'água mostra o código do pedido; o webhook interno associa esse código ao cliente/ID Discord. É um mecanismo de rastreio, não uma identificação garantida de quem fez uma captura.
- Sites não conseguem bloquear nem detectar de forma confiável capturas de tela feitas pelo sistema operacional, gravação externa ou outro dispositivo. A marca d'água ajuda a identificar de qual pedido veio uma imagem compartilhada.
- A API precisa das duas variáveis do Upstash. Sem elas, a loja não libera links desprotegidos.

## Moeda, idioma e acompanhamento (modo de teste)

- O país inicial é estimado pelo idioma/fuso horário do navegador e pode ser alterado no seletor do cabeçalho.
- A loja oferece Português (Brasil), Português (Portugal) e Inglês; país selecionado sugere idioma e moeda, que também podem ser alterados manualmente.
- Os preços do catálogo são baseados em BRL e outras moedas usam cotações diárias de referência do Frankfurter. A taxa é apenas estimativa e não determina o valor final de uma cobrança.
- O botão de simulação cria uma referência `TS-...`. A página de acompanhamento só consulta pedidos criados na simulação e guardados no mesmo navegador. Para pedidos reais, será preciso conectar pagamento, webhook e banco de dados.

## Observações

- O checkout e o acompanhamento de pedido continuam demonstrativos; nenhum pagamento é cobrado.
- Os produtos e valores do catálogo ainda são exemplos.
- A prévia visual temporária está identificada como demonstração; substitua-a pela demonstração real antes de vender o script como funcional.


## Melhorias recentes

- O cabeçalho inclui país/região, idioma e moeda; a escolha sugere as opções locais, com ajuste manual. A vitrine usa taxas diárias de referência e mantém o pagamento como demonstração.
- A simulação de compra cria um código `TS-...` que pode ser consultado na área “Acompanhar pedido” no mesmo navegador. Não representa um pagamento nem uma entrega real.
- A interface de compra e o assistente de suporte respondem em português do Brasil, português de Portugal ou inglês.

- A loja exibe a arte de formas de pagamento e explica que Pix/cartões são apenas os métodos planejados até conectar um provedor.
- A sacola permanece salva no navegador do cliente.
- No checkout há uma visualização da confirmação pós-pagamento, identificada como simulação. Ela não cobra, não marca pedido como pago e não envia produto.
- O botão “Suporte Titans” oferece respostas guiadas locais para dúvidas comuns. É um assistente inicial por regras, não uma IA generativa, e não encaminha mensagens a um atendente. Uma IA real precisa de uma API de modelo e chave guardada em variável de ambiente; um contato humano exige o convite/link do Discord de suporte.
- O modal, controles e widget de suporte foram ajustados para telas pequenas.

## O que falta para vender e entregar de verdade

1. Escolher e conectar um provedor de pagamento em modo sandbox.
2. Criar uma rota de webhook no servidor e validar a assinatura enviada pelo provedor antes de aprovar pedidos. Nunca aprovar compra a partir de um botão no navegador.
3. Guardar o pedido e enviar o arquivo real somente depois da confirmação do webhook, com proteção contra notificações repetidas.
4. Substituir produtos, preços e prévia demonstrativos pelo material real.

O repositório GitHub atual é público. Não envie arquivos `.lua`/`.zip` do script real para ele; publique apenas os dados e imagens do produto. Mantenha o arquivo de entrega em armazenamento privado e libere-o após confirmação real do pagamento.

O teste visual pode ser feito adicionando um produto, abrindo a sacola, clicando em “Revisar pedido”, “Comprar agora”, selecionando um framework e confirmando os requisitos. Em “Ver como ficará após pagamento (simulação)”, a loja cria um código `TS-...` que pode ser consultado no mesmo navegador em “Acompanhar pedido”. O teste não cobra nem envia arquivo.


## Recursos novos do catálogo

- Busca por nome/descrição, filtros de categoria e framework, ordenação por preço, favoritos locais e comparação de até três produtos.
- Kit “Gestão de Facção” aplica desconto demonstrativo de 15% quando inclui Painel da Facção e Ranking de Farm.
- Cupom de teste `TITANS10` aplica 10% na demonstração. O valor não é cobrado e não deve ser divulgado como promoção real.
- Seletor BRL/EUR/USD usa taxas fixas ilustrativas. O seletor English traduz alguns controles principais; não é uma tradução completa do conteúdo.
- Galeria, requisitos, compatibilidades, novidades e políticas são modelos para preencher com informações verdadeiras dos scripts. A galeria é construída com elementos de interface, não representa capturas de produtos prontos.
- O formulário de checkout pede confirmação do framework/requisitos para demonstrar esse passo; ainda não existe integração de pagamento.

As regras de licença, suporte, atualizações, reembolso e compatibilidade estão como textos de orientação. Substitua pelos termos reais da Titans Studio antes de publicar vendas.


## Ativar a IA de suporte e o atendente

Na Vercel, em **Settings → Environment Variables**, configure uma das opções abaixo. A chave do Google AI Studio deve ser usada como Gemini:

- `GEMINI_API_KEY` — chave do Google AI Studio (Gemini), marcada como Secret. Se esta variável existir, a rota usa Gemini primeiro. O modelo padrão é `gemini-3.8-flash`.
- `GEMINI_MODEL` — opcional; por padrão usa `gemini-3.8-flash`.

- `OPENAI_API_KEY` — alternativa para usar a OpenAI caso não configure `GEMINI_API_KEY`. A chave fica apenas no servidor e não deve ser colocada no HTML ou no GitHub. A IA usa a Responses API e o modelo padrão `gpt-6-luna`; o uso da API pode gerar cobrança por tokens e é separado da assinatura do ChatGPT.
- `SUPPORT_CONTACT_URL` — link de convite/canal do Discord ou endereço `mailto:` para atendimento humano. Use um link de atendimento que seus clientes possam abrir; não use `DISCORD_WEBHOOK_URL` nem token do bot.
- `OPENAI_MODEL` — opcional; por padrão usa `gpt-6-luna` quando estiver usando OpenAI.

A rota limita cada IP a 18 perguntas por hora e o site a 120 perguntas por dia usando o Upstash Redis que já protege as prévias. Ela guarda no Redis uma chave derivada do IP para aplicar esse limite. O texto da dúvida e o histórico recente são enviados à API de IA para formular a resposta; o widget avisa o cliente para não enviar senhas nem dados de pagamento.

Chamadas Gemini que retornam erro temporário (429/5xx) ou timeout recebem uma nova tentativa curta. A função de suporte pode executar por até 30 segundos na Vercel para completar essa repetição.

Se a IA não encontrar uma resposta confirmada — por exemplo, compatibilidade ou política ainda não definida — ela identifica que precisa de atendimento e o widget mostra o link `SUPPORT_CONTACT_URL`. Se a chave da IA estiver ausente, aparece uma resposta de configuração e o link humano continua disponível quando configurado. Depois de adicionar as variáveis, faça um novo deploy da Vercel.

O cartão de suporte requer chave válida da API. Confira o preço vigente antes de ativar: a API é cobrada por uso, separadamente do ChatGPT.


## Conta do cliente, painel e produtos privados

- `conta.html`: login por e-mail/Discord e histórico de pedidos reais quando existir integração de pagamento.
- `admin.html`: painel protegido por função de administrador para cadastrar, publicar, destacar, marcar como novo e remover scripts.
- `supabase/schema.sql`: tabelas e políticas RLS; `SETUP-CONTAS.md`: configuração do Supabase, Discord e Vercel.
- `api/public-config.js` e `api/products.js`: configuração pública segura e catálogo publicado. `api/download.js` valida sessão e pedido pago antes de entregar link assinado temporário.
- Os `.lua`/`.zip` do produto ficam em Storage privado, nunca no repositório público.
- Com Supabase configurado, o checkout exige uma conta e retoma o carrinho após o login. Os pedidos e pagamentos continuam demonstrativos até conectar um provedor e seu webhook.
- As DMs da prévia Discord agora usam embed TITANS STUDIO com resumo, código individual, aviso de uso único/expiração e botão de acesso.
