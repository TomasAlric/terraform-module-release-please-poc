# Relatório Final de Homologação — Phase 3: Release Please Hardening & Brownfield Adoption

Snapshot de 28/11/2026 UTC. Este relatório consolida a descoberta de baseline (Fase 0), a revisão independente e adversarial da implementação anterior (Fase 1), a homologação de adoção brownfield (Fase 2), o hardening de separação de privilégios, preview, fingerprint, recuperação de falhas parciais e concorrência (Fases 3 a 8) e os experimentos formais **H35–H45** (Fase 9) no repositório autorizado [`TomasAlric/terraform-module-release-please-poc`](https://github.com/TomasAlric/terraform-module-release-please-poc).

---

## 1. Resumo Executivo (Seção 20.1)

- **Estado encontrado na Fase 0 (Baseline `f680a2f3933c5796d1479adb6a464480cf9db814`)**:
  - Oito releases estáveis publicadas (`v6.2.0`, `v6.2.1`, `v6.3.0`, `v7.0.0`, `v7.0.1`, `v7.1.0`, `v7.1.1`, `v7.2.0`), sendo `v7.2.0` (`3bbce0ae0c461668d68566390c45b3520476fdc9`) a última release estável.
  - Oito GitHub pre-releases (`v7.1.1-rc.pr26.d299f87`, `v7.1.1-rc.pr26.e57c8f6`, `v7.1.1-rc.pr26.b46ee01`, `v8.0.0-rc.pr27.3085955`, `v7.2.0-rc.pr27.3085955`, `v7.1.1-rc.pr28.f0a7758`, `v7.2.0-rc.pr27.835922c`, `v7.2.0-rc.pr29.1c3e58e`) e duas referências candidatas isoladas (`candidate/pr-25/7187b3f`, `candidate/pr-30/61d7f23`).
  - Dois rulesets ativos (`28132014` `Certified squash on main` e `28132710` `Fast-forward release branch`), 19 testes de contrato Terraform aprovados e zero recursos AWS provisionados.
  - Inventário criptográfico completo da baseline gravado em [`docs/evidence/phase-3-baseline.json`](evidence/phase-3-baseline.json).
- **Evolução realizada na Fase 3**:
  - **Revisão independente e adversarial**: Identificados 10 achados (`2 P0`, `6 P1`, `1 P2`, `1 P3`), detalhados em [`docs/security-hardening.md`](security-hardening.md).
  - **Hardening de separação de privilégios**: Eliminado o fallback inseguro de bootstrap em `.github/workflows/ci.yml` e removidas todas as permissões de escrita do workflow de PR (`permissions: contents: read` em todos os jobs, `persist-credentials: false`). A preparação da referência candidata foi isolada em `.github/workflows/candidate.yml` (que executa exclusivamente código da branch base sobre objetos Git, sem checkout do código do PR) e a atualização final do comentário foi isolada em `.github/workflows/certification-comment.yml` (`workflow_run` na `main`).
  - **Integridade da árvore, baseline e evidências (`policy_version: 3`)**: Removida a lista estática de 4/6 arquivos e a reutilização que sintetizava `PASS` por scraping de logs. `run-day0.sh`, `run-day2.sh` e `preview.cjs` passaram a validar a árvore Git completa (`git rev-parse 'HEAD^{tree}'`). Criado `scripts/release/baseline.cjs` para validar rigorosamente o manifest, a ancestralidade da tag estável, a release `Latest` e o certificado `certification.json` (ou âncora `.release/brownfield.json`) tanto no preview quanto na reconciliação do Release PR (`candidate.cjs`).
  - **Recuperação determinística de publicação parcial**: `scripts/release/publication.cjs` passou a criar tags Git anotadas (`git mktag`) comprometidas com `proposal-sha256 <sha256({proof, name, notes})>` usando o timestamp imutável `proof.certified_at`, verificando a ref e os bytes exatos de `certification.json` antes e depois do upload.
  - **Homologação hospedada e nova release estável `v7.2.1`**: As correções foram homologadas no GitHub através dos PRs [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31), [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32), [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33) (que publicou a release estável certificada [`v7.2.1`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.2.1) sob `policy_version: 3`) e [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Veredito Geral**: **`PARTIAL`** (Conclusão funcional da POC comprovada com todas as vulnerabilidades de código corrigidas e `v7.2.1` publicada e auditada; prontidão para piloto corporativo condicionada a dois controles administrativos externos do Owner registrados na Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35) e à execução do primeiro ensaio brownfield hospedado em um repositório legado de teste).
- **Capacidade de adoção em módulos existentes**: Comprovada com a biblioteca real `release-please@17.6.0` em fixtures Git completas (`scripts/release/tests/brownfield.cjs`), demonstrando preservação 100% de tags, commits, árvores, releases, assets, referências de consumidores (`?ref=v6.1.1`) e `CHANGELOG.md` histórico.
- **Principais riscos residuais**:
  1. **S2 (`BLOCKED` — Governança de Secret)**: `RELEASE_PLEASE_TOKEN` está cadastrado como Repository Secret (e não em um GitHub Environment restrito à branch `main`).
  2. **S7 (`BLOCKED` — Governança de Revisão/Ruleset)**: O ruleset `28132014` no repositório pessoal exige `0` aprovações (`require_code_owner_review: false`), não havendo segundo revisor humano para alterações conjuntas em `CI_POLICY` e scripts, nem ruleset de imutabilidade para tags `refs/tags/v*`.
  3. **S9 (`OPEN` — Janela de evento `edited` no GitHub)**: Editar título/corpo de um Feature PR sem alterar o `head_sha` apresenta uma breve janela assíncrona no GitHub até que o novo check run seja registrado (embora o Release PR esteja protegido por `metadata_digest` em `verify.py`).
  4. **Consumo de tag Git antes do upload do asset**: Uma tag Git torna-se consumível pelo Terraform (`?ref=vX.Y.Z`) no instante do `git push`, alguns segundos antes da criação da GitHub Release e do upload de `certification.json`.

---

## 2. Respostas Diretas às 9 Perguntas do Owner (Seção 4)

| # | Pergunta do Owner | Resposta Fundamentada nas Evidências da Fase 3 |
|---|---|---|
| **1** | Podemos incorporar Release Please em um módulo que já possui releases? | **Sim.** Inicializando `.release-please-manifest.json` com a última versão manual (ex.: `{"." : "6.2.0"}`), `release-please-config.json` com `release-type: "terraform-module"` e a âncora `.release/brownfield.json`, o Release Please assume o versionamento a partir do corte exato (`scripts/release/tests/brownfield.cjs`). |
| **2** | O histórico existente será preservado? | **Sim.** Os inventários antes/depois em `brownfield.cjs` (`sha256: 0704567c02754a2c01561529c4bf1d1a6216d65823efee47f3c5677d3bbfa4cf`) e a auditoria das 9 releases reais (`v6.2.0` a `v7.2.1`) comprovam que nenhuma tag histórica, commit SHA, árvore Git, release note, asset ou seção antiga do `CHANGELOG.md` é alterada, duplicada ou removida. |
| **3** | A próxima versão será calculada corretamente? | **Sim.** A partir de `v6.2.0`, `fix:` calcula `6.2.1`, `feat:` calcula `6.3.0`, `feat!:` / `BREAKING CHANGE:` calcula `7.0.0`, mudanças `docs:`/`ci:` ou adoção sem mudanças elegíveis retornam `null` (sem release), e commits acumulados com mensagens legadas não convencionais no meio calculam o maior incremento elegível (`6.3.0`). |
| **4** | A versão prevista no PR corresponde à política real de publicação? | **Sim.** `scripts/release/preview.cjs` carrega `Manifest.fromManifest` e `buildStrategy` da própria biblioteca `release-please@17.6.0` sobre a mesma baseline validada por `scripts/release/baseline.cjs` e simula o commit de squash (`PR_TITLE` + `PR_BODY`), coincidindo 100% com a versão gerada por `Manifest.buildPullRequests()`. |
| **5** | Os candidatos são consumíveis pelos testes existentes? | **Sim.** As referências `vX.Y.Z-rc.prN.sha7` e `candidate/pr-N/sha7` são consumidas remotamente via `git::https://github.com/...?ref=<CANDIDATE_TAG>` pelos jobs `fresh-installation` (Day 0) e `consumer-upgrade` (Day 2), que comprovam a igualdade da árvore Git completa (`HEAD^{tree}`). |
| **6** | Uma certificação inválida consegue autorizar uma publicação? | **Não.** `scripts/release/verify.py` (Política v3) bloqueia qualquer candidato cujo CI tenha falhado/cancelado, pertença a outro head/workflow/tentativa, omita qualquer um dos 5 jobs obrigatórios, apresente marcador fora do passo `Evaluate Infrastructure Certification Gate`, tenha `reused: true`, tenha metadados (`title`/`body`) editados após o CI ou viole os hashes `CI_POLICY` (comprovado nos 12 testes negativos de `verify-snapshot.py` e no run hospedado `45990361549`). |
| **7** | Uma falha intermediária pode deixar o processo inconsistente? | **Não de forma silenciosa ou irrecuperável.** A tag anotada grava `proposal-sha256 <digest>` no primeiro side-effect durável e o rótulo `autorelease: pending` é mantido até a confirmação byte a byte de `certification.json`. Se ocorrer falha antes da tag, após a tag, após a release ou durante/após o upload do certificado, uma reexecução recupera apenas as etapas faltantes da mesma proposta e recusa qualquer proposta ou certificado divergente (`scripts/release/tests/recovery.cjs`), enquanto `baseline.cjs` bloqueia novos previews/Release PRs até a reconciliação. |
| **8** | Podemos simplificar a implementação sem perder garantias? | **Sim, e já simplificamos na Fase 3.** Removemos a lógica complexa e frágil de reutilização de evidências por scraping de logs e o renderizador duplicado de comentários, reduzindo `preview.cjs` + `baseline.cjs` em 32,8% e `comment.cjs` em 30,3%, além de usar `LocalGitHub`, `Manifest.fromManifest` e `buildStrategy` nativos da biblioteca `17.6.0`. |
| **9** | A solução está suficientemente madura para um piloto corporativo? | **Sim, com pré-requisitos claros de governança.** A mecânica de versionamento, preview, candidatos, certificação Day 0/Day 2, gate pré-publicação, recuperação e auditoria está comprovada; para iniciar o piloto corporativo em um módulo EKS/ECS real, o Owner deve aplicar os controles da Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35) (mover `RELEASE_PLEASE_TOKEN` para um GitHub Environment restrito à `main` e ativar `require_code_owner_review: true` com `required_approving_review_count >= 1`). |

