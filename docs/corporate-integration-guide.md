# Guia de Integração Corporativa — Módulos Terraform Existentes (EKS e ECS)

Este guia documenta a arquitetura final homologada na **Fase 3**, a separação de responsabilidades entre o **Release Please (`17.6.0`)** e os mecanismos corporativos existentes de certificação de infraestrutura, o contrato mínimo de integração para workflows existentes (EKS, ECS, Terraform Test, TaaC/Pytest) e a avaliação de complexidade e manutenibilidade.

---

## 1. Fluxo de Integração com Workflows Corporativos Existentes

```text
Feature Pull Request
        |
Release Version Preview (candidate.yml / preview.cjs + baseline.cjs)
        |
Release Candidate (rc.cjs: vX.Y.Z-rc.prN.sha7 ou candidate/pr-N/sha7)
        |
Workflows de testes existentes (ci.yml: Contract Tests, Day 0, Day 2, TaaC/Pytest)
        |
Resultado da certificação (aggregate-gate.py -> CERTIFICATION_EVIDENCE_JSON)
        |
CODEOWNERS (Revisão independente obrigatória)
        |
Merge protegido (Squash merge na main sob Ruleset)
        |
Release Please (release-please.yml -> candidate.cjs em modo fast-forward)
        |
Release Pull Request (release-please--branches--main)
        |
Certificação final ou equivalência comprovada (Execução integral na Política v3)
        |
Autorização pré-publicação (publication.cjs authorize -> verify.py)
        |
Tag estável anotada (proposal-sha256) + GitHub Release + certification.json
```

---

## 2. Separação de Responsabilidades e Interfaces Mínimas

A solução preserva o Release Please como motor nativo de versionamento e changelog, mantendo customizações apenas onde há requisito estrito de governança, segurança ou não-reescrita de histórico:

