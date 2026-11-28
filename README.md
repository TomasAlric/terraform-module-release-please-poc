# README — Continuous Infrastructure Certification (POC Fases 1, 2 & 3)

Esta POC demonstra um fluxo completo de **automação, homologação contínua (Day 0 e Day 2), hardening de segurança, adoção brownfield e publicação certificada** de módulos Terraform utilizando **Google Release Please** (`17.6.0`), **Terraform 1.6.6**, **GitHub Actions** e **GitHub Rulesets**.

## 1. Capacidades Homologadas

- **Fase 1 (H01–H17)**:
  - Módulo Terraform baseado em `terraform_data` com validações estritas de contrato (`tests/contract.tftest.hcl`).
  - Versionamento SemVer e `CHANGELOG.md` automatizados via Release Please em modo manifest.
  - Transporte fast-forward na branch do bot (`scripts/release/candidate.cjs`) protegido por ruleset.
  - Autenticação segura com Fine-grained PAT (`RELEASE_PLEASE_TOKEN`) restrito à `main`.
  - Verificação pré-publicação (`scripts/release/verify.py`) e auditoria pós-publicação (`scripts/audit-release.py`).
- **Fase 2 (H18–H34)**:
  - **Release Version Preview** (`scripts/release/preview.cjs`): Previsão determinística da próxima versão, tipo SemVer (`PATCH`, `MINOR`, `MAJOR`, `NONE`) e breaking changes em todo PR destinado à `main`.
  - **Comentário Automático Persistente** (`scripts/release/comment.cjs`): Comentário único no PR atualizado in-place (`PENDING` -> `PASS`/`FAIL`/`INVALIDATED`) em contexto privilegiado separado dos testes.
  - **Release Candidate Management** (`scripts/release/rc.cjs`): Criação de tags SemVer pre-release imutáveis (`vX.Y.Z-rc.prN.sha7`) com GitHub Pre-release (`prerelease: true`, `make_latest: false`), ou referências isoladas (`candidate/pr-N/sha7`) para PRs sem release.
  - **Fresh Installation Certification — Day 0** (`scripts/certify/run-day0.sh`): Consumo remoto real da referência candidata via `git::https://...?ref=<RC>`, validando instalação limpa (`defaults` e `custom`), contratos, idempotência e cleanup.
  - **Consumer Upgrade Certification — Day 2** (`scripts/certify/run-day2.sh`): Provisionamento da versão estável e upgrade in-place para a RC utilizando o **mesmo diretório e mesmo Terraform state**, validando preservação de `lineage`, `cluster.id`, marcador de integridade de dados e idempotência pós-upgrade em 5 cenários de consumidores.
  - **Upgrade Impact Analysis** (`scripts/certify/analyze-plan.py`): Análise determinística do Terraform Plan JSON antes do `apply`, bloqueando substituições (`replace`) ou exclusões (`delete`) inesperadas de recursos críticos.
  - **Certificado Ampliado (`certification.json` v2/v3)**: Anexado a cada release estável com rastreabilidade completa do candidato, Day 0, Day 2, impacto de upgrade e árvore publicada.
- **Fase 3 (H35–H45)**:
  - **Hardening de Separação de Privilégios**: `.github/workflows/ci.yml` opera exclusivamente com `permissions: contents: read` e sem fallback de bootstrap; criação de candidatos isolada em `.github/workflows/candidate.yml` (código da base lendo apenas objetos Git) e comentário final isolado em `.github/workflows/certification-comment.yml` (`workflow_run`).
  - **Validação Estrita de Baseline e Árvore Completa (`policy_version: 3`)**: `scripts/release/baseline.cjs` valida manifest, ancestralidade da tag, GitHub Release `Latest` e certificado antes de qualquer preview ou reconciliação; Day 0, Day 2 e fingerprint validam a árvore Git completa (`HEAD^{tree}`) com execução integral obrigatória (`reused: false`).
  - **Recuperação Determinística de Publicação Parcial**: `scripts/release/publication.cjs` grava `proposal-sha256 <digest>` em tag Git anotada (`git mktag`) e verifica os bytes de `certification.json` antes e após o upload (`v7.2.1` publicada e auditada).
  - **Homologação de Adoção Brownfield**: Suítes reproduzíveis para adoção em módulos legados (`scripts/release/tests/brownfield.cjs`), integridade (`integrity.cjs`), fault injection de recuperação (`recovery.cjs`) e replay negativo de verificação (`verify-snapshot.py`).

## 2. Testes Locais

Na raiz do checkout, execute:

```bash
bash scripts/certify.sh
node scripts/release/tests/brownfield.cjs
node scripts/release/tests/integrity.cjs
node scripts/release/tests/recovery.cjs
```

Para executar localmente as suítes de certificação Day 0 e Day 2 contra uma tag local:

```bash
bash scripts/certify/run-day0.sh v7.2.1 /tmp/day0.json "file://$(pwd)"
bash scripts/certify/run-day2.sh v7.2.0 v7.2.1 PATCH false true /tmp/day2.json "file://$(pwd)"
```

## 3. Documentação Completa

- [Guia de Adoção Brownfield em Módulos Existentes (Fase 3)](docs/brownfield-adoption.md)
- [Revisão Independente e Hardening de Segurança (Fase 3)](docs/security-hardening.md)
- [Guia de Integração Corporativa — EKS e ECS (Fase 3)](docs/corporate-integration-guide.md)
- [Relatório Final de Homologação — Fase 3 (H35–H45)](docs/validation-report-phase-3.md)
- [Arquitetura e Evolução Corporativa (EKS/ECS)](docs/architecture.md)
- [Release Version Preview](docs/release-version-preview.md)
- [Release Candidate Management](docs/release-candidate-management.md)
- [Fresh Installation (Day 0), Consumer Upgrade (Day 2) & Upgrade Impact Analysis](docs/consumer-upgrade-certification.md)
- [Operação, Governança e Manutenção](docs/release-management.md)
- [Relatório de Homologação — Fase 1 (H01–H17)](docs/validation-report.md)
- [Relatório de Homologação — Fase 2 (H18–H34)](docs/validation-report-phase-2.md)

## 4. Migração para 7.x

Troque o argumento de entrada `capacity_type` por `capacity_model` no bloco `module`. Os valores `ON_DEMAND` e `SPOT` continuam aceitos. O campo de saída `cluster.capacity_type` conserva o nome para leitores do contrato. A partir da `v7.2.0`, o módulo expõe também o atributo opcional `maintenance_window` (default `"sun:03:00-sun:04:00"`).
