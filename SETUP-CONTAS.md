# Configurar contas, catálogo e painel da TITANS STUDIO

Esta integração acrescenta login de cliente por e-mail/Discord, área de pedidos e painel para publicar produtos. Ela usa Supabase como autenticação, banco e armazenamento privado. A loja continua usando o fluxo de prévia Discord existente.

## 1. Criar e configurar o Supabase

1. Crie um projeto em [supabase.com/dashboard](https://supabase.com/dashboard).
2. Em **Project Settings → API**, copie o **Project URL** e a chave **anon/public** (pode aparecer como publishable key). Nunca copie a `service_role` para a loja ou para o GitHub.
3. No **SQL Editor**, abra `supabase/schema.sql` destes arquivos, cole o conteúdo completo e execute.
4. Em **Storage**, crie um bucket chamado `titans-deliveries` e defina como **Private**. No plano grátis, o limite global máximo por arquivo é 50 MB. Em **Allowed MIME types**, deixe vazio para não restringir por tipo (o painel valida a extensão) ou permita `application/zip`, `application/x-zip-compressed`, `application/vnd.rar`, `application/x-rar-compressed`, `application/x-7z-compressed`, `application/octet-stream` e `text/plain`. As políticas de acesso do bucket estão no SQL.

## 2. Ativar login por e-mail e Discord

1. Em **Authentication → URL Configuration**, defina como Site URL `https://titans-studio.vercel.app` e permita os redirects `https://titans-studio.vercel.app/conta.html` e `https://titans-studio.vercel.app/admin.html`.
2. Em **Authentication → Sign In / Providers → Discord**, ative Discord e preencha o Client ID e Client Secret da aplicação Discord que a Titans Studio já usa.
3. Copie o callback exibido pelo Supabase, no formato `https://<project-ref>.supabase.co/auth/v1/callback`, e adicione-o em Discord Developer Portal → aplicação → OAuth2 → Redirects.
4. Preserve também o redirect atual da prévia (`https://titans-studio.vercel.app/api/discord-callback`). O Supabase acrescenta um callback de login próprio; não substitua o callback da prévia.

O login por e-mail envia um link de acesso. Para produção, configure o remetente de e-mail do Supabase. O botão Discord pede `identify` e `email` para vincular a identidade.

## 3. Variáveis da Vercel

Em **Vercel → projeto → Settings → Environment Variables**, adicione estas duas variáveis a Production, Preview e Development:

| Nome | Valor | É segredo? |
|---|---|---|
| `SUPABASE_URL` | Project URL do Supabase | Não |
| `SUPABASE_ANON_KEY` | chave **Publishable** (`sb_publishable_...`); o nome da variável é mantido pelo código | Não |
| `SUPABASE_SERVICE_ROLE_KEY` | chave **Secret** (`sb_secret_...`); usada só pela API privada de download e mantida apenas na Vercel | **Sim — segredo** |

Salve e faça um novo deploy. A chave Publishable é enviada ao navegador; a segurança vem das políticas RLS no arquivo SQL. A chave Secret fica apenas na Vercel para `/api/download`; nunca a coloque em `index.html`, `conta.html`, `admin.html` nem no GitHub. Mantenha todas as variáveis atuais da prévia e do suporte como estão.

## 4. Autorizar sua conta como dona da loja

1. Abra `https://titans-studio.vercel.app/conta.html` e entre uma vez com o método escolhido.
2. No Supabase, abra **Authentication → Users** e copie o UUID da sua conta.
3. No **SQL Editor**, execute este comando trocando o UUID pelo seu:

```sql
insert into public.store_admins (user_id)
values ('COLE-AQUI-O-UUID-DA-SUA-CONTA');
```

4. Saia e entre novamente, depois abra `https://titans-studio.vercel.app/admin.html`. Clientes comuns não ganham acesso ao painel só por terem conta.

O painel registra automaticamente inclusão, edição, publicação, retirada do ar e exclusão de produtos na tabela `public.store_audit_logs`. Quando receber uma versão que inclua essa auditoria, execute novamente o conteúdo completo de `supabase/schema.sql` no SQL Editor para criar a tabela, as políticas de leitura e o gatilho de registro. O script pode ser executado de novo com segurança.

## 5. Adicionar o primeiro script

No painel, informe nome, preço base em reais, categoria, frameworks compatíveis, descrição e selecione `.lua`, `.zip`, `.rar` ou `.7z` (até 50 MB no plano grátis). O arquivo fica no bucket privado e o catálogo recebe apenas os dados comerciais. Marque **Destacar na vitrine**, **Mostrar selo “Novo”** e/ou **Publicar no catálogo**. O painel lista seus produtos, permite publicar/retirar do ar e excluir.

**Não envie o script real para o repositório GitHub.** O repositório atual é público. O painel guarda o arquivo final no Storage privado; as opções de download para compradores só podem ser liberadas por uma função de servidor após confirmar o pagamento.

## O que já funciona e o que falta para vender de verdade

- Com Supabase configurado: login e área de conta; o checkout pede login quando alguém tenta continuar; depois do login, o carrinho é retomado. Administradores autorizados cadastram produtos e arquivos privados, e produtos publicados aparecem no catálogo.
- O histórico de pedidos lê pedidos associados à conta. `/api/download` prepara um link assinado de 2 minutos somente se a sessão autenticada for dona de um pedido pago e o item estiver naquele pedido. A tabela só deve ser preenchida pelo servidor depois de confirmar o pagamento.
- Checkout, acompanhamento, compra simulada e a mensagem atual de prévia continuam em modo demonstrativo. **Nenhum pagamento real ou entrega pós-pagamento é ativado por este setup.** Para isso, falta escolher e conectar um provedor (por exemplo, Mercado Pago para Pix/cartão), criar webhook com validação de assinatura e registrar pedido/itens usando uma função de servidor. Depois, essa mesma função libera uma URL assinada temporária do bucket privado ao comprador autenticado.
- O sistema de prévia Discord existente mantém as variáveis e endpoints atuais; a mensagem DM foi redesenhada com resumo do pedido e botão de acesso individual.

## Teste seguro antes de publicar

Use primeiro um arquivo de teste sem código comercial e um produto com preço de teste. Confirme: login por e-mail, login por Discord, retomada do carrinho, upload no painel, produto publicado no catálogo, produto como rascunho oculto, retirada do ar e exclusão. Faça login com uma segunda conta para confirmar que ela não acessa `/admin.html` nem lê os arquivos privados. Não anuncie “compra aprovada” ou “entrega automática” até conectar e testar o webhook de pagamento.
