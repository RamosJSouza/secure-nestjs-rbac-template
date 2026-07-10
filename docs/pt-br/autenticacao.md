# Autenticação

## Visão Geral

O sistema utiliza JWT com **RS256**. A chave privada (`PRIVATE_KEY`) assina os tokens; a chave pública (`PUBLIC_KEY`) verifica. Assim, apenas a chave pública pode ser distribuída para serviços que validam tokens, sem necessidade de expor a capacidade de assinatura.

## Configuração dos Tokens

| Token | Expiração | Uso |
|-------|-----------|-----|
| Access token | 15 min | Autenticação Bearer em requisições protegidas |
| Refresh token | 7 dias | Obter novo par de tokens sem novo login |

## Payload JWT

- `sub`: ID do usuário
- `email`: E-mail do usuário
- `roleId`: ID da Role atribuída

## Fluxos

### Login
1. Cliente envia email e senha para `POST /api/auth/login`.
2. Servidor valida credenciais, verifica conta ativa e não bloqueada.
3. Em sucesso: retorna `access_token` e `refresh_token`.
4. Refresh token é armazenado (hash SHA-256) com IP e User-Agent.

### Refresh
1. Cliente envia `refresh_token` para `POST /api/auth/refresh`.
2. Servidor valida token (RS256) e sessão.
3. Se a sessão foi revogada (ex.: reutilização detectada), todas as sessões do usuário são revogadas e retorna erro.
4. Em sucesso: nova sessão criada, antiga revogada; retorna novo par de tokens (rotação).

### Rotação e Detecção de Reutilização
- Cada refresh invalida o token anterior.
- Se um refresh token já revogado for reutilizado, o sistema revoga todas as sessões do usuário e registra `auth.refresh_token_reuse_detected`.

### Alteração de Senha
- `POST /api/auth/change-password` exige autenticação Bearer.
- Ao alterar a senha, **todas as sessões ativas** do usuário são revogadas.
- Usuário precisa fazer login novamente em cada dispositivo.

## Bloqueio de Conta

- Após **5 tentativas de login falhas**, a conta é bloqueada por **15 minutos**.
- Evento `auth.account.locked` é registrado na auditoria.
- Usuários desativados ou bloqueados recebem `401 Unauthorized`.

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | /api/auth/login | Não | Login |
| POST | /api/auth/refresh | Não | Trocar refresh token por novo par |
| POST | /api/auth/register | Sim + perm | Criar usuário (users:create) |
| POST | /api/auth/change-password | Sim | Alterar senha do usuário autenticado |
| GET | /api/auth/sessions | Sim | Listar sessões ativas do usuário autenticado |
