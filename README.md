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

## Observação sobre as vendas
O carrinho e as telas de resumo são a interface da loja. O envio de pedidos e a cobrança ainda dependem de conectar o canal Discord/e-mail e o provedor de pagamento. Os produtos e valores no catálogo são exemplos. A regra visual está preparada para Pix somente no Brasil e cartões para Brasil, Portugal e clientes internacionais.

Guias oficiais do Vercel:
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/git/vercel-for-github
