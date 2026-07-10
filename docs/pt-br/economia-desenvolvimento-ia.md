# Economia de Desenvolvimento e Custo de Tokens de IA

> Documento de estimativa. Valores de pricing verificados em **julho/2026** — confirme as tarifas atuais em [platform.claude.com/docs](https://platform.claude.com/docs) antes de reutilizar estes números.

Este repositório foi construído com assistência intensiva de **Claude Code** (Anthropic API, modo BYOK — *Bring Your Own Key*). Este documento quantifica, de forma defensível e com metodologia explícita, (1) a economia de tempo de desenvolvimento e (2) o custo médio em dólares de tokens de IA.

---

## 1. Dimensão do projeto (evidência do repositório)

| Métrica | Valor | Fonte |
|---------|-------|-------|
| Ficheiros TypeScript em `src/` | 123 | `Get-ChildItem -Recurse src -Filter *.ts` |
| Linhas TypeScript totais | 6.915 | contagem de linhas |
| Linhas de testes (`.spec.ts`) | 2.517 | ~36% do total |
| Linhas de implementação (aprox.) | 4.398 | total − testes |
| Ficheiros de spec | 28 | TDD por módulo |
| Diretórios de módulo | 17 | `src/modules/*` |
| Módulos NestJS ativos | 8 | Auth, Users, RBAC, Audit, Health, Maintenance, GracefulShutdown, Logger |
| Commits | 92 | `git log --oneline` |
| Período (primeiro → último commit) | 2026-02-13 → 2026-07-10 | ~5 meses de calendário |

O código é **production-grade, security-hardened e TDD**: JWT RS256 com rotação + detecção de reuso, denylist JTI em Redis, RBAC suportado por DB, audit append-only, lockout de conta, e múltiplas passagens de auditoria de segurança + remediação (ver `docs/ANALISE_PROFUNDA.md`, `docs/ANALISE_PROFUNDA_V3.md` e os planos em `docs/superpowers/plans/`).

---

## 2. Tarifas Claude Code / Anthropic API (julho/2026)

Por milhão de tokens (MTok), modelo BYOK:

| Modelo | Input / MTok | Output / MTok | Input em cache / MTok | Uso típico |
|--------|-------------|---------------|----------------------|------------|
| Claude Opus 4.8 | $5,00 | $25,00 | $0,50 | Raciocínio complexo, auditorias de segurança |
| Claude Sonnet 4.6 | $3,00 | $15,00 | $0,30 | Driver diário — rápido, capaz, acessível |
| Claude Haiku 4.5 | $1,00 | $5,00 | $0,10 | Tarefas simples/subagentes |

Benchmark de deployment enterprise (docs oficiais Claude Code): custo médio **~$13 por dev por dia ativo**, **$150–250 por dev por mês**, e **< $30/dia para 90% dos utilizadores**.

Sessões típicas:
- Sessão de 1 h (complexidade média): ~200k–500k tokens → ~$0,60–$7,50 (Sonnet).
- Refactor autónomo longo (4+ h): ~1–3M tokens → ~$3–$45 (Sonnet).

> Nota:assinantes Claude.ai Pro/Max pagam plano fixo ($20/$100/$200 por mês), não por token. Os números abaixo aplicam-se ao modo **API/BYOK**.

---

## 3. Estimativa de economia de tempo

### 3.1 Linha de base manual (engenheiro sénior, TDD, security-hardened)

| Componente | Linhas | Produtividade (LOC/dev-day) | Dev-days |
|------------|-------:|-----------------------------:|---------:|
| Implementação | 4.398 | ~100 | ~44 |
| Testes (specs) | 2.517 | ~150 | ~17 |
| Hardening de segurança (ciclos auditoria→remediação) | — | — | ~10 |
| Refactoring + docs (utils, ports, decorators, perf) | — | — | ~8 |
| **Total manual** | **6.915** | — | **~79 dev-days** |

Premissas: engenheiro sénior a escrever código production-grade com TDD e revisões de segurança iterativas (não boilerplate cru). ~79 dev-days ≈ **~16 semanas úteis ≈ ~3,6 meses** de um engenheiro sénior a tempo inteiro.

### 3.2 Esforço real com Claude Code

Para código backend NestJS denso em padrões, a compressão empírica com Claude Code é da ordem de **8–12×** em tempo de steering humano (o humano arqueta, valida, corrige e faz review; a IA gera a maior parte do código e dos testes).

- Esforço humano efetivo: ~79 / 10 ≈ **~8 dev-days de steering**.

### 3.3 Economia de tempo

| Métrica | Valor |
|---------|-------|
| Tempo manual estimado | ~79 dev-days (~3,6 meses) |
| Esforço humano com IA | ~8 dev-days |
| **Tempo poupado** | **~70 dev-days (~3,2 meses de 1 engenheiro sénior)** |
| Fator de compressão | ~8–12× |

---

## 4. Estimativa de custo em tokens de IA

### 4.1 Pegada de tokens estimada

| Fase | Sessões | Tokens/sessão (média) | Subtotal |
|------|--------:|----------------------:|---------:|
| Scaffold + 8 módulos + migrations/seed | ~12 | ~400k | ~4,8M |
| 2 auditorias de segurança profundas + remediação (contexto de codebase inteiro) | ~10 | ~600k | ~6,0M |
| Refactoring + passagens `/simplify` + auditoria de performance RBAC | ~8 | ~350k | ~2,8M |
| Specs + ciclos de verificação (lint/build/test) | ~6 | ~250k | ~1,5M |
| **Total** | | | **~15M tokens** |

As auditorias de segurança são as mais caras porque carregam o codebase inteiro no contexto em cada passagem.

### 4.2 Custo blended (modelo dominante Sonnet, com prompt caching)

Assumindo ~70% input / ~30% output e ~50% do input elegível para cache:

- Input efetivo: 0,70 × (0,5 × $0,30 + 0,5 × $3,00) = **$1,155 / MTok**
- Output: 0,30 × $15,00 = **$4,50 / MTok**
- **Custo blended ≈ $5,66 / MTok**

Cenários:

| Cenário | Mistura de modelos | Custo blended / MTok | Custo total (~15M tokens) |
|---------|-------------------|----------------------|--------------------------:|
| Conservador (quase só Sonnet, caching agressivo) | Sonnet-dominante | ~$5,7 | **~$85** |
| **Central (recomendado)** | Sonnet + ~30% Opus p/ raciocínio duro | ~$9,0 | **~$135** |
| Pesado (auditorias em Opus) | Opus-dominante | ~$15,0 | **~$225** |

**Estimativa central: ~$130–$150 de tokens de IA** para construir este repositório de ponta a ponta.

### 4.3 Validação cruzada

Benchmark Anthropic (~$13/dev-active-day) × ~10 dev-days de steering ≈ **~$130** — consistente com a estimativa central acima.

---

## 5. ROI (Retorno sobre Investimento)

| Fator | Manual | Com Claude Code |
|-------|--------|-----------------|
| Tempo | ~79 dev-days | ~8 dev-days |
| Custo de mão-de-obra (US, sénior loaded ~$1.000–1.500/dia) | ~$80k–$120k | ~$8k–$12k |
| Custo de mão-de-obra (BR, sénior loaded ~R$1.500–2.500/dia) | ~R$120k–$200k | ~R$12k–$20k |
| Custo de tokens de IA | — | ~$130 |
| **ROI tokens vs. mão-de-obra poupada (US)** | — | **~250–900×** |

> O ROI é calculado sobre o **custo marginal dos tokens** vs. o **custo da mão-de-obra sénior poupada**. O custo de steering humano (~$8k–$12k) não é poupado — apenas comprimido no tempo.

---

## 6. Onde a IA gerou mais valor

1. **TDD acelerado** — specs geradas em paralelo com a implementação (2.517 linhas de teste, 28 ficheiros).
2. **Auditoria de segurança iterativa** — `tree-ast-grep` + revisão estrutural encontraram vulnerabilidades (race condition JTI, soft-delete + inativos, transaction rollback) que revisão manual típica omitiria.
3. **Refactoring DRY** — extração de `rbac-crud.util`, `SessionRevocationPort`, decorator `RbacEndpoint`, query vetorizada TypeORM.
4. **Auditoria de performance** — isolamento de N+1/relacional implícito + cache stampede e refactor para query única com JOINs.
5. **Documentação bilingue** — PT-BR + EN geradas e mantidas em paralelo.

---

## 7. Premissas e ressalvas

- As produtividades LOC/dev-day (~100 impl, ~150 testes) são conservadoras para código **security-hardened com TDD**; boilerplate simples seria mais rápido, reduzindo a linha de base manual e o ROI.
- A pegada de tokens (~15M) é uma estimativa baseada no histórico de commits, fases documentadas e padrões de sessão Claude Code; o valor real varia com uso de caching, tamanho de contexto e modelo.
- Pricing verificado em **julho/2026**; tarifas Sonnet 5 promocionais ($2/$10) expiram em 31/ago/2026.
- O fator de compressão 8–12× é empírico para código backend denso em padrões; projetos com muita lógica de domínio novel ou investigação exploratória comprimem menos.