| Componente | Implementação na POC | Responsabilidade Esperada | Entrada Mínima | Saída / Contrato | Candidato a Reutilização Corporativa |
|---|---|---|---|---|---|
| **Release Please** | Biblioteca oficial fixada `release-please@17.6.0` (`release-please-config.json`, `.release-please-manifest.json`) | Cálculo SemVer, parsing de Conventional Commits, geração de `CHANGELOG.md` e preparação de updates do Release PR. | Histórico da `main` desde a tag do manifest + `release-please-config.json`. | Proposta de Release PR (`version`, `updates`, `notes`) e seleção do Release PR integrado (`buildReleases`). | **Nativo** (configuração JSON por repositório). |
| **Baseline Resolver** | `scripts/release/baseline.cjs` (`resolveStableBaseline`, `validateBaseline`) | Garantir que `preview.cjs` e `candidate.cjs` partam de uma baseline estável reconciliada, recusando manifest inválido, tag ausente ou release anterior incompleta. | `repo`, `currentMainSha`, `.release-please-manifest.json`, tag remota e `releases/latest` (+ `certification.json` ou `.release/brownfield.json`). | `{ currentStableTag, currentStableVersion, stableTagSha }` validados. | **Sim** (parametrizando o repositório). |
| **Version Preview** | `scripts/release/preview.cjs` (executado em `.github/workflows/candidate.yml` e validado em `ci.yml`) | Prever a próxima versão SemVer simulando o commit de squash (`PR_TITLE` + `PR_BODY`) com a mesma estratégia `terraform-module` do publicador. | `PR_NUMBER`, `PR_TITLE`, `PR_BODY`, `PR_HEAD_SHA`, `PR_BASE_SHA`, `TESTED_SHA`, baseline resolvida. | `preview.json` contendo versão prevista, tipo SemVer, `candidate_tag`, `tree_sha`, `metadata_digest` e `equivalence_fingerprint`. | **Sim** (CLI `node preview.cjs <out.json>`). |
| **Candidate Management** | `scripts/release/rc.cjs` (em `candidate.yml`) e `scripts/release/candidate.cjs` (em `release-please.yml`) | `rc.cjs`: criar referência candidata imutável (`vX.Y.Z-rc.prN.sha7` + pre-release, ou `candidate/pr-N/sha7`). `candidate.cjs`: atualizar a branch `release-please--branches--main` exclusivamente por fast-forward. | `preview.json` (para `rc.cjs`) ou `Manifest.buildPullRequests()` (para `candidate.cjs`). | Ref remota `refs/tags/<candidate_tag>` verificada via `git ls-remote`; commit fast-forward na branch do Release PR. | **Sim** (parametrizando lista de arquivos permitidos no updater). |
| **Infrastructure Tests** | Workflows existentes do módulo (representados na POC por `scripts/certify.sh`, `run-day0.sh`, `run-day2.sh`, `analyze-plan.py`) | Executar Terraform Test, TaaC/Pytest, matrizes de compatibilidade, instalação limpa (Day 0), upgrade in-place no mesmo state (Day 2), análise de plano e destroy/cleanup. | `CANDIDATE_TAG` (`?ref=`), `STABLE_TAG`, `EXPECTED_MODULE_HASH` (`HEAD^{tree}`), parâmetros da matriz. | JSON estruturado por suíte (`contracts.json`, `day0.json`, `day2.json`) com `result: "PASS" \| "FAIL"`, contagens de plano e status de cleanup. | **Específico de cada módulo** (os workflows corporativos de EKS/ECS já existem e são mantidos). |
| **Certification Gate** | `scripts/certify/aggregate-gate.py` (job `Terraform certification` em `ci.yml`) | Consolidar evidências de todas as suítes obrigatórias, validar frescor da branch base e árvore Git, e emitir o registro verificável no log. | JSONs de evidência das suítes, status dos jobs (`needs.<job>.result`), `EXPECTED_HEAD_SHA`, `EXPECTED_TESTED_SHA`. | `gate-report.json` e linha `CERTIFICATION_EVIDENCE_JSON={...}` no passo `Evaluate Infrastructure Certification Gate`. | **Sim** (adaptando a lista de jobs obrigatórios da matriz do módulo). |
| **Publisher** | `scripts/release/publication.cjs` (`authorize` + `publish`) e `scripts/release/verify.py` | `authorize`: validar em modo leitura o candidato integrado. `publish`: consumir exclusivamente a proposta autorizada, criar tag anotada com `proposal-sha256`, criar GitHub Release e anexar `certification.json`. | Release PR integrado com rótulo `autorelease: pending` + `CERTIFIED_PROPOSAL` assinado pelo digest SHA-256. | Tag anotada `refs/tags/vX.Y.Z`, GitHub Release estável, asset `certification.json` v3 verificado byte a byte e rótulo `autorelease: tagged`. | **Sim** (parametrizando `REPO`, `REQUIRED_JOBS`, `CI_POLICY` e ID do publicador). |
| **Auditor** | `scripts/audit-release.py` | Verificação independente pós-publicação de qualquer release histórica ou nova. | `TAG`, `PR_NUMBER`, `CI_RUN_ID`. | JSON de auditoria comprovando commit, árvore, changelog, manifest, certificado e `proposal-sha256` da tag anotada. | **Sim** (CLI `python3 audit-release.py <tag> <pr> <run>`). |

---

## 3. Ponto de Integração com os Workflows Corporativos de EKS e ECS

Conforme as decisões vinculantes `D06`, `D07` e `D08`, a integração em módulos corporativos **reutiliza os workflows de testes efêmeros já existentes** (Terraform Test, TaaC com Pytest, provisionamento automatizado, matrizes de compatibilidade, testes de runtime/add-ons, Destroy, Destroy Retry e Janitor), preservando também a execução manual (`workflow_dispatch`) desses workflows.

### 3.1 Contrato de Entrada para os Workflows de Testes Existentes

O job `prepare-candidate` disponibiliza aos jobs ou workflows de testes corporativos:

- `needs.prepare-candidate.outputs.candidate_tag`: Referência Git imutável (`vX.Y.Z-rc.prN.sha7` ou `candidate/pr-N/sha7`) para consumo remoto via `source = "git::https://github.com/<org>/<module>.git?ref=<candidate_tag>"`.
- `needs.prepare-candidate.outputs.stable_tag`: Última versão estável verificada (`vX.Y.Z`) para provisionamento do estado inicial nos testes de Consumer Upgrade (Day 2).
- `needs.prepare-candidate.outputs.release_type`: `PATCH`, `MINOR`, `MAJOR` ou `NONE`.
- `needs.prepare-candidate.outputs.declared_breaking`: `true` ou `false`.
- `needs.prepare-candidate.outputs.migration_doc_present`: `true` ou `false`.

