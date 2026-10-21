# Titans Studio — arquivo para GitHub e Vercel

Esta pasta contém a loja estática pronta para importar. Abra `index.html` para conferir a organização dos arquivos; a logo fica em `assets/`.

## 1. Extraia o ZIP
No Windows, clique com o botão direito no arquivo ZIP e escolha **Extrair Tudo**. Guarde a pasta extraída em um lugar fácil de achar.

## 2. Envie para o GitHub com GitHub Desktop
1. Crie uma conta no GitHub e instale o GitHub Desktop: https://desktop.github.com/
2. No GitHub Desktop, escolha **File → Add Local Repository**. Se a pasta ainda não for um repositório, use **Create a Repository** e selecione a pasta extraída.
3. Confirme que `index.html`, `README.md` e a pasta `assets` aparecem na lista de arquivos.
4. Escreva uma mensagem, por exemplo `Loja Titans Studio`, clique **Commit to main** e depois **Publish repository**.
5. Mantenha o repositório privado enquanto estiver revisando os preços de exemplo e a integração de vendas; você pode torná-lo público quando quiser.

## 3. Importe no Vercel
1. Entre em https://vercel.com/ usando GitHub.
2. Clique **Add New → Project** e importe o repositório que publicou.
3. Selecione **Other** como Framework Preset. Este site é HTML/CSS/JavaScript simples e não usa etapa de build; deixe o Build Command vazio. O projeto está na raiz do repositório, junto do `index.html`.
4. Clique **Deploy**. Depois, cada commit enviado ao GitHub pode gerar uma nova publicação no Vercel.

## Receber solicitações de prévia
O formulário envia os dados para `/api/preview`. Essa função pode avisar um canal Discord, uma caixa de e-mail, ou os dois. Configure as chaves em **Vercel → projeto → Settings → Environment Variables**. Nunca coloque chaves no `index.html` nem publique um webhook no GitHub.

### Para receber no Discord
1. No Discord, abra as configurações do servidor → **Integrações → Webhooks → Novo webhook**.
2. Escolha o canal que receberá os pedidos e copie a URL do webhook.
3. Na Vercel, crie a variável `DISCORD_WEBHOOK_URL` com essa URL.

### Para receber por e-mail
1. Crie uma API key no Resend e verifique um domínio/remetente por lá.
2. Na Vercel, adicione `RESEND_API_KEY`, `STORE_EMAIL` (caixa que receberá as solicitações) e `RESEND_FROM` (remetente verificado, por exemplo `Titans Studio <pedidos@seudominio.com>`).

Depois de adicionar ou alterar variáveis, faça um novo Deploy na Vercel. O formulário envia a solicitação para os destinos da loja configurados e informa ao cliente o canal de contato que ele escolheu. Se nenhum destino estiver configurado, a API devolve erro e o site não finge que enviou.

O botão **Comprar agora** ainda não inicia cobrança. Para vender de verdade, conecte um checkout (por exemplo, um provedor que aceite Pix e cartão) e substitua os produtos e preços demonstrativos pelos itens reais.

Guias oficiais do Vercel:
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/git/vercel-for-github