---

## 3. Revisão Independente e Adversarial (Seção 20.2)

A análise adversarial completa (arquivos, linhas na baseline `f680a2f`, cenários de reprodução, impactos, correções e retestes) encontra-se em [`docs/security-hardening.md`](security-hardening.md). Abaixo está a matriz consolidada:

| Achado | Severidade | Evidência | Correção | Reteste | Status |
|---|---|---|---|---|---|
| **S1** · Fallback de bootstrap e escrita em `ci.yml` (`ci.yml:18-20,35,47-50,326-344`) | **P0** | Checkout de `$TESTED_SHA` baseado em `user.id` e permissões `contents: write` / `pull-requests: write` no workflow `pull_request`. | Removidos fallbacks e permissões de escrita de `ci.yml`; criados `candidate.yml` (executa apenas código da base sobre objetos Git) e `certification-comment.yml` (`workflow_run`). | PRs [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31), [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32), [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33), [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34). | **VERIFIED** |
| **S2** · `RELEASE_PLEASE_TOKEN` como Repository Secret sem Environment (`release-please.yml:47` e API de secrets) | **P0** | API `/actions/secrets` lista `RELEASE_PLEASE_TOKEN` no repositório e `/environments` retorna `total_count: 0`. | Documentada migração para GitHub Environment restrito à `main` e aberta Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35). | Confirmado via API; aguarda configuração de Environment pelo Owner. | **BLOCKED** |
| **S3** · Lista fixa de arquivos no fingerprint e síntese de `PASS` (`preview.cjs:40-50,102-219`, `ci.yml:147-170`) | **P1** | Lista estática de 6 arquivos ignorava novos `.tf`, submódulos e templates; `EVIDENCE_REUSED` sintetizava `PASS`. | Removida reutilização/síntese de `PASS`; `preview.cjs`, `run-day0.sh` e `run-day2.sh` validam `HEAD^{tree}` completo; `verify.py` exige `reused: false`. | `scripts/release/tests/integrity.cjs` (11 arquivos + baseline) e `verify-snapshot.py` (`reused evidence`). | **VERIFIED** |
| **S4** · Fallback silencioso para `currentMainSha` na baseline (`preview.cjs:244-247,276`) | **P1** | Tag ausente caía silenciosamente para `currentMainSha`; `TerraformModule` era instanciado manualmente. | Criado `scripts/release/baseline.cjs` (`resolveStableBaseline`) usado em `preview.cjs` e `candidate.cjs`; adoção de `Manifest.fromManifest` + `buildStrategy`. | `integrity.cjs` (7 baselines inválidas) e `brownfield.cjs` (`tag only` e `inconsistent manifest`). | **VERIFIED** |
| **S5** · Regex de `CERTIFICATION_EVIDENCE_JSON` sem âncora de job/passo e sem digest de metadados (`verify.py:102-120`) | **P1** | Busca no log inteiro sem validar passo emissor nem edição posterior de título/corpo do PR. | Regex ancorada em `Terraform certification\tEvaluate Infrastructure Certification Gate`, validação de `metadata_digest` e `policy_version == 3`. | `scripts/release/tests/verify-snapshot.py` (12 casos negativos sobre o snapshot real de `v7.2.1`). | **VERIFIED** |
| **S6** · Tag leve sem digest da proposta na publicação (`publication.cjs:38-60`) | **P1** | Tag leve não comprometia notas e certificado durante falhas intermediárias. | Tag anotada determinística (`git mktag`) com `proposal-sha256 <digest>` e verificação byte a byte do asset antes de trocar o rótulo `autorelease: pending`. | `scripts/release/tests/recovery.cjs` (7 cenários de falha) e tag `v7.2.1` (`a5945d8ebb85b3313947d1e2c35ddce9b6a9cf8d`). | **VERIFIED** |
| **S7** · Ruleset `28132014` com zero aprovações e sem proteção de tags (`CODEOWNERS:1`, ruleset `28132014`) | **P1** | `required_approving_review_count: 0`, `require_code_owner_review: false` e ausência de ruleset para `refs/tags/v*`. | Documentados requisitos de ruleset corporativo na Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35) e em `docs/security-hardening.md`. | Inspeção via API; bloqueado no repositório individual de conta única. | **BLOCKED** |
| **S8** · Comentário do PR sem filtro de `user.id` do bot (`comment.cjs:166-191`) | **P2** | Qualquer comentário com o marcador HTML podia ser selecionado ou deletado. | Restrito a `comment.user.id === 41898282`, paginação completa, checagem de `metadata_digest` e remoção de `DELETE`. | PRs [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33) e [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34). | **VERIFIED** |
| **S9** · Janela assíncrona ao editar título/corpo sem mudar `head_sha` (`ci.yml:3-5`) | **P1** | Check suite anterior no mesmo `head_sha` permanece `CLEAN` por alguns segundos após editar metadados do PR. | `verify.py` bloqueia Release PR com `metadata_digest` divergente; documentada governança para Feature PRs. | PR [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34) (runs `46112057032` e `46112167235` no head `42ac914`) e `verify-snapshot.py`. | **OPEN** |
| **S10** · Errata documental da Fase 2 sobre dimensões do fingerprint, assinatura e recuperação (`validation-report-phase-2.md:25,38`) | **P3** | Relatório citava 8 dimensões e assinatura em log; implementação tinha 7 campos e JSON sem PKI; run `45992557601` testou apenas idempotência pós-release. | Errata e distinção formal documentadas em `docs/security-hardening.md`; fault injection real implementado em `recovery.cjs`. | Validado em `integrity.cjs` e `recovery.cjs`. | **VERIFIED** |