### 3.2 Contrato de Evidência Fornecido pelos Workflows Corporativos ao Gate Agregador

Cada workflow ou job de teste corporativo existente (EKS ou ECS) deve exportar um JSON de saída contendo os indicadores verificados por `aggregate-gate.py`:

1. **Contratos e Testes Estáticos (`contracts_json`)**:
   - `result`: `"PASS"` ou `"FAIL"`.
   - `failure_reason`: `null` ou descrição do erro.
2. **Fresh Installation — Day 0 (`day0_json`)**:
   - `result` / `fresh_installation`: `"PASS"` ou `"FAIL"`.
   - `terraform_contracts`: `"PASS"` ou `"FAIL"` (inclui asserções TaaC/Pytest de runtime e add-ons).
   - `idempotency`: `"PASS"` ou `"FAIL"` (`terraform plan -detailed-exitcode == 0`).
   - `cleanup`: `"PASS"` ou `"FAIL"` (resultado do Destroy / Destroy Retry / verificação residual do Janitor).
3. **Consumer Upgrade — Day 2 (`day2_json`)**:
   - `result` / `consumer_upgrade`: `"PASS"` ou `"FAIL"`.
   - `upgrade_impact_policy`: `"PASS"` ou `"FAIL"` (resultado de `analyze-plan.py` antes do `apply`, bloqueando `replace`/`delete` em recursos críticos como `aws_eks_cluster`, `aws_kms_key`, `aws_ecs_cluster`, volumes persistentes, etc.).
   - `post_upgrade_idempotency`: `"PASS"` ou `"FAIL"`.
   - `cleanup`: `"PASS"` ou `"FAIL"`.
   - `upgrade_impact`: `{"create": <n>, "update": <n>, "replace": <n>, "delete": <n>}`.

### 3.3 Extensão do Contrato de Equivalência para Fatores Externos AWS

Na POC atual (`policy_version: 3`), todo Feature PR e todo Release PR executam a certificação completa (`evidence_reuse.reused = false`), e o `equivalence_contract` registra:

- `repository_tree`: SHA da árvore Git completa (`HEAD^{tree}`).
- `origin_stable_version`: `v<stable>@<stable_sha>`.
- `environment_parameters`: string canônica do ambiente (`linux-x86_64:terraform-1.6.6:builtin-provider`).

Caso o ambiente corporativo deseje habilitar reutilização de evidências no Release PR no futuro para economizar tempo/custo de clusters efêmeros AWS, o objeto `environment_parameters` (ou campos adicionais do contrato) **deverá incorporar obrigatoriamente todos os fatores externos resolvidos dinamicamente**:

- IDs exatos de AMIs resolvidas (ex.: Bottlerocket AMI ID por região e arquitetura `x86_64` / `arm64`).
- Versões resolvidas de add-ons EKS (`coredns`, `vpc-cni`, `kube-proxy`, `aws-ebs-csi-driver`, Karpenter) e imagens de containers.
- Região AWS, arquitetura e parâmetros da matriz de compatibilidade.
- Hash do `.terraform.lock.hcl` dos providers AWS/Kubernetes/Helm utilizados pelas fixtures consumidoras.
- Identidade e digest dos workflows de teste corporativos chamados.

Enquanto esses fatores externos puderem variar fora da árvore Git do módulo (por exemplo, via `data "aws_ssm_parameter"` ou `data "aws_ami"`), **manter a reutilização desabilitada por padrão (`reused: false`) é a decisão mais segura**, garantindo que o Release PR valide o candidato final antes da publicação.

---

## 4. Avaliação de Simplicidade, Complexidade e Manutenibilidade (Fase 8)

### 4.1 O que foi simplificado e removido na Fase 3

