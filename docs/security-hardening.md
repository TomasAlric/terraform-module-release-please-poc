# Revisão Independente e Hardening de Segurança (Fase 3)

Este documento registra a revisão independente e adversarial realizada na **Fase 3** sobre a baseline deixada ao final da Fase 2 (`f680a2f3933c5796d1479adb6a464480cf9db814`), os achados classificados por severidade (`P0`–`P3`), as correções implementadas, as evidências antes e depois de cada correção e os controles de governança dependentes do Owner.

---

## 1. Matriz Consolidada da Revisão Independente

As linhas indicadas na coluna de achados referem-se à baseline da Fase 2 (`f680a2f`). Nenhum experimento tentou extrair ou expor o valor do secret `RELEASE_PLEASE_TOKEN`.

| Achado | Severidade | Evidência | Correção | Reteste | Status |
|---|---|---|---|---|---|
| **S1** · Fallback de bootstrap e escrita no workflow de PR (`.github/workflows/ci.yml:18-20,35,47-50,326-344`) | **P0** | Em `f680a2f`, `prepare-candidate` (`contents: write`, `pull-requests: write`, `persist-credentials: true`) e `publish-comment` (`pull-requests: write`) executavam dentro do `ci.yml` acionado por `pull_request` e continham fallback `git checkout "$TESTED_SHA" -- scripts/release scripts/certify` condicionado apenas a `user.id == 82914085`. Além disso, um PR podia modificar o próprio `.github/workflows/ci.yml`. | Eliminados ambos os fallbacks e removidas todas as permissões de escrita de `ci.yml` (`permissions: contents: read` em todos os jobs, `persist-credentials: false`). Criação de referências candidatas movida para `.github/workflows/candidate.yml` (definição da base, checkout de `base.sha`, leitura de objetos Git sem checkout do código candidato) e atualização do comentário movida para `.github/workflows/certification-comment.yml` (`workflow_run` na `main`). | PRs [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31), [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32), [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33) e [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34) executaram com separação estrita de workflows e zero permissões de escrita em `ci.yml`. | **VERIFIED** |
| **S2** · Custódia do `RELEASE_PLEASE_TOKEN` como Repository Secret sem Environment restrito (`.github/workflows/release-please.yml:47-79` e configuração do repositório) | **P0** | A inspeção via API (`gh api repos/.../actions/secrets` e `/environments`) comprovou que `RELEASE_PLEASE_TOKEN` está armazenado como **Repository Secret** e `environments` possui `total_count: 0`. Embora o token só seja referenciado em `release-please.yml` na `main`, o GitHub disponibiliza Repository Secrets a qualquer workflow executado em branches internas do repositório caso um colaborador com permissão de push crie ou altere um workflow em uma branch. | Documentado o requisito arquitetural de migrar `RELEASE_PLEASE_TOKEN` para um **GitHub Environment** (ex.: `release-publisher`) com deployment branch policy restrita a `refs/heads/main` e remover a cópia de Repository Secret. Registrado o impedimento administrativo na Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35). | Inspeção de API confirma que a migração de custódia do secret depende de ação administrativa do Owner no painel de Settings/Environments. | **BLOCKED** |
| **S3** · Lista estática de 6 arquivos no fingerprint e síntese de `PASS` por log parsing (`scripts/release/preview.cjs:40-50,102-219` e `.github/workflows/ci.yml:147-170,211-239`) | **P1** | Em `f680a2f`, `computeEquivalenceContract` verificava apenas 6 caminhos fixos (`main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `tests/contract.tftest.hcl`, `examples/complete/main.tf`), ignorando novos arquivos `.tf`, `.tf.json`, submódulos locais, templates e scripts. Além disso, `run-day0.sh` e `run-day2.sh` comparavam apenas 4 arquivos `.tf`, e `ci.yml` sintetizava `PASS` sem executar Day 0/Day 2 quando `EVIDENCE_REUSED == true` com base na primeira regex `CERTIFICATION_EVIDENCE_JSON` encontrada em logs anteriores. | Removida a reutilização insegura e as rotas que sintetizavam `PASS` em `ci.yml` (`evidence_reuse.reused = false`, execução integral obrigatória em todo candidato e Release PR). `computeEquivalenceContract` em `preview.cjs` e a verificação de integridade em `run-day0.sh` e `run-day2.sh` passaram a validar o hash da árvore Git completa (`git rev-parse 'HEAD^{tree}'`). | `scripts/release/tests/integrity.cjs` comprovou invalidação do fingerprint em 11 categorias de arquivos e mudança de baseline; Release PR [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33) ([run 46111741239](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111741239)) executou certificação completa e `verify.py` exige `reused == false`. | **VERIFIED** |
| **S4** · Fallback silencioso para `currentMainSha` na descoberta da versão estável e instanciação manual da estratégia (`scripts/release/preview.cjs:244-247,276-285`) | **P1** | Em `f680a2f`, quando a tag correspondente ao manifest não era encontrada localmente, `preview.cjs` usava `currentMainSha` como fallback silencioso (`tryRun(...) \|\| currentMainSha`), mascarando manifest inválido, tag ausente ou publicação anterior incompleta. Também instanciava `new TerraformModule` manualmente sem usar `Manifest.fromManifest` / `buildStrategy`. | Criado `scripts/release/baseline.cjs` (`resolveStableBaseline` e `validateBaseline`), utilizado tanto por `preview.cjs` quanto por `candidate.cjs`. Exige manifest válido, tag remota existente e ancestral de `main`, GitHub Release `Latest` não-draft e não-prerelease correspondente ao manifest, e validação do certificado `certification.json` (ou âncora `.release/brownfield.json`). `preview.cjs` passou a usar `LocalGitHub`, `Manifest.fromManifest` e `buildStrategy`. | `scripts/release/tests/integrity.cjs` recusou 7 estados incompatíveis de baseline; `scripts/release/tests/brownfield.cjs` recusou tag sem GitHub Release e manifests inconsistentes (`6.1.0` e `6.2.5`). | **VERIFIED** |
| **S5** · Parsing de `CERTIFICATION_EVIDENCE_JSON` em qualquer passo do log e ausência de vínculo com `metadata_digest` (`scripts/release/verify.py:102-120`) | **P1** | Em `f680a2f`, `verify.py` buscava `CERTIFICATION_EVIDENCE_JSON` no log completo sem restringir ao job `Terraform certification` e ao passo `Evaluate Infrastructure Certification Gate`, e não verificava se o título ou corpo do PR haviam sido editados após o início do run. | `verify.py` (`policy_version: 3`) passou a ancorar a regex exatamente na linha `^Terraform certification\tEvaluate Infrastructure Certification Gate\t[0-9T:Z.-]+ CERTIFICATION_EVIDENCE_JSON=(\{[^\r\n]+\})$`, validar `metadata_digest == sha256([pr.title, pr.body])`, exigir `reused is False` e confirmar a ref candidata remota contra commit e árvore testados. | `scripts/release/tests/verify-snapshot.py` executou replay contra a release real `v7.2.1` (PR #33) e recusou 12 mutações adversariais (incluindo `marker outside gate`, `other metadata`, `reused evidence` e `unreviewed policy`). | **VERIFIED** |
| **S6** · Tag leve sem vínculo criptográfico com a proposta completa na recuperação de publicação parcial (`scripts/release/publication.cjs:38-60`) | **P1** | Em `f680a2f`, `publication.cjs` criava uma tag leve apontando apenas para `proof.merge_commit`. Se a execução falhasse após criar a tag e antes de criar a GitHub Release ou anexar `certification.json`, uma segunda execução com notas ou certificado divergentes para o mesmo commit não podia detectar divergência pela própria ref Git. | `publication.cjs` passou a construir uma **tag anotada determinística** (`git mktag`) usando o timestamp `proof.certified_at` e gravando `proposal-sha256 <sha256({proof, name, notes})>` na anotação. `checkRef()` verifica tanto o SHA do objeto tag quanto o commit `^{}`, e o upload de `certification.json` valida os bytes antes e depois do upload, mantendo o rótulo `autorelease: pending` até a conclusão integral. | `scripts/release/tests/recovery.cjs` comprovou recuperação exata e bloqueio de propostas divergentes em 7 cenários de falha (`before-tag`, `after-tag`, `after-release`, `upload-failed`, `upload-timeout`, `competing`, `different-commit`). Publicação real hospedada em `v7.2.1` ([run 46111816814](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111816814)). | **VERIFIED** |
| **S7** · Ruleset `28132014` exige zero aprovações e `require_code_owner_review: false` (`.github/CODEOWNERS:1` e ruleset `28132014`) | **P1** | A inspeção do ruleset `28132014` via API mostrou `required_approving_review_count: 0` e `require_code_owner_review: false`, e `.github/CODEOWNERS` contém apenas `* @TomasAlric`. No repositório pessoal de administrador único, o mesmo autor pode modificar `CI_POLICY` em `verify.py` e os scripts de certificação no mesmo PR. | Documentada a exigência de governança corporativa (`required_approving_review_count >= 1`, `require_code_owner_review: true` com equipe de plataforma independente no `CODEOWNERS`, e ruleset de proteção de tags estáveis `refs/tags/v*`). Registrado na Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35) sem alterar rulesets sem autorização do Owner. | Inspeção de API dos rulesets `28132014` e `28132710` confirmada; dependência externa registrada para o piloto corporativo. | **BLOCKED** |
| **S8** · Identificação de comentário do PR sem validar autor numérico do bot e exclusão de comentários (`scripts/release/comment.cjs:166-191`) | **P2** | Em `f680a2f`, `comment.cjs` selecionava qualquer comentário contendo o marcador HTML sem verificar `comment.user.id === 41898282` (`github-actions[bot]`), não paginava com `--paginate --slurp` e executava `DELETE` em comentários extras. | `comment.cjs` passou a filtrar estritamente por `comment.user?.id === 41898282 && comment.body?.startsWith(MARKER)`, paginar todos os comentários, validar `metadata_digest`, `Candidate SHA`, `Base SHA` e o último `workflow_run` antes de atualizar, e removeu a lógica de `DELETE`. | Homologado nos PRs [#33](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/33) ([run 46111787236](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111787236)) e [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34) ([runs 46112123839](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112123839) e [46112223243](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112223243)). | **VERIFIED** |
| **S9** · Janela de corrida no GitHub ao editar título/corpo do PR sem alterar `head_sha` (`.github/workflows/ci.yml:3-5` e status de mergeability) | **P1** | Quando o título ou corpo de um PR é editado sem novo push (`head_sha` inalterado), o GitHub dispara um novo run `pull_request` (`types: [edited]`), mas durante alguns segundos antes do registro do novo check suite o endpoint de mergeability do PR ainda reporta o check do mesmo `head_sha` como `CLEAN`. | Em `verify.py` (para o Release PR) e em `comment.cjs` (para qualquer PR), `metadata_digest = sha256(JSON.stringify([title, body]))` invalida imediatamente evidências cujo título/corpo atual divirja do certificado no log. Para Feature PRs, permanece necessária a disciplina operacional/CODEOWNERS de aguardar a conclusão do run `edited` antes do merge. | Exercitado no PR [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34) com dois runs no mesmo head `42ac914` ([46112057032](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112057032) na abertura e [46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235) após edição do corpo), além do bloqueio em `verify-snapshot.py` (`other metadata`). A janela assíncrona da plataforma GitHub ao despachar eventos `edited` permanece como risco residual documentado. | **OPEN** |
| **S10** · Imprecisão documental sobre "contrato criptográfico de 8 dimensões", "assinatura" em log e recuperação de publicação parcial (`docs/validation-report-phase-2.md:25,38`) | **P3** | O relatório da Fase 2 mencionava um "contrato criptográfico de 8 dimensões" e registro "assinado no log", enquanto `computeEquivalenceContract` em `f680a2f` possuía 7 campos no objeto `contract` e `CERTIFICATION_EVIDENCE_JSON` é um marcador estruturado em log (não uma assinatura criptográfica). Além disso, o run `45992557601` executou após release já concluída (comprovando idempotência, e não recuperação de falha intermediária). | Documentação corrigida nesta Fase 3 diferenciando hash de conteúdo, fingerprint de equivalência, integridade de artefato, autenticidade de origem via API e assinatura criptográfica; `computeEquivalenceContract` simplificado para 3 dimensões determinísticas (`repository_tree`, `origin_stable_version`, `environment_parameters`); e recuperação de falhas intermediárias comprovada por fault injection entre etapas em `scripts/release/tests/recovery.cjs`. | Validado em `scripts/release/tests/integrity.cjs`, `scripts/release/tests/recovery.cjs` e documentado nos relatórios da Fase 3. | **VERIFIED** |

---

## 2. Detalhamento Completo dos Achados (Fase 1)

### Achado S1 — Fallback de bootstrap e permissões de escrita no workflow `pull_request`
- **Arquivo e linha**: `.github/workflows/ci.yml` (linhas 18–20, 35, 47–50, 326–344 no commit `f680a2f`).
- **Comportamento observado**: O workflow `ci.yml` executava no gatilho `pull_request` e concedia `contents: write` e `pull-requests: write` ao job `prepare-candidate` (com `persist-credentials: true`) e `pull-requests: write` ao job `publish-comment`. Ambos os jobs continham um bloco de fallback:
  ```bash
  if [[ ! -f scripts/release/preview.cjs ]]; then
    test "${{ github.event.pull_request.user.id }}" = "82914085"
    git checkout "$TESTED_SHA" -- scripts/release scripts/certify
  fi
  ```
  Adicionalmente, como a definição do workflow em um evento `pull_request` é lida da revisão do PR, um PR que modificasse `.github/workflows/ci.yml` poderia executar comandos arbitrários nos jobs com `contents: write` e `pull-requests: write`.
- **Cenário de reprodução**: Um PR submetido por uma branch interna modifica `.github/workflows/ci.yml` (ou explora o fallback de checkout de `$TESTED_SHA`) para executar comandos arbitrários utilizando o `GITHUB_TOKEN` com permissão `contents: write`, podendo criar tags ou modificar referências não protegidas por ruleset.
- **Impacto**: Violação da separação de privilégios entre código candidato não confiável e operações de escrita no repositório (`contents: write` / `pull-requests: write`).
- **Severidade**: **P0**.
- **Correção proposta**:
  1. Remover completamente os blocos de fallback de bootstrap e todas as permissões de escrita de `.github/workflows/ci.yml` (todos os jobs de `ci.yml` passam a operar estritamente com `permissions: contents: read` e `persist-credentials: false`).
  2. Extrair a criação da referência candidata e do comentário inicial para `.github/workflows/candidate.yml`, cuja definição reside na branch base (`main`), faz checkout exclusivo de `${{ github.event.pull_request.base.sha }}` com `persist-credentials: false`, instala dependências com `--ignore-scripts` a partir do lockfile da base e lê o commit de merge do PR apenas como objeto Git (`git fetch origin "refs/pull/$PR_NUMBER/merge"`), sem nunca fazer checkout ou executar código do PR.
  3. Extrair a atualização final do comentário para `.github/workflows/certification-comment.yml` (`on: workflow_run` na `main`), consultando os resultados dos jobs diretamente na API do GitHub.
- **Evidência antes e depois da correção**:
  - **Antes**: `.github/workflows/ci.yml` em `f680a2f` (352 linhas, jobs com `contents: write` e fallback `git checkout "$TESTED_SHA"`).
  - **Depois**: PRs [#31](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/31) (`5f0c636`) e [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32) (`6c8a24b`), homologados em execução hospedada nos runs [46111620681](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111620681), [46111620695](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111620695) e [46111787236](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46111787236).

### Achado S2 — Custódia do `RELEASE_PLEASE_TOKEN` como Repository Secret
- **Arquivo e linha**: `.github/workflows/release-please.yml` (linhas 47, 57, 65, 70, 78) e configuração de secrets/environments do repositório GitHub.
- **Comportamento observado**: O secret `RELEASE_PLEASE_TOKEN` é referenciado apenas no job `release` de `release-please.yml` (com guard `if: github.ref == 'refs/heads/main'`). Porém, a consulta `gh api repos/TomasAlric/terraform-module-release-please-poc/actions/secrets` e `.../environments` revelou que o secret está cadastrado no escopo de **Repositório** e não existe **GitHub Environment** configurado (`total_count: 0`).
- **Cenário de reprodução**: Em um repositório corporativo onde desenvolvedores possuem permissão de criar feature branches no mesmo repositório, um autor cria uma branch contendo um workflow modificado que referencia `${{ secrets.RELEASE_PLEASE_TOKEN }}` em evento `push` ou `pull_request` daquela branch. Como Repository Secrets não são restritos por branch no GitHub Actions, o runner disponibilizaria o secret ao workflow da feature branch.
- **Impacto**: Possibilidade de acesso ao Fine-grained PAT por código candidato caso o autor possua permissão de push em branches do repositório e o secret não esteja isolado em um Environment restrito à `main`.
- **Severidade**: **P0**.
- **Correção proposta**:
  1. Manter o Fine-grained PAT (`RELEASE_PLEASE_TOKEN`) conforme decisão vinculante `D02`/`D03`.
  2. Migrar o armazenamento de `RELEASE_PLEASE_TOKEN` de **Repository Secret** para **Environment Secret** dentro de um GitHub Environment (ex.: `release-publisher`) configurado com **Deployment branches: Selected branches -> `main`** (e revisores obrigatórios quando aplicável), associando `environment: release-publisher` ao job `release` de `.github/workflows/release-please.yml`.
  3. Exigir revisão independente de CODEOWNERS para `.github/workflows/*`.
- **Evidência antes e depois da correção**:
  - **Antes**: `gh api repos/TomasAlric/terraform-module-release-please-poc/actions/secrets` (`total_count: 1`, `RELEASE_PLEASE_TOKEN`) e `/environments` (`total_count: 0`).
  - **Depois**: Como as restrições da missão proíbem criar ou substituir credenciais automaticamente, o bloqueio para piloto corporativo foi formalizado na Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35) e classificado como **BLOCKED** até a migração do secret pelo Owner.

### Achado S3 — Cobertura incompleta da lista estática de arquivos no fingerprint e reuso de evidências
- **Arquivo e linha**: `scripts/release/preview.cjs` (linhas 40–90 e 102–219 em `f680a2f`), `scripts/certify/run-day0.sh` (linhas 10–12 em `f680a2f`), `scripts/certify/run-day2.sh` (linhas 14–16 em `f680a2f`) e `.github/workflows/ci.yml` (linhas 147–170 e 211–239 em `f680a2f`).
- **Comportamento observado**:
  1. `computeEquivalenceContract` em `f680a2f` calculava `functional_module_tree` apenas sobre uma lista fixa de 6 arquivos (`main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `tests/contract.tftest.hcl`, `examples/complete/main.tf`).
  2. `run-day0.sh` e `run-day2.sh` verificavam o download remoto do módulo calculando `shasum -a 256 main.tf variables.tf outputs.tf versions.tf`.
  3. Quando `EVIDENCE_REUSED == true`, `ci.yml` pulava a execução real de `run-day0.sh` e `run-day2.sh` e sintetizava objetos `day0.json` e `day2.json` com `result: "PASS"`.
- **Cenário de reprodução**: A adição de um novo arquivo `network.tf`, `cluster.tf.json`, submódulo `modules/child/main.tf`, template `templates/launch.tftpl`, script consumido por `local-exec`/`external` ou arquivo de configuração não alterava `functional_module_tree` nem `EXPECTED_MODULE_HASH`, permitindo que uma mudança funcional real mantivesse o mesmo hash funcional dos 6 arquivos listados.
- **Impacto**: Reutilização indevida de evidência de certificação diante de novos arquivos Terraform, submódulos ou templates adicionados ao módulo.
- **Severidade**: **P1**.
- **Correção proposta**:
  1. Desabilitar a reutilização que sintetizava `PASS` (`evidence_reuse: { reused: false, eligible: false, reason: 'Full certification required for every candidate' }`) e exigir execução real de Day 0, Day 2 e Contract Tests em todo Feature PR e em todo Release PR, além de validar `evidence_reuse.reused is False` em `scripts/release/verify.py`.
  2. Substituir o hash parcial de 4/6 arquivos pelo hash completo da árvore Git (`git rev-parse 'HEAD^{tree}'`) tanto em `computeEquivalenceContract` (`preview.cjs`) quanto na verificação do módulo baixado em `.terraform/modules/cluster` (`run-day0.sh` e `run-day2.sh`).
- **Evidência antes e depois da correção**:
  - **Antes**: `preview.cjs:41-48` em `f680a2f` (lista estática de 6 caminhos).
  - **Depois**: Commit `6c8a24b` (PR [#32](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/32)), `scripts/release/tests/integrity.cjs` (11 variações de arquivos como `new.tf`, `cluster.tf.json`, `modules/child/main.tf`, `templates/launch.tftpl`, `bin/helper`, `fixtures/consumer/main.tf`, `config.json`, `.terraform.lock.hcl`, `package-lock.json`, `ci.yml`, `certify.sh` alteram o fingerprint) e `scripts/release/tests/verify-snapshot.py` (`PASS denied reused evidence`).

### Achado S4 — Fallback silencioso na descoberta da baseline estável e configuração manual da estratégia
- **Arquivo e linha**: `scripts/release/preview.cjs` (linhas 244–247 e 276–285 em `f680a2f`).
- **Comportamento observado**:
  1. `preview.cjs` resolvia `stableTagSha` com fallback silencioso para `currentMainSha` caso a tag do manifest não existisse (`tryRun('git', ['rev-parse', ...]) || currentMainSha`).
  2. Instanciava `new TerraformModule({...})` passando apenas um subconjunto manual de propriedades de `release-please-config.json`.
- **Cenário de reprodução**: Se `.release-please-manifest.json` avançasse na `main` após o merge de um Release PR mas o job de publicação falhasse antes de criar a tag Git ou o certificado, qualquer PR subsequente assumiria `currentMainSha` como baseline estável, descartando commits acumulados e mascarando a publicação incompleta.
- **Impacto**: Previsão SemVer incorreta e mascaramento de estado inconsistente entre manifest, tag Git, GitHub Release e certificado.
- **Severidade**: **P1**.
- **Correção proposta**:
  1. Centralizar a validação em `scripts/release/baseline.cjs` (`resolveStableBaseline` e `validateBaseline`), compartilhada entre `preview.cjs` e `candidate.cjs`.
  2. Falhar explicitamente diante de manifest inválido, tag ausente no `origin`, tag que não seja ancestral de `main`, release `Latest` ausente/draft/prerelease ou divergente do manifest, e certificado `certification.json` ausente ou divergente (salvo âncora brownfield `.release/brownfield.json` correspondente exatamente à tag manual inicial).
  3. Utilizar `LocalGitHub`, `Manifest.fromManifest` e `buildStrategy` da biblioteca `release-please@17.6.0`.
- **Evidência antes e depois da correção**:
  - **Antes**: `preview.cjs:244-247` em `f680a2f` (`|| currentMainSha`).
  - **Depois**: `scripts/release/baseline.cjs`, `scripts/release/preview.cjs`, `scripts/release/candidate.cjs`, validado por `scripts/release/tests/integrity.cjs` (7 estados inválidos recusados) e `scripts/release/tests/brownfield.cjs` (`tag only` e `inconsistent manifest` recusados).

### Achado S5 — Procedência do marcador `CERTIFICATION_EVIDENCE_JSON` no verificador pré-publicação
- **Arquivo e linha**: `scripts/release/verify.py` (linhas 102–120 em `f680a2f`).
- **Comportamento observado**: `verify.py` extraía `CERTIFICATION_EVIDENCE_JSON` usando regex sobre o log completo do workflow run sem exigir o prefixo do job `Terraform certification` e do passo `Evaluate Infrastructure Certification Gate`, e sem confrontar o digest do título e corpo atuais do PR com os metadados vigentes durante o run.
- **Cenário de reprodução**: Se um passo anterior no log imprimisse uma linha com `CERTIFICATION_EVIDENCE_JSON={...}` ou se o título/corpo do Release PR fosse alterado após o run, a regex sem âncora de job/passo ou sem `metadata_digest` não detectaria a divergência.
- **Impacto**: Fragilidade na validação de procedência da evidência extraída do log do GitHub Actions.
- **Severidade**: **P1**.
- **Correção proposta**:
  1. Ancorar a regex de `verify.py` em `^Terraform certification\tEvaluate Infrastructure Certification Gate\t[0-9T:Z.-]+ CERTIFICATION_EVIDENCE_JSON=(\{[^\r\n]+\})$` e exigir ocorrência única (`len(ev_matches) == 1`).
  2. Validar `metadata_digest == sha256(json.dumps([pr["title"].strip(), (pr["body"] or "").strip()]))`, `policy_version == 3`, `workflow_run_id == str(run_id)`, `attempt == str(attempt)` e `evidence_reuse.reused is False`.
- **Evidência antes e depois da correção**:
  - **Antes**: `verify.py:102` em `f680a2f`.
  - **Depois**: `scripts/release/verify.py:106-131` e replay adversarial de 12 casos em `scripts/release/tests/verify-snapshot.py` contra o snapshot real da `v7.2.1` (PR #33).

### Achado S6 — Vinculação criptográfica da proposta na recuperação de publicação parcial
- **Arquivo e linha**: `scripts/release/publication.cjs` (linhas 38–60 em `f680a2f`).
- **Comportamento observado**: `publication.cjs` criava uma tag leve (`git push origin proof.merge_commit:refs/tags/vX.Y.Z`). Em caso de falha após o push da tag e antes da criação da GitHub Release ou do upload de `certification.json`, a tag no Git não registrava qual proposta (`{ proof, name, notes }`) havia sido autorizada.
- **Cenário de reprodução**: Uma falha de rede interrompe `publication.cjs` após criar a tag `vX.Y.Z`. Uma reexecução subsequente com notas alteradas ou novo run de certificação para o mesmo commit SHA encontraria a tag leve apontando para `merge_commit` e prosseguiria com outra proposta.
- **Impacto**: Possibilidade de divergência entre a proposta originalmente autorizada no momento da criação da tag e os artefatos complementares (GitHub Release e `certification.json`) criados na recuperação.
- **Severidade**: **P1**.
- **Correção proposta**:
  1. Construir uma **tag Git anotada determinística** (`git mktag`) usando o timestamp imutável `proof.certified_at` e gravando na mensagem da tag `proposal-sha256 <sha256({proof, name, notes})>`.
  2. Verificar com `git ls-remote origin refs/tags/vX.Y.Z refs/tags/vX.Y.Z^{}` antes e depois de cada etapa que tanto o objeto da tag anotada quanto o commit alvo coincidem com a proposta em execução.
  3. Validar os bytes exatos de `certification.json` antes e após o upload e somente alterar os rótulos do PR (`autorelease: pending` -> `autorelease: tagged`) ao final.
- **Evidência antes e depois da correção**:
  - **Antes**: `publication.cjs:38` em `f680a2f` (`run('git', 'push', 'origin', proof.merge_commit + ':' + ref)`).
  - **Depois**: `scripts/release/publication.cjs:40-85`, validado em `scripts/release/tests/recovery.cjs` (7 cenários de fault injection) e na release real `v7.2.1` (tag anotada `a5945d8ebb85b3313947d1e2c35ddce9b6a9cf8d` com `proposal-sha256 d13ea1d8886a79d61005a341de267dc10ded8139e057f261e79c2d9eff6e93b3`, auditada por `scripts/audit-release.py`).

### Achado S7 — Ausência de revisão independente obrigatória no ruleset `28132014`
- **Arquivo e linha**: `.github/CODEOWNERS` (linha 1) e ruleset `28132014` (`Certified squash on main`).
- **Comportamento observado**: `.github/CODEOWNERS` atribui `* @TomasAlric`, mas o ruleset `28132014` possui `required_approving_review_count: 0` e `require_code_owner_review: false`.
- **Cenário de reprodução**: Um autor com permissão de merge pode alterar simultaneamente um script de certificação (ex.: `scripts/certify.sh`) e seu respectivo hash em `CI_POLICY` dentro de `scripts/release/verify.py` no mesmo PR, aprovando a própria alteração sem revisor independente.
- **Impacto**: A lista `CI_POLICY` protege contra modificações não intencionais ou fora de sincronia, mas sem revisão humana independente (`CODEOWNERS` + `required_approving_review_count >= 1`) não impede que um único mantenedor altere a política e os hashes conjuntamente.
- **Severidade**: **P1**.
- **Correção proposta**: No ambiente corporativo, habilitar `require_code_owner_review: true`, `required_approving_review_count >= 1` e `require_last_push_approval: true` no ruleset da `main`, atribuindo `.github/workflows/*`, `scripts/release/*` e `scripts/certify/*` a uma equipe de plataforma/segurança no `CODEOWNERS`, além de adicionar um ruleset para proteger tags `refs/tags/v*` contra deleção ou atualização.
- **Evidência antes e depois da correção**:
  - **Antes**: `gh api repos/TomasAlric/terraform-module-release-please-poc/rulesets/28132014` (`required_approving_review_count: 0`, `require_code_owner_review: false`).
  - **Depois**: Registrado na Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35) como **BLOCKED** no repositório pessoal de conta única (onde o GitHub não permite auto-aprovação de PR pelo próprio autor).

### Achado S8 — Identificação e atualização do comentário persistente no PR
- **Arquivo e linha**: `scripts/release/comment.cjs` (linhas 166–191 em `f680a2f`).
- **Comportamento observado**: O script localizava qualquer comentário que contivesse `<!-- release-impact-certification-marker:v2 -->` sem validar `comment.user.id === 41898282` (`github-actions[bot]`), listava apenas a primeira página de comentários e excluía comentários duplicados com `DELETE`.
- **Cenário de reprodução**: Qualquer usuário que postasse um comentário no PR iniciando com o marcador HTML poderia ter seu comentário tratado como comentário oficial do bot, ou provocar deleção de comentários anteriores.
- **Impacto**: Poluição ou manipulação visual do comentário informativo do PR (embora o comentário não seja utilizado como fonte de autorização por `verify.py`).
- **Severidade**: **P2**.
- **Correção proposta**: Restringir `botComment` a `comment.user?.id === 41898282 && comment.body?.startsWith(MARKER)`, paginar todos os comentários com `gh api --paginate --slurp`, verificar `metadata_digest`, `Candidate SHA` e `Base SHA` antes de atualizar em `reportCompleted`, e remover a exclusão automática de comentários.
- **Evidência antes e depois da correção**:
  - **Antes**: `comment.cjs:166-191` em `f680a2f`.
  - **Depois**: `scripts/release/comment.cjs:69-115`, validado nos PRs #32, #33 e #34.

### Achado S9 — Edição de título/corpo do PR sem mudança de `head_sha`
- **Arquivo e linha**: `.github/workflows/ci.yml` (linhas 3–5) e `scripts/release/verify.py` (linhas 112–113).
- **Comportamento observado**: Como a versão prevista depende do commit de squash simulado a partir de `PR_TITLE` e `PR_BODY`, editar o título ou corpo de um PR (ex.: mudar `fix:` para `feat!:`) sem alterar commits dispara o evento `pull_request` (`types: [edited]`) sobre o mesmo `head_sha`. Durante uma breve janela até que o novo workflow run registre os checks em estado pendente para aquele `head_sha`, o status do commit anterior naquele `head_sha` ainda consta como `SUCCESS` no GitHub.
- **Cenário de reprodução**: No PR #34 (head `42ac914`), após o primeiro run `46112057032` concluir com `SUCCESS`, a descrição do PR foi editada. A primeira consulta imediata à API ainda observou `mergeStateStatus: CLEAN` antes de transitar para `BLOCKED` e iniciar o segundo run `46112167235`.
- **Impacto**: Para o **Release PR**, `verify.py` bloqueia a publicação caso `metadata_digest` no log de certificação divirja do título/corpo no momento do merge. Para um **Feature PR**, porém, um merge imediato dentro da janela de poucos segundos após editar o título poderia integrar um commit cujo título editado ainda não terminou de reexecutar `ci.yml`.
- **Severidade**: **P1**.
- **Correção proposta**:
  1. `verify.py` e `comment.cjs` já vinculam `metadata_digest = sha256(JSON.stringify([title, body]))`, impedindo que um Release PR com metadados editados seja autorizado sem recertificação completa.
  2. Em ambiente corporativo, a exigência de revisão de CODEOWNERS e a verificação operacional de aguardar o run `edited` mitigam a janela em Feature PRs. O achado permanece classificado como **OPEN** por tratar-se de comportamento assíncrono intrínseco à associação de status checks por `head_sha` no GitHub.
- **Evidência antes e depois da correção**:
  - **Antes**: `verify.py` em `f680a2f` não verificava `metadata_digest`.
  - **Depois**: `verify.py:112-113` e `verify-snapshot.py` (`PASS denied other metadata`), e reteste hospedado no PR [#34](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/34) ([run 46112057032](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112057032) e [run 46112167235](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/46112167235)).

### Achado S10 — Precisão terminológica e documental sobre fingerprint, procedência e recuperação
- **Arquivo e linha**: `docs/validation-report-phase-2.md` (linhas 25 e 38) e `docs/architecture.md` (linha 41).
- **Comportamento observado**:
  1. A documentação da Fase 2 referia-se a um "contrato criptográfico de 8 dimensões", enquanto `computeEquivalenceContract` em `f680a2f` continha 7 campos (`functional_module_tree`, `dependencies_lock_hash`, `consumer_fixtures_hash`, `terraform_config_hash`, `test_policy_hash`, `origin_stable_version`, `environment_parameters`).
  2. Referia-se a `CERTIFICATION_EVIDENCE_JSON` como registro "assinado no log", quando não há assinatura criptográfica (chave privada/PKI), mas sim um digest SHA-256 e verificação de procedência via API autenticada do GitHub Actions.
  3. O experimento de "Recuperação de publicação parcial" na Fase 2 (`run 45992557601`) executou um `workflow_dispatch` sobre a `v7.2.0` já inteiramente publicada, comprovando idempotência pós-conclusão, mas não falha intermediária entre etapas.
- **Cenário de reprodução**: Inspeção direta do código-fonte de `preview.cjs`, `verify.py` e dos logs do run `45992557601`.
- **Impacto**: Imprecisão documental que poderia levar auditores a assumir existência de assinatura digital PKI ou cobertura de falha parcial apenas por reexecução pós-release.
- **Severidade**: **P3**.
- **Correção proposta**: Documentar a distinção exata entre hash de conteúdo, fingerprint de equivalência (3 dimensões na `policy_version: 3`: `repository_tree`, `origin_stable_version`, `environment_parameters`), integridade de artefato, autenticidade de origem via API e assinatura criptográfica; e homologar recuperação de publicação parcial com fault injection real entre etapas (`scripts/release/tests/recovery.cjs`).
- **Evidência antes e depois da correção**:
  - **Antes**: `docs/validation-report-phase-2.md:25,38`.
  - **Depois**: Seção 3 abaixo, `scripts/release/tests/recovery.cjs` e `docs/validation-report-phase-3.md`.

---

## 3. Distinção Conceitual: Hash, Fingerprint, Procedência e Assinatura

Conforme exigido na Seção 11.3 da missão, a arquitetura da Fase 3 diferencia explicitamente:

| Conceito | Implementação na POC (Política v3) | O que garante | O que NÃO é |
|---|---|---|---|
| **Hash de conteúdo** | `git rev-parse 'HEAD^{tree}'` (SHA-1 da árvore Git completa) e `git hash-object` dos arquivos em `CI_POLICY`. | Identidade exata de todos os arquivos versionados no repositório e no módulo baixado pelo Terraform. | Não identifica a versão estável de origem nem o resultado dos testes. |
| **Fingerprint de equivalência** | `equivalence_fingerprint = sha256(JSON.stringify({ repository_tree, origin_stable_version, environment_parameters }))` (3 dimensões informativas na `policy_version: 3`, substituindo os 7 campos da Fase 2). | Resumo determinístico da árvore completa do repositório, da baseline estável `vX.Y.Z@<sha>` e dos parâmetros do ambiente de execução. | Não substitui a execução obrigatória dos testes (`reused: false`) nem cobre dependências externas não fixadas em Git. |
| **Integridade de artefato** | `proposal-sha256 <sha256({proof, name, notes})>` gravado na tag Git anotada (`git mktag`) e comparação byte a byte após `gh release download`. | Vincula de forma imutável a tag Git, as notas da release e os bytes exatos do arquivo `certification.json`. | Não impede que um administrador com permissão de bypass exclua a release se `immutable releases` não estiver ativo na plataforma. |
| **Autenticidade da origem** | Consultas autenticadas de `verify.py` à API do GitHub Actions (`actions/workflows/ci.yml/runs`, `/attempts/<n>/jobs`, logs do job `Terraform certification` no passo `Evaluate Infrastructure Certification Gate`) e verificação de `CI_POLICY` no commit de merge. | Comprova que a evidência foi produzida por uma execução real do workflow confiável `.github/workflows/ci.yml` no repositório autorizado antes do merge do Release PR. | Depende da segurança da conta/token e da integridade dos logs do GitHub Actions. |
| **Assinatura criptográfica** | **Não implementada** (por diretriz de simplicidade `D13` e Seção 11.3: não introduzir PKI/KMS sem necessidade comprovada). | Uma assinatura real exigiria chave privada custodiada externamente (ex.: Sigstore/Cosign ou AWS KMS) assinando o digest. | O marcador `CERTIFICATION_EVIDENCE_JSON` no log e a tag anotada com SHA-256 **não são assinaturas criptográficas**. |
| **Resultado real de certificação** | Execução efetiva e aprovação (`conclusion == "success"` e `PASS` em todos os 7 indicadores) dos 5 jobs obrigatórios (`prepare-candidate`, `contract-tests`, `fresh-installation`, `consumer-upgrade`, `Terraform certification`). | Comprova que o módulo instalou (Day 0), atualizou sem substituir recursos críticos (Day 2), manteve contratos, foi idempotente e limpou o estado. | Não pode ser substituído por flags sintéticas ou evidências reutilizadas sem validação completa. |

---

## 4. Controles para Utilização Segura do Fine-grained PAT (`RELEASE_PLEASE_TOKEN`)

Respeitando as decisões vinculantes `D02` e `D03` (manter Fine-grained PAT e não utilizar GitHub App):

1. **Escopo mínimo**:
   - Repositório alvo: acesso exclusivo ao repositório do módulo Terraform.
   - Permissões de repositório: `Contents: Read and write`, `Pull requests: Read and write`, `Issues: Read and write`, `Metadata: Read-only`. Nenhuma permissão de administração (`Administration`), workflows (`Workflows`) ou ambientes (`Environments`) deve ser concedida ao PAT de publicação.
2. **Armazenamento e isolamento de privilégios**:
   - No piloto corporativo, armazenar `RELEASE_PLEASE_TOKEN` exclusivamente em um **GitHub Environment** (`release-publisher`) restrito à branch `main`, removendo o secret do escopo de repositório (Issue [#35](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/35)).
   - Nunca referenciar `RELEASE_PLEASE_TOKEN` em workflows de PR (`ci.yml`, `candidate.yml`, `certification-comment.yml`).
3. **Expiração e rotação**:
   - Configurar expiração curta (30 a 90 dias conforme política corporativa).
   - Procedimento de rotação sem downtime:
     1. Gerar novo Fine-grained PAT com o mesmo escopo mínimo.
     2. Atualizar o secret `RELEASE_PLEASE_TOKEN` no Environment protegido.
     3. Executar `gh workflow run release-please.yml --ref main` e confirmar o passo `Verify release credential` e a reconciliação idempotente.
     4. Revogar imediatamente o token anterior.