---

## 4. Resultados da Homologação H35–H45 (Fase 9 / Seção 20.3)

Conforme as regras de classificação da Seção 15:
- Experimentos executados apenas em fixtures locais isoladas (mesmo com Git real e biblioteca real `release-please@17.6.0`) **não** são classificados como homologações completas no GitHub hospedado (`PARTIAL` quando a comprovação end-to-end hospedada exigiria um segundo repositório remoto legado ou quando há dependência administrativa externa `BLOCKED`).

### 4.1 Matriz Resumo H35–H45

| ID | Experimento | Classificação | Ambiente de Execução | Evidência Principal |
|---|---|---|---|---|
| **H35** | Brownfield Adoption | **PARTIAL** | Local (Git real + `release-please@17.6.0` + `preview.cjs` + `baseline.cjs`; API GitHub em memória) | `scripts/release/tests/brownfield.cjs` (9 cenários aprovados), executado também no CI hospedado do PR [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34) ([run 46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235)). |
| **H36** | Historical Release Preservation | **PASS** | Local (fixture brownfield `v6.0.0`..`v6.2.0`) + GitHub Hospedado (`v6.2.0`..`v7.2.0` após `v7.2.1`) | Inventário local SHA-256 `0704567c02754a2c01561529c4bf1d1a6216d65823efee47f3c5677d3bbfa4cf` inalterado + [`docs/evidence/phase-3-baseline.json`](evidence/phase-3-baseline.json) + `scripts/audit-release.py` nas 9 releases hospedadas. |
| **H37** | Existing Changelog | **PASS** | Local (fixture brownfield com `CHANGELOG.md` manual de 4 versões) + GitHub Hospedado (`CHANGELOG.md` em `v7.2.1`) | `scripts/release/tests/brownfield.cjs` (`updated.split(oldSections).length === 2`) + commit `082083dc6d66c6521d28e9f3e5c0df9308f8720d` (PR [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33)). |
| **H38** | Historical Non-Conventional Commits | **PASS** | Local (commits históricos `"Entrega manual 6.0.0"`..`"6.2.0"` e `"Legacy adjustment"` pós-tag) | `scripts/release/tests/brownfield.cjs` (cenários `patch`, `minor`, `major`, `docs`, `no change`, `accumulated`). |
| **H39** | First Automated Release | **PARTIAL** | Local (ciclo completo `v6.2.0` -> preview `6.2.1` -> RC `v6.2.1-rc.pr1.0b99cd4` -> Release PR `6.2.1` -> release `v6.2.1`) | `scripts/release/tests/brownfield.cjs` (validação local com biblioteca real; homologação hospedada de primeira adoção requer repositório remoto legado dedicado). |
| **H40** | No Change Adoption | **PASS** | Local (cenários `no change` e `docs` em `brownfield.cjs`) + GitHub Hospedado (PRs [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31) `ci:` e [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34) `test:`) | Runs [46111431045](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111431045) (após PR #31) e [46112309380](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112309380) (após PR #34): zero Release PRs ou tags criadas sem mudança elegível. |
| **H41** | Fingerprint Integrity | **PASS** | Local (`integrity.cjs` + `verify-snapshot.py`) + GitHub Hospedado (PRs [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32) e [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33)) | `scripts/release/tests/integrity.cjs` (11 tipos de arquivos + mudança de baseline + 7 baselines inválidas) + `verify-snapshot.py` (12 rejeições) + CI completo no PR #33 ([run 46111741239](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111741239)). |
| **H42** | Privilege Separation | **BLOCKED** | GitHub Hospedado (`candidate.yml`, `ci.yml`, `certification-comment.yml`, `release-please.yml`) + Auditoria de API | Separação de workflows implementada e verificada nos PRs #31–#34; bloqueado para piloto corporativo pelos achados administrativos S2 (Repository Secret sem Environment) e S7 (ruleset com 0 reviews) registrados na Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35). |
| **H43** | Partial Publication Recovery | **PARTIAL** | Local (fault injection real contra remoto Git bare em `recovery.cjs`) + GitHub Hospedado (publicação real de `v7.2.1` com tag anotada `proposal-sha256`) | `scripts/release/tests/recovery.cjs` (7 cenários de falha intermediária recuperados com retenção da proposta original) + publicação hospedada [run 46111816814](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111816814). |
| **H44** | Concurrent Publication | **PASS** | Local (competição de propostas divergentes em `recovery.cjs`) + GitHub Hospedado (dispatches concorrentes sobre `v7.2.1` e recertificação por edição em #34) | `recovery.cjs` (`competing` -> `[0, 1]`, `different-commit` recusado) + runs hospedados [46111882403](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111882403) e [46111884565](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111884565) em `082083d` + runs [46112057032](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112057032) e [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235) no PR #34. |
| **H45** | Historical Regression | **PASS** | Local (`certify.sh` 19 testes Terraform + `check-policy.cjs` 10 casos) + GitHub Hospedado (`audit-release.py` em todas as 9 releases `v6.2.0`..`v7.2.1`) | `scripts/audit-release.py` aprovado para `v6.2.0`, `v6.2.1`, `v6.3.0`, `v7.0.0`, `v7.0.1`, `v7.1.0`, `v7.1.1`, `v7.2.0` e `v7.2.1`. |

---

### 4.2 Fichas Detalhadas dos Experimentos H35–H45

#### H35 — Brownfield Adoption
- **Resultado esperado**: Release Please assume a baseline de um módulo com releases manuais anteriores (`v6.0.0`, `v6.1.0`, `v6.1.1`, `v6.2.0`), validando a consistência do manifest e da última release manual antes de calcular candidatos.
- **Resultado observado**: A suíte `scripts/release/tests/brownfield.cjs` criou um repositório Git real com 4 releases manuais (`v6.0.0` a `v6.2.0`), introduziu `release-please-config.json`, `.release-please-manifest.json` (`6.2.0`) e `.release/brownfield.json`, e executou `preview.cjs` (`resolveStableBaseline`) e `Manifest.fromManifest`. O Release Please localizou `v6.2.0` (`sha: b458866104f12e5093372f0e756ad7b93f997ddb`) e assumiu o controle sem exigir reinicialização do histórico. Quando o manifest foi configurado de forma inconsistente (`6.1.0` ou `6.2.5`) ou quando a tag `v6.2.0` não possuía objeto GitHub Release (`tag only`), `resolveStableBaseline` bloqueou explicitamente a operação.
- **Ambiente de execução**: Local (repositório Git real e `release-please@17.6.0` real; API de Releases/PRs simulada em memória) e executado dentro do job hospedado `Terraform Contract Tests`.
- **Tipo de evidência**: Teste automatizado reproduzível (`node scripts/release/tests/brownfield.cjs`) e log do GitHub Actions.
- **Commit SHA**: `15712646e80ed22116f7ecae108276dcc4afc00b` (e melhorias locais na branch da Fase 3).
- **PR associado**: [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Workflow run**: [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235).
- **Limitações**: Como o repositório autorizado da POC já utiliza Release Please desde a Fase 1 e as regras proíbem modificar releases históricas ou criar novos repositórios remotos sem autorização, a simulação de adoção brownfield utiliza transporte de API em memória para Releases/PRs.
- **Classificação**: **`PARTIAL`**.

#### H36 — Historical Release Preservation
- **Resultado esperado**: Tags, releases, SHAs, árvores, assets e referências anteriores consumidas por usuários permanecem inalterados após a adoção e após novas releases.
- **Resultado observado**:
  1. Na fixture brownfield (`scripts/release/tests/brownfield.cjs`), o inventário criptográfico das 4 tags e releases manuais (`v6.0.0`, `v6.1.0`, `v6.1.1`, `v6.2.0`, incluindo `notes.txt` e o conteúdo resolvido pelo consumidor em `git show v6.1.1:main.tf`) permaneceu bit a bit idêntico antes e depois da publicação automatizada (`sha256: 0704567c02754a2c01561529c4bf1d1a6216d65823efee47f3c5677d3bbfa4cf`).
  2. No repositório hospedado no GitHub, todas as 18 refs e 16 releases inventariadas na baseline da Fase 0 ([`docs/evidence/phase-3-baseline.json`](evidence/phase-3-baseline.json)) permaneceram intactas após a publicação da `v7.2.1`.
- **Ambiente de execução**: Local (fixture Git real) + GitHub Hospedado.
- **Tipo de evidência**: Comparação de inventário JSON/SHA-256 (`docs/evidence/phase-3-baseline.json`) e auditoria via API (`scripts/audit-release.py`).
- **Commit SHA**: `082083dc6d66c6521d28e9f3e5c0df9308f8720d` / `15712646e80ed22116f7ecae108276dcc4afc00b`.
- **PR associado**: [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33), [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Workflow run**: [46111816814](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111816814), [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235).
- **Limitações**: Nenhuma.
- **Classificação**: **`PASS`**.

#### H37 — Existing Changelog
- **Resultado esperado**: O `CHANGELOG.md` histórico existente é mantido sem duplicação, truncamento ou perda de notas manuais.
- **Resultado observado**: Na fixture brownfield (`brownfield.cjs`), o `CHANGELOG.md` pré-existente com as seções manuais `## 6.0.0`, `## 6.1.0`, `## 6.1.1` e `## 6.2.0` recebeu a nova seção `## [6.2.1]` (ou `6.3.0`/`7.0.0`) logo após o cabeçalho `# Changelog`, mantendo a substring completa de todas as seções históricas exatamente uma única vez (`updated.split(oldSections).length === 2`). No repositório hospedado, a release `v7.2.1` (PR #33, commit `082083d`) adicionou `## [7.2.1]` preservando todas as seções anteriores de `7.2.0` até `6.2.0`.
- **Ambiente de execução**: Local + GitHub Hospedado.
- **Tipo de evidência**: Asserção automatizada em `brownfield.cjs` e arquivo `CHANGELOG.md` auditado por `scripts/audit-release.py` na tag `v7.2.1`.
- **Commit SHA**: `082083dc6d66c6521d28e9f3e5c0df9308f8720d`.
- **PR associado**: [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33).
- **Workflow run**: [46111702360](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111702360), [46111816814](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111816814).
- **Limitações**: Nenhuma.
- **Classificação**: **`PASS`**.

#### H38 — Historical Non-Conventional Commits
- **Resultado esperado**: Commits históricos fora do padrão Conventional Commits (anteriores ou posteriores à baseline) não comprometem o cálculo correto das próximas versões.
- **Resultado observado**: Em `scripts/release/tests/brownfield.cjs`, os 4 commits das releases manuais tinham mensagens livres (`"Entrega manual 6.0.0"` a `"Entrega manual 6.2.0"`), e o cenário `accumulated` incluiu também um commit não convencional após a tag (`"Legacy adjustment"`) seguido de `"fix: repair output"` e `"feat: extend output"`. O Release Please parou a busca histórica exatamente no SHA de `v6.2.0`, ignorou `"Legacy adjustment"` com warning controlado e calculou determinísticamente `6.3.0` (MINOR).
- **Ambiente de execução**: Local (Git real + `release-please@17.6.0`) e CI hospedado.
- **Tipo de evidência**: Execução de `scripts/release/tests/brownfield.cjs`.
- **Commit SHA**: `15712646e80ed22116f7ecae108276dcc4afc00b`.
- **PR associado**: [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Workflow run**: [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235).
- **Limitações**: Nenhuma quanto ao motor de parsing e coleta de commits do Release Please `17.6.0`.
- **Classificação**: **`PASS`**.

#### H39 — First Automated Release
- **Resultado esperado**: Partindo da última release manual `v6.2.0`, o primeiro commit `fix: correct module behavior` prevê `v6.2.1`, gera a candidata `v6.2.1-rc.pr1.<sha7>`, abre o Release PR `6.2.1` e constrói a release estável `v6.2.1`; também são validados o primeiro `feat:` (`6.3.0`) e a primeira breaking change `feat!:` (`7.0.0`).
- **Resultado observado**:
  - `patch` (`fix: correct module behavior`): Preview = `6.2.1`, RC = `v6.2.1-rc.pr1.0b99cd4`, Release PR = `chore(main): release 6.2.1`, Release = `v6.2.1` (`be31c6678e620b31a5245c56e995515458d9dcd5`).
  - `minor` (`feat: add output`): Preview = `6.3.0`, RC = `v6.3.0-rc.pr1.7c565b5`, Release PR = `chore(main): release 6.3.0`, Release = `v6.3.0` (`d636d9dd8b7e231ab9c9a8d98c836b4ceb2fcdda`).
  - `major` (`feat!: remove old output`): Preview = `7.0.0`, RC = `v7.0.0-rc.pr1.0074dc6`, Release PR = `chore(main): release 7.0.0`, Release = `v7.0.0` (`8f21b43b15c8284086117a541f154c3b46e6b7c8`).
- **Ambiente de execução**: Local (Git real + `preview.cjs` + `LocalGitHub` / `Manifest` `17.6.0`), executado também no CI hospedado.
- **Tipo de evidência**: Log e asserções de `scripts/release/tests/brownfield.cjs`.
- **Commit SHA**: `15712646e80ed22116f7ecae108276dcc4afc00b`.
- **PR associado**: [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Workflow run**: [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235).
- **Limitações**: A geração do Release PR e da release para a fixture `v6.2.0` utilizou adaptador `LocalGitHub` em memória; uma primeira release brownfield hospedada requer um repositório remoto legado ainda não gerenciado pelo Release Please.
- **Classificação**: **`PARTIAL`**.

#### H40 — No Change Adoption
- **Resultado esperado**: A introdução da automação sem mudança funcional elegível (ou PRs puramente `ci:`, `docs:`, `test:`) não cria Release PR nem release desnecessária.
- **Resultado observado**:
  1. Na fixture brownfield (`brownfield.cjs`), tanto o cenário `no change` (apenas o commit `ci: adopt release management`) quanto o cenário `docs` (`docs: explain inputs`) resultaram em `expected_next_version: null` e `manifest.buildPullRequests().length === 0`.
  2. No GitHub hospedado, após o merge do PR [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31) (`ci: prepare candidate references using trusted base code`, candidato isolado `candidate/pr-31/07253c4`, merge `5f0c636`) e após o merge do PR [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34) (`test: exercise brownfield adoption and interrupted publication`, merge `1571264`), as execuções de `Release Please` na `main` ([run 46111431045](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111431045) e [run 46112309380](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112309380)) concluíram com sucesso sem abrir Release PR e sem criar tag.
- **Ambiente de execução**: Local + GitHub Hospedado.
- **Tipo de evidência**: Runs hospedados `46111431045` e `46112309380` + asserções de `brownfield.cjs`.
- **Commit SHA**: `5f0c636bd6ad637786895730d1cbb741310e4d73` e `15712646e80ed22116f7ecae108276dcc4afc00b`.
- **PR associado**: [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31), [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Workflow run**: [46111431045](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111431045), [46112309380](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112309380).
- **Limitações**: Nenhuma.
- **Classificação**: **`PASS`**.

#### H41 — Fingerprint Integrity
- **Resultado esperado**: Mudanças relevantes em qualquer arquivo do repositório invalidam o fingerprint de equivalência, reutilizações indevidas ou evidências adulteradas são recusadas e toda publicação exige certificação válida da árvore completa.
- **Resultado observado**:
  1. `scripts/release/tests/integrity.cjs` comprovou que a adição ou alteração de 11 categorias de arquivos (`new.tf`, `cluster.tf.json`, `modules/child/main.tf`, `templates/launch.tftpl`, `bin/helper`, `fixtures/consumer/main.tf`, `config.json`, `.terraform.lock.hcl`, `scripts/release/package-lock.json`, `.github/workflows/ci.yml`, `scripts/certify.sh`) e a mudança da versão estável de origem (`6.2.0` -> `6.1.1`) alteram determinísticamente o `equivalence_fingerprint`, além de recusar 7 estados inválidos de baseline.
  2. `scripts/release/tests/verify-snapshot.py` executou replay contra a publicação real `v7.2.1` (PR #33) e comprovou recusa (`Certification denied`) para todas as 12 condições adversariais: `cancelled`, `failed`, `other workflow`, `other head`, `other attempt`, `missing job`, `incomplete evidence`, `marker outside gate`, `other metadata`, `stale candidate ref`, `reused evidence` e `unreviewed policy`.
  3. No GitHub hospedado, o Release PR [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33) (`v7.2.1`) executou certificação completa (`evidence_reuse.reused: false`) validando a árvore Git inteira (`192d4355f722292a23b07d2de74de35f36264306`) em Day 0 e Day 2 ([run 46111741239](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111741239)).
- **Ambiente de execução**: Local + GitHub Hospedado.
- **Tipo de evidência**: `scripts/release/tests/integrity.cjs`, `scripts/release/tests/verify-snapshot.py` e certificado publicado de `v7.2.1`.
- **Commit SHA**: `6c8a24ba9907119e4300e92a547a87ff476194e4`, `082083dc6d66c6521d28e9f3e5c0df9308f8720d`, `15712646e80ed22116f7ecae108276dcc4afc00b`.
- **PR associado**: [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32), [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33), [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Workflow run**: [46111620695](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111620695), [46111741239](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111741239), [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235).
- **Limitações**: Nenhuma.
- **Classificação**: **`PASS`**.

#### H42 — Privilege Separation
- **Resultado esperado**: Código candidato não consegue executar operações privilegiadas, acessar o PAT, criar tag estável prematuramente ou substituir a política de certificação para autorizar a própria publicação.
- **Resultado observado**:
  - **Controles de código e workflow comprovados (`PASS`)**:
    1. `.github/workflows/ci.yml` opera com `permissions: contents: read` em todos os jobs e `persist-credentials: false`, sem fallback de bootstrap.
    2. `.github/workflows/candidate.yml` executa apenas o código de `github.event.pull_request.base.sha` (`main`), buscando o PR apenas como objeto Git sem checkout de arquivos candidatos.
    3. `scripts/release/rc.cjs` recusa qualquer tag no formato `^v\d+\.\d+\.\d+$` (`Refusing to create stable tag prematurely`).
    4. `scripts/release/verify.py` recusa qualquer divergência nos hashes `CI_POLICY` (`PASS denied unreviewed policy`).
  - **Controles administrativos pendentes (`BLOCKED`)**:
    1. A API do GitHub confirmou que `RELEASE_PLEASE_TOKEN` ainda é um **Repository Secret** (`environments: []`, Achado S2).
    2. O ruleset `28132014` possui `required_approving_review_count: 0` e `require_code_owner_review: false` (Achado S7).
- **Ambiente de execução**: GitHub Hospedado + Inspeção de API + Replay negativo (`verify-snapshot.py`).
- **Tipo de evidência**: Workflows `.github/workflows/candidate.yml`, `ci.yml`, `certification-comment.yml`, `release-please.yml`, runs dos PRs #31–#34 e Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35).
- **Commit SHA**: `5f0c636bd6ad637786895730d1cbb741310e4d73`, `6c8a24ba9907119e4300e92a547a87ff476194e4`.
- **PR associado**: [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31), [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32), Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35).
- **Workflow run**: [46111620681](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111620681), [46111620695](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111620695).
- **Limitações**: A migração do PAT para um GitHub Environment restrito à `main` e a exigência de revisor independente no ruleset dependem de ação administrativa do Owner (Issue #35).
- **Classificação**: **`BLOCKED`**.

#### H43 — Partial Publication Recovery
- **Resultado esperado**: Falhas intermediárias antes da tag, após a tag, após a criação da GitHub Release, na falha de upload do certificado ou em timeout pós-upload são recuperadas sem duplicidade, mantendo a proposta original e recusando tags ou certificados divergentes.
- **Resultado observado**:
  1. `scripts/release/tests/recovery.cjs` executou o publicador real `publication.cjs` contra um repositório Git remoto `--bare` com injeção controlada de falhas nos 7 cenários (`before-tag`, `after-tag`, `after-release`, `upload-failed`, `upload-timeout`, `competing`, `different-commit`) mais corrupção do asset `certification.json` (`different bytes`). Em todos os cenários parciais, a tag anotada `refs/tags/v6.2.1` preservou o `proposal-sha256`, recusou uma proposta divergente (`exit 1`), completou a publicação na reexecução com a proposta original (`exit 0`), manteve idempotência em repetição subsequente (`exit 0`) e recusou asset adulterado (`exit 1`).
  2. No GitHub hospedado, a release [`v7.2.1`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.2.1) ([run 46111816814](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111816814)) publicou a tag anotada `a5945d8ebb85b3313947d1e2c35ddce9b6a9cf8d` comprometida com `proposal-sha256 d13ea1d8886a79d61005a341de267dc10ded8139e057f261e79c2d9eff6e93b3` e o certificado `certification.json` v3.
- **Ambiente de execução**: Local (remoto Git bare real + double de API de Releases em arquivo) + GitHub Hospedado (publicação positiva v3 e reexecuções).
- **Tipo de evidência**: `scripts/release/tests/recovery.cjs` e auditoria hospedada de `v7.2.1` (`scripts/audit-release.py`).
- **Commit SHA**: `6c8a24ba9907119e4300e92a547a87ff476194e4`, `082083dc6d66c6521d28e9f3e5c0df9308f8720d`, `15712646e80ed22116f7ecae108276dcc4afc00b`.
- **PR associado**: [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32), [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33), [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Workflow run**: [46111816814](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111816814), [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235).
- **Limitações**: A injeção de falha entre a criação da tag e a criação da GitHub Release foi executada contra o remoto Git bare local para não deixar uma release real do GitHub em estado degradado.
- **Classificação**: **`PARTIAL`**.

#### H44 — Concurrent Publication
- **Resultado esperado**: Execuções concorrentes ou candidatos obsoletos/divergentes não publicam conteúdo diferente do autorizado.
- **Resultado observado**:
  1. No GitHub hospedado, dois `workflow_dispatch` concorrentes de `release-please.yml` sobre o commit `082083dc6d66c6521d28e9f3e5c0df9308f8720d` ([run 46111882403](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111882403) e [run 46111884565](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111884565)) foram serializados pelo grupo `concurrency: release-please-main` (`cancel-in-progress: false`) e preservaram a tag única `v7.2.1` e seu certificado intactos.
  2. No PR [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34), a edição do corpo do PR no mesmo head `42ac914` disparou nova certificação ([run 46112057032](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112057032) -> [run 46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235)) e atualizou o comentário com o novo `metadata_digest`.
  3. Em `scripts/release/tests/recovery.cjs` (`competing`), duas execuções simultâneas de `publish` disputando a mesma tag `v6.2.1` no remoto Git bare com propostas diferentes resultaram determinísticamente em `[0, 1]` (uma vencedora e uma recusada por colisão atômica de ref no Git).
- **Ambiente de execução**: Local + GitHub Hospedado.
- **Tipo de evidência**: Runs hospedados `46111882403`, `46111884565`, `46112057032`, `46112167235` e teste `competing` em `recovery.cjs`.
- **Commit SHA**: `082083dc6d66c6521d28e9f3e5c0df9308f8720d`, `15712646e80ed22116f7ecae108276dcc4afc00b`.
- **PR associado**: [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33), [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34).
- **Workflow run**: [46111882403](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111882403), [46111884565](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111884565), [46112057032](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112057032), [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235).
- **Limitações**: Nenhuma.
- **Classificação**: **`PASS`**.

#### H45 — Historical Regression
- **Resultado esperado**: A implementação da Fase 3 preserva integralmente as garantias, contratos Terraform e auditorias das Fases 1 e 2 (`H01–H34`).
- **Resultado observado**:
  1. `bash scripts/certify.sh` executou `terraform fmt -check`, `terraform validate`, os 19 testes de contrato em `tests/contract.tftest.hcl`, a validação de `examples/complete`, as asserções `jq` dos manifests e a verificação de hashes `CI_POLICY` com 100% de aprovação (`19 passed, 0 failed`).
  2. `node scripts/check-policy.cjs` validou os 10 casos da matriz SemVer da Fase 1.
  3. `python3 scripts/audit-release.py` auditou com sucesso todas as 9 releases estáveis publicadas no repositório (`v6.2.0` a `v7.2.1`), validando commits, árvores, changelogs, manifests, certificados v1/v2/v3 e a tag anotada `proposal-sha256` da `v7.2.1`.
- **Ambiente de execução**: Local + GitHub Hospedado (API GitHub ao vivo).
- **Tipo de evidência**: Saída JSON de `scripts/audit-release.py` para as 9 releases estáveis e execução de `scripts/certify.sh`.
- **Commit SHA**: `15712646e80ed22116f7ecae108276dcc4afc00b`.
- **PR associado**: [#1](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/1), [#3](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/3), [#8](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/8), [#12](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/12), [#20](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/20), [#24](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/24), [#28](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/28), [#29](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/29), [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33).
- **Workflow run**: [45746401361](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746401361), [45746966949](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746966949), [45747308832](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747308832), [45753676786](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753676786), [45753946032](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753946032), [45821415181](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45821415181), [45989998572](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45989998572), [45991745368](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45991745368), [46111741239](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111741239).
- **Limitações**: Nenhuma.
- **Classificação**: **`PASS`**.

---

## 5. Rastreabilidade Completa de Evidências (Seção 20.7)

### 5.1 Releases Estáveis Auditadas (`v6.2.0` a `v7.2.1`)

| Tag Estável | PR | CI Run ID | Commit SHA (Squash / Tag) | Certified Tree SHA | Candidato Associado | Política / Certificado |
|---|---|---|---|---|---|---|
| [`v6.2.0`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v6.2.0) | [#1](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/1) | [45746401361](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746401361) | `6042bf2bff2cf45cba858c4bae677709120d6298` | `9cb343f3ec8fc570368b69f5a8e2e79eee00b94e` | Baseline inicial | Fase 1 (pré-certificado) |
| [`v6.2.1`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v6.2.1) | [#3](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/3) | [45746966949](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746966949) | `e39cbc4984b2388be44a3c45a3ae3ca26b00a14b` | `6feefe1c4cf04ca60af83723ee9277bf9a862554` | Head `103a2d7` | Fase 1 (pré-certificado) |
| [`v6.3.0`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v6.3.0) | [#8](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/8) | [45747308832](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747308832) | `eeb9208b5e8d863c5606db275b9d53483d69cd6b` | `3e86828c1f15cc30c72d55a031e9a9686148777d` | Head `bc6c573` | Fase 1 (pré-certificado) |
| [`v7.0.0`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.0.0) | [#12](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/12) | [45753676786](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753676786) | `70b0f83a10fde9174b949e92c9901de78e6e9086` | `77c7ec777374a7f1780f9407c0a1a2511881ad1e` | Head `1351944` | Fase 1 (PAT) |
| [`v7.0.1`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.0.1) | [#20](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/20) | [45753946032](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753946032) | `d1ccee5653cc6c1ac703e0f09ee73c4a2c1c8a8a` | `3c5bd2edb98fdcfe7f786807451bb2038ad07d72` | Head `6f4191d` | Fase 1 (PAT) |
| [`v7.1.0`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.1.0) | [#24](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/24) | [45821415181](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45821415181) | `7094d1b149697f366165ea756fb6cee9dbbac1fe` | `f1ac7cf7d06866da7ade9924cd0af240cc32b761` | Head `bcec806` | Política v1 (`certification.json`) |
| [`v7.1.1`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.1.1) | [#28](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/28) | [45989998572](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45989998572) | `51317507dd5f7a997d11e1ae25972d28f5237653` | `d7f8f60b191a9b23a474b3560bdde74b0cfebc6c` | `v7.1.1-rc.pr28.f0a7758` | Política v2 (`certification.json`) |
| [`v7.2.0`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.2.0) | [#29](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/29) | [45991745368](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45991745368) | `3bbce0ae0c461668d68566390c45b3520476fdc9` | `a926f7e799b8d1abfb4b456b40395912351d0f19` | `v7.2.0-rc.pr29.1c3e58e` | Política v2 (`certification.json`) |
| [`v7.2.1`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.2.1) | [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33) | [46111741239](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111741239) | `082083dc6d66c6521d28e9f3e5c0df9308f8720d` | `192d4355f722292a23b07d2de74de35f36264306` | `v7.2.1-rc.pr33.99566ce` | **Política v3** (`certification.json` + tag anotada `a5945d8ebb85b3313947d1e2c35ddce9b6a9cf8d`, `proposal-sha256: d13ea1d8886a79d61005a341de267dc10ded8139e057f261e79c2d9eff6e93b3`) |

### 5.2 Pull Requests e Workflows Executados na Fase 3

- **PR [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31)**: `ci: prepare candidate references using trusted base code`
  - Head SHA: `07253c47fd13d24ee498b8c432deb7dfbf61f28c` · Merge SHA: `5f0c636bd6ad637786895730d1cbb741310e4d73`
  - Ref candidata isolada: `candidate/pr-31/07253c4`
  - Runs: [46111337744](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111337744) (`Terraform CI`), [46111431045](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111431045) (`Release Please` — H40 sem release).
- **PR [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32)**: `fix: certify the complete downloaded module tree before publication`
  - Head SHA: `62d068a15e8b6125e55e15d79abdffcdbdbe3624` · Merge SHA: `6c8a24ba9907119e4300e92a547a87ff476194e4`
  - Ref candidata SemVer: [`v7.2.1-rc.pr32.62d068a`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.2.1-rc.pr32.62d068a)
  - Runs: [46111620681](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111620681) (`Prepare remote candidate`), [46111620695](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111620695) (`Terraform CI`), [46111702360](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111702360) (`Release Please` — abriu PR #33).
- **PR [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33)**: `chore(main): release 7.2.1`
  - Head SHA: `99566ce97c2f17dd6c36bdb9b867ee8ab3675ec0` · Merge SHA: `082083dc6d66c6521d28e9f3e5c0df9308f8720d`
  - Ref candidata SemVer: [`v7.2.1-rc.pr33.99566ce`](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.2.1-rc.pr33.99566ce)
  - Runs: [46111741177](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111741177) (`Prepare remote candidate`), [46111741239](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111741239) (`Terraform CI`), [46111787236](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111787236) (`Report hosted certification`), [46111816814](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111816814) (`Release Please` — publicou `v7.2.1`), [46111882403](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111882403) e [46111884565](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111884565) (`Release Please` — dispatches concorrentes H44).
- **PR [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34)**: `test: exercise brownfield adoption and interrupted publication`
  - Head SHA: `42ac91421a0e687b45b47bd9132157b773eac977` · Merge SHA: `15712646e80ed22116f7ecae108276dcc4afc00b`
  - Runs na abertura: [46112057024](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112057024) (`Prepare remote candidate`), [46112057032](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112057032) (`Terraform CI`), [46112123839](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112123839) (`Report hosted certification`).
  - Runs após edição de metadados (`edited` no mesmo head `42ac914`): [46112167508](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167508) (`Prepare remote candidate`), [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235) (`Terraform CI`), [46112223243](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112223243) (`Report hosted certification`).
  - Run pós-merge: [46112309380](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112309380) (`Release Please` — H40 sem release).

---

## 6. Definition of Done (Seção 19)

- [x] Decisões do Owner preservadas (`D01`–`D13`).
- [x] PAT mantido (`RELEASE_PLEASE_TOKEN`).
- [x] Nenhuma GitHub App criada.
- [x] Revisão independente concluída (Achados `S1`–`S10`).
- [x] Achados P0 e P1 corrigidos (`S1`, `S3`, `S4`, `S5`, `S6`) ou explicitamente reportados como bloqueantes/abertos (`S2`, `S7` na Issue #35; `S9` documentado).
- [x] Histórico de releases preservado (`v6.2.0` a `v7.2.1` + fixture brownfield `v6.0.0` a `v6.2.0`).
- [x] Adoção brownfield validada no nível de ambiente efetivamente disponível (`scripts/release/tests/brownfield.cjs`).
- [x] Manifest e changelog existentes preservados.
- [x] Primeira release automatizada validada (`6.2.1`, `6.3.0`, `7.0.0`).
- [x] Ausência de release desnecessária validada (`no change`, `docs`, PRs #31 e #34).
- [x] Version Preview revisado (`LocalGitHub` + `Manifest.fromManifest` + `buildStrategy` + `baseline.cjs`).
- [x] Estratégia híbrida de candidatos preservada (`vX.Y.Z-rc.prN.sha7` e `candidate/pr-N/sha7`).
- [x] Separação de privilégios revisada (`candidate.yml`, `ci.yml` read-only, `certification-comment.yml`).
- [x] Fallback inseguro de bootstrap eliminado.
- [x] Fingerprint revisado (árvore Git completa `HEAD^{tree}`).
- [x] Procedência das evidências validada (`verify.py` Política v3 + `verify-snapshot.py`).
- [x] Reutilização insegura impedida (`reused: false` obrigatório).
- [x] Recuperação de publicação parcial homologada (`recovery.cjs` + tag anotada com `proposal-sha256`).
- [x] Concorrência revisada (`competing` em `recovery.cjs` + runs `46111882403`/`46111884565`).
- [x] Certificação pré-publicação preservada (`authorize` / `verify.py`).
- [x] Auditoria pós-publicação preservada e ampliada (`scripts/audit-release.py`).
- [x] Experimentos H35–H45 classificados com rigor metodológico.
- [x] Regressão H01–H34 executada na extensão aplicável.
- [x] Documentação brownfield concluída ([`docs/brownfield-adoption.md`](brownfield-adoption.md)).
- [x] Guia de integração corporativa concluído ([`docs/corporate-integration-guide.md`](corporate-integration-guide.md)).
- [x] Nenhum recurso AWS provisionado.