| Componente | Fase 2 (`f680a2f`) | Fase 3 (Atual) | Ganho de Simplicidade e Segurança |
|---|---|---|---|
| `.github/workflows/ci.yml` | 352 linhas (com escrita, fallbacks de bootstrap e ramos `if EVIDENCE_REUSED == true` que sintetizavam JSONs) | 258 linhas (somente leitura, sem fallback e sem síntese de `PASS`) + `candidate.yml` (40 linhas) + `certification-comment.yml` (23 linhas) | Eliminação de 33 linhas de código líquido nos workflows e separação estrita entre código candidato e operações de escrita. |
| `scripts/release/preview.cjs` + `baseline.cjs` | 467 linhas (com lista estática de 6 arquivos, scraping de logs de 15 runs anteriores e instanciação manual de `TerraformModule`) | `preview.cjs` (267 linhas) + `baseline.cjs` (47 linhas) = 314 linhas | Redução de **153 linhas (-32,8%)**, uso direto de `LocalGitHub` + `Manifest.fromManifest` + `buildStrategy` e validação rigorosa da baseline estável. |
| `scripts/release/comment.cjs` | 274 linhas (com renderizador duplicado de tabelas Markdown e `DELETE` de comentários) | 191 linhas (atualização cirúrgica com links diretos aos jobs da API e validação de `metadata_digest`) | Redução de **83 linhas (-30,3%)** e restrição estrita ao ID numérico do bot (`41898282`). |
| `scripts/release/publication.cjs` + `verify.py` | `publication.cjs` (79 linhas, tag leve) + `verify.py` (163 linhas) | `publication.cjs` (97 linhas, tag anotada com `proposal-sha256` e verificação byte a byte) + `verify.py` (177 linhas) | Recuperação determinística de falhas parciais e vínculo criptográfico entre tag, notas e certificado. |

### 4.2 Dependências e Interfaces Internas do `release-please@17.6.0`

- **Única dependência externa em `scripts/release/package.json`**: `"release-please": "17.6.0"`, fixada com integridade SHA-512 em `scripts/release/package-lock.json` e instalada sempre com `npm ci --ignore-scripts --no-audit --no-fund`.
- **Interfaces públicas vs internas utilizadas**:
  - `candidate.cjs` e `publication.cjs` utilizam a API pública principal (`GitHub`, `Manifest`) e `release-please/build/src/util/tag-name` (`TagName`).
  - `preview.cjs` utiliza submódulos internos do pacote compilado (`release-please/build/src/local-github`, `release-please/build/src/factory`, `release-please/build/src/commit`, `release-please/build/src/util/tag-name`, `release-please/build/src/version`) para executar a mesma estratégia `terraform-module` localmente sobre objetos Git sem realizar chamadas de escrita à API.
- **Risco de atualização e mitigação**:
  - Os caminhos internos `release-please/build/src/*` podem mudar em futuras versões major/minor da biblioteca.
  - Por isso, a versão `17.6.0` deve permanecer estritamente fixada no `package.json` e `package-lock.json`. Qualquer atualização deliberada da biblioteca deve passar obrigatoriamente pelas suítes locais `scripts/check-policy.cjs`, `scripts/release/tests/brownfield.cjs`, `scripts/release/tests/integrity.cjs` e `scripts/release/tests/recovery.cjs` antes de ser integrada.

### 4.3 Configurações Hardcoded que Devem Ser Parametrizadas para Outros Módulos

Ao portar os scripts desta POC para um módulo corporativo real, parametrize os seguintes identificadores (atualmente fixados para defesa em profundidade no repositório da POC):

1. **Identificador do repositório (`TomasAlric/terraform-module-release-please-poc`)**:
   - Presente em `.github/workflows/ci.yml`, `.github/workflows/candidate.yml`, `.github/workflows/release-please.yml`, `scripts/release/rc.cjs`, `scripts/release/verify.py`, `scripts/audit-release.py` e nos defaults de `run-day0.sh` / `run-day2.sh`.
2. **ID numérico do publicador (`82914085`)**:
   - Presente em `.github/workflows/release-please.yml`, `scripts/release/publication.cjs` e `scripts/release/verify.py`. Deve corresponder ao `user.id` da conta de serviço proprietária do `RELEASE_PLEASE_TOKEN` corporativo.
3. **Lista de hashes `CI_POLICY` e `REQUIRED_JOBS` em `scripts/release/verify.py`**:
   - Deve listar os hashes Git dos workflows/scripts de certificação do módulo alvo e os nomes exatos dos jobs obrigatórios da matriz de testes corporativos.
4. **Caminhos permitidos em `scripts/release/candidate.cjs`**:
   - Atualmente restritos a `['CHANGELOG.md', '.release-please-manifest.json', 'README.md', 'versions.tf']`. Se o módulo possuir submódulos com `versions.tf` ou `README.md` próprios atualizados por `extra-files`, inclua-os na allowlist.
