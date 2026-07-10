# Observabilidade

## Logging Estruturado

A aplicação usa **Pino** para logging estruturado de alta performance. Os logs incluem:
- Ciclo de vida de requisição/resposta
- Correlation ID para rastreamento
- Stack traces de erros

## Correlation ID

Cada requisição recebe um `X-Correlation-Id` (gerado ou passado no header). Ele é:
- Propagado para todos os logs da requisição
- Armazenado nas entradas do audit log
- Retornado nos headers da resposta para rastreamento pelo cliente

Use o mesmo correlation ID ao chamar serviços downstream ou depurar problemas.

## Health Checks

| Endpoint | Finalidade |
|----------|------------|
| `GET /health/liveness` | Retorna `{ status: 'ok' }`. Usado pela orquestração para verificar se o processo está ativo. |
| `GET /health/readiness` | Verifica database e Redis. Falha se dependências indisponíveis. |

Docker e Kubernetes devem usar readiness para rotear tráfego e liveness para decisões de reinício.

## Audit Log

- Append-only; sem updates ou deletes.
- Cada mutação auditada registra: action, entityType, entityId, actorUserId, correlationId, metadata, ip, userAgent.
- Eventos incluem: user.create, user.change_password, role.*, auth.refresh_token_reuse_detected, auth.account.locked.

Consulte [Audit Module](../../src/modules/audit/README.md) para detalhes de integração.
