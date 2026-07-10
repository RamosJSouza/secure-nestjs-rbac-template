# Segurança

## Modelo de Autenticação

- **JWT RS256:** Assinatura assimétrica. Chave privada nunca sai do servidor; chave pública pode ser distribuída a validadores.
- **Tokens de acesso de curta duração:** 15 minutos limitam a exposição.
- **Rotação de refresh token:** Cada refresh invalida o token anterior.
- **Detecção de reutilização:** Se um refresh token revogado for reutilizado, todas as sessões daquele usuário são revogadas.
- **Alteração de senha:** Revoga imediatamente todas as sessões ativas.

## Autorização

- Todos os endpoints de mutação exigem `JwtAuthGuard` (token Bearer válido).
- RBAC aplicado via `PermissionGuard` e `@RequirePermissions`.
- Verificação de permissão é baseada em banco (RolePermission), não hardcoded.

## Hardening

| Camada | Implementação |
|--------|---------------|
| Rate limiting | 100 req/15min por IP |
| Headers | Helmet |
| CORS | Restrito a ALLOWED_ORIGINS (obrigatório em produção) |
| Validação de entrada | ValidationPipe com whitelist, forbidNonWhitelisted |
| Validação de config | Joi fail-fast na inicialização |

## Proteção de Conta

- **Bloqueio:** 5 logins falhos → bloqueio de 15 minutos.
- **Auditoria:** auth.account.locked e auth.refresh_token_reuse_detected registrados.
- **Desativação:** Usuários inativos recebem 401 em qualquer requisição autenticada.

## Requisitos de Produção

- `PRIVATE_KEY` e `PUBLIC_KEY` devem estar definidos.
- `DB_SSL=true` para conexões com banco.
- `ALLOWED_ORIGINS` deve listar URLs permitidas do frontend.
- Credenciais do seed devem ser alteradas após o primeiro deploy.
