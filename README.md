# Titans Studio — loja e prévia demonstrativa

## Arquivos do projeto

- `index.html`: loja, carrinho e formulário de solicitação da prévia.
- `preview.html`: página de demonstração visual temporária enviada ao cliente.
- `api/preview.js`: entrega a prévia por e-mail ou mensagem privada do Discord.
- `titans-studio-logo.png`: logo utilizada na loja e na demonstração.

## Como funciona a entrega

Ao solicitar uma prévia, o cliente escolhe o canal e recebe um link para `preview.html`, com remetente/identidade da Titans Studio. A página é uma demonstração visual temporária, não o script FiveM real. Quando você tiver o material verdadeiro, atualize `preview.html` ou configure `PREVIEW_URL` na Vercel.

O webhook `DISCORD_WEBHOOK_URL` serve apenas para um aviso interno no canal da loja. Para mandar a prévia por DM ao cliente, use um bot da Titans Studio e peça o ID numérico do usuário. O bot deve poder abrir uma conversa com essa pessoa; se o Discord bloquear a DM, o site informará que não conseguiu entregar.

## Configurar na Vercel

Abra **Project → Settings → Environment Variables**. Adicione as variáveis necessárias ao ambiente **Production**. Deixe tokens e chaves como **Secret**.

### Entregar por e-mail

Crie uma API key no Resend, verifique um domínio e configure:

- `RESEND_API_KEY` — chave de envio do Resend (**Secret**).
- `RESEND_FROM` — remetente do domínio verificado, por exemplo `Titans Studio <pedidos@seudominio.com>`.

O cliente fornece o e-mail no formulário e recebe a mensagem da Titans Studio com o link demonstrativo. O Resend exige uma chave de API e um remetente/domínio compatível e verificado para enviar em produção. Consulte a integração Resend + Vercel: https://resend.com/vercel

### Entregar por Discord

Crie o bot no Discord Developer Portal, adicione-o ao servidor da loja e configure `DISCORD_BOT_TOKEN` como **Secret**. O cliente precisa informar o ID numérico do Discord e permitir mensagens privadas do bot. O webhook de aviso interno é opcional; se quiser receber cópia dos pedidos no canal da loja, configure `DISCORD_WEBHOOK_URL` também como **Secret**.

### Endereço de demonstração opcional

Por padrão o site envia o link da própria página `/preview.html`. Se depois você tiver uma prévia real hospedada em outro endereço, configure `PREVIEW_URL` com esse link.

Depois de alterar as variáveis, faça um novo deploy da Vercel. Nunca coloque webhook ou token no GitHub, no `index.html` ou em prints. Se algum segredo já apareceu em um print, revogue-o e crie outro antes de continuar.

## Observações

- O checkout continua demonstrativo; nenhum pagamento é cobrado.
- Os produtos e valores do catálogo ainda são exemplos.
- A prévia visual temporária está identificada como demonstração; substitua-a pela demonstração real antes de vender o script como funcional.
