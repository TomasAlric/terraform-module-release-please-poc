# README — Continuous Infrastructure Certification (POC Fase 1 & Fase 2)

Esta POC demonstra um fluxo completo de **automação, homologação contínua (Day 0 e Day 2) e publicação certificada** de módulos Terraform utilizando **Google Release Please** (`17.6.0`), **Terraform 1.6.6**, **GitHub Actions** e **GitHub Rulesets**.

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
  - **Consumer Upgrade Certification — Day 2** (`scripts/certify/run-day2.sh`): Provisionamento da versão estável (`v7.1.0`, `v7.1.1`, `v6.3.0`) e upgrade in-place para a RC utilizando o **mesmo diretório e mesmo Terraform state**, validando preservação de `lineage`, `cluster.id`, marcador de integridade de dados e idempotência pós-upgrade em 5 cenários de consumidores.
  - **Upgrade Impact Analysis** (`scripts/certify/analyze-plan.py`): Análise determinística do Terraform Plan JSON antes do `apply`, bloqueando substituições (`replace`) ou exclusões (`delete`) inesperadas de recursos críticos.
  - **Reutilização Governada de Evidências**: Contrato criptográfico de equivalência de 8 dimensões (`equivalence_fingerprint`) e invalidação automática quando a `main` avança.
  - **Certificado Ampliado (`certification.json` v2)**: Anexado a cada release estável com rastreabilidade completa do candidato, Day 0, Day 2, impacto de upgrade e árvore publicada.

## 2. Testes Locais

Na raiz do checkout, execute:

```bash
bash scripts/certify.sh
```

O script verifica formatação HCL, inicializa e valida o módulo, executa os 19 testes de contrato (`terraform test`), valida o exemplo `examples/complete`, valida os manifests do Release Please e confere os hashes Git (`CI_POLICY`) exigidos pelo verificador pré-publicação.

Para executar localmente as suítes de certificação Day 0 e Day 2 contra uma tag local:

```bash
bash scripts/certify/run-day0.sh v7.2.0 /tmp/day0.json "file://$(pwd)"
bash scripts/certify/run-day2.sh v7.1.1 v7.2.0 MINOR false true /tmp/day2.json "file://$(pwd)"
```

## 3. Documentação Completa

- [Arquitetura e Evolução Corporativa (EKS/ECS)](docs/architecture.md)
- [Release Version Preview (Fase 1)](docs/release-version-preview.md)
- [Release Candidate Management (Fase 2)](docs/release-candidate-management.md)
- [Fresh Installation (Day 0), Consumer Upgrade (Day 2) & Upgrade Impact Analysis (Fases 3–5)](docs/consumer-upgrade-certification.md)
- [Operação, Governança e Manutenção](docs/release-management.md)
- [Relatório de Homologação — Fase 1 (H01–H17)](docs/validation-report.md)
- [Relatório de Homologação — Fase 2 (H18–H34)](docs/validation-report-phase-2.md)

## 4. Migração para 7.x

Troque o argumento de entrada `capacity_type` por `capacity_model` no bloco `module`. Os valores `ON_DEMAND` e `SPOT` continuam aceitos. O campo de saída `cluster.capacity_type` conserva o nome para leitores do contrato. A partir da `v7.2.0`, o módulo expõe também o atributo opcional `maintenance_window` (default `"sun:03:00-sun:04:00"`).
