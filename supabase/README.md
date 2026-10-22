# E-mails de autenticação TITANS STUDIO

Os modelos usam `user_metadata.language`, preenchido no momento do cadastro: `pt-BR`, `pt-PT`, `en` ou `de`. O texto do botão, a mensagem e o rodapé seguem esse idioma. Os modelos disponíveis são `confirm-signup.html` (confirmação de cadastro) e `magic-link.html` (link de acesso).

## Configuração no Supabase

1. Abra **Authentication → Emails → Templates**.
2. No modelo **Confirm signup**, copie `confirm-signup.html` para o campo HTML e use como assunto:
   `{{ if eq .Data.language "de" }}Bitte bestätige deine E-Mail-Adresse{{ else if eq .Data.language "en" }}Confirm your TITANS STUDIO email{{ else }}Confirme seu e-mail da TITANS STUDIO{{ end }}`
3. No modelo **Magic Link**, copie `magic-link.html` e use como assunto:
   `{{ if eq .Data.language "de" }}Sicherer Zugang zu TITANS STUDIO{{ else if eq .Data.language "en" }}Your secure TITANS STUDIO sign-in link{{ else }}Seu acesso seguro à TITANS STUDIO{{ end }}`
4. Salve. Confirme que a opção de confirmar e-mail continua ligada e teste um cadastro com cada idioma.

## Remetente TITANS STUDIO

O HTML controla a aparência dentro da mensagem. O nome que aparece na linha do remetente é controlado pelo serviço SMTP. Em projetos Supabase Free criados a partir de 3 de junho de 2026, a personalização dos modelos não fica disponível usando apenas o SMTP padrão do Supabase. Para alterar os modelos e o nome do remetente, configure um SMTP personalizado em **Authentication → SMTP Settings** e defina o nome do remetente como `TITANS STUDIO`. Consulte as instruções atuais do Supabase antes de configurar o provedor.

A imagem da marca é servida pelo próprio site em `/assets/titans-studio-logo.png`; teste a URL pública antes de enviar. Nunca coloque senhas SMTP, service-role keys ou segredos no HTML nem no GitHub.
