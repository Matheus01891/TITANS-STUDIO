# Titans Studio — loja e prévia demonstrativa

## Arquivos do projeto

- `index.html`: loja, carrinho e formulário de solicitação da prévia.
- `preview.html`: página de demonstração protegida por login do Discord e marca d'água por pedido.
- `api/preview.js`: gera o código individual de uso único e envia o link por DM.
- `api/preview-login.js`: valida o link e inicia o login oficial do Discord.
- `api/discord-callback.js`: confirma a conta Discord, consome o link e registra a abertura.
- `api/preview-access.js`: valida a sessão temporária da prévia.
- `titans-studio-logo.png`: logo utilizada na loja e na demonstração.

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

## Observações

- O checkout continua demonstrativo; nenhum pagamento é cobrado.
- Os produtos e valores do catálogo ainda são exemplos.
- A prévia visual temporária está identificada como demonstração; substitua-a pela demonstração real antes de vender o script como funcional.
