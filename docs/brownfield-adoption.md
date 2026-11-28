# Guia de Adoção Brownfield — Release Please em Módulos Terraform Existentes

Este guia descreve o procedimento homologado na **Fase 3** para incorporar o **Release Please (`17.6.0`)** e o fluxo de **Continuous Infrastructure Certification** a um módulo Terraform existente que já possui histórico Git, tags estáveis, GitHub Releases manuais, `CHANGELOG.md` legado e consumidores ativos, sem reinicializar o histórico nem exigir uma nova versão `MAJOR` artificial.

---

## Fluxo End-to-End de Integração com Módulos Existentes

```text
Feature Pull Request
        |
Release Version Preview
        |
Release Candidate
        |
Workflows de testes existentes
        |
Resultado da certificação
        |
CODEOWNERS
        |
Merge protegido
        |
Release Please
        |
Release Pull Request
        |
Certificação final ou equivalência comprovada
        |
Autorização pré-publicação
        |
Tag estável + GitHub Release
```

---

## 1. Como identificar a última versão manual existente

1. Clone o repositório completo com todas as tags e refs remotas:
   ```bash
   git fetch origin main --tags --prune
   git ls-remote --tags origin
   ```
2. Liste as GitHub Releases publicadas e identifique a release marcada como `Latest` (e todas as tags estáveis consumidas por usuários):
   ```bash
   gh api repos/{owner}/{repo}/releases --paginate --jq '.[] | {id, tag_name, target_commitish, draft, prerelease}'
   gh api repos/{owner}/{repo}/releases/latest --jq '{id, tag_name, target_commitish, draft, prerelease}'
   ```
3. Confirme que a última versão estável (por exemplo, `v6.2.0`) existe como tag Git (`refs/tags/v6.2.0`), resolve para um commit ancestral de `origin/main` e corresponde à GitHub Release `Latest`:
   ```bash
   git rev-parse --verify 'refs/tags/v6.2.0^{commit}'
   git merge-base --is-ancestor 'refs/tags/v6.2.0^{commit}' origin/main
   ```

## 2. Como inspecionar o histórico

Antes de abrir o PR de adoção, capture um inventário reproduzível fora da branch de trabalho contendo tags, SHAs de objetos e commits, árvores Git, blobs do `CHANGELOG.md`, GitHub Releases, notas, assets e referências utilizadas pelos consumidores:

```bash
git for-each-ref refs/tags --format='%(refname:short) %(objectname) %(*objectname)'
git rev-parse 'v6.0.0^{commit}' 'v6.1.0^{commit}' 'v6.1.1^{commit}' 'v6.2.0^{commit}'
git rev-parse 'v6.2.0^{tree}' 'v6.2.0:CHANGELOG.md'
git log --format='%H %s' v6.2.0..origin/main
```

Verifique especialmente se existem commits acumulados em `main` após a tag `v6.2.0`. Qualquer commit no formato Conventional Commits (`fix:`, `feat:`, `perf:` ou `!` / `BREAKING CHANGE:`) posterior ao commit de `v6.2.0` será considerado pelo Release Please na primeira proposta automatizada.

## 3. Como configurar o manifest

Crie o arquivo `.release-please-manifest.json` na raiz do repositório inicializado exatamente com a última versão estável publicada manualmente (sem o prefixo `v`):

```json
{".":"6.2.0"}
```

Para vincular a baseline manual revisada ao verificador de baseline (`scripts/release/baseline.cjs`), registre o inventário assinado da última release manual em `.release/brownfield.json`:

```json
{
  "repository": "owner/terraform-module",
  "tag": "v6.2.0",
  "release_id": 620,
  "commit": "<sha-40-chars-do-commit-de-v6.2.0>"
}
```

- `scripts/release/baseline.cjs` aceita `.release/brownfield.json` **exclusivamente** enquanto `.release-please-manifest.json` apontar para a tag manual inicial (`v6.2.0`), validando igualdade de `repository`, `tag`, `release_id` e `commit` contra a API do GitHub e a ref Git.
- A partir da primeira release automatizada (`v6.2.1` em diante), `baseline.cjs` exige obrigatoriamente o asset `certification.json` anexado à GitHub Release correspondente.

## 4. Como preservar o changelog

1. Mantenha o arquivo `CHANGELOG.md` existente intacto no PR de adoção.
2. O atualizador da estratégia `terraform-module` do Release Please (`17.6.0`) localiza o cabeçalho `# Changelog` (ou o início das seções `## `) e **insere a nova seção acima das seções históricas**, preservando integralmente o texto, a ordem e a contiguidade de todas as versões anteriores (`6.0.0`, `6.1.0`, `6.1.1`, `6.2.0`), sem duplicação nem perda de notas manuais.

## 5. Como tratar commits históricos não convencionais

- **Antes da tag baseline (`<= v6.2.0`)**: O Release Please interrompe a varredura do histórico assim que encontra o SHA do commit associado à release `v6.2.0` (descoberto via `releaseIterator` ou fallback `backfillReleasesFromTags`). Portanto, commits históricos com mensagens livres (`"Entrega manual 6.0.0"`, `"Ajuste de variáveis"`, etc.) anteriores ou iguais a `v6.2.0` **não precisam ser reescritos** e não afetam o cálculo SemVer.
- **Após a tag baseline (`v6.2.0..main`)**:
  - Commits não convencionais após `v6.2.0` (ex.: `"Legacy adjustment"`) são ignorados com aviso de parser (`commit could not be parsed`) e não provocam versão `MAJOR` artificial nem corrompem o cálculo.
  - Se houver commits convencionais elegíveis (`fix:`, `feat:`) após `v6.2.0` que **já faziam parte de uma entrega manual não tagueada** ou que não devam gerar nova release, utilize `last-release-sha` em `release-please-config.json` apontando para o commit limite exato, ou garanta que a tag `v6.2.0` aponte para o commit real da entrega.

## 6. Como configurar o Release Please

Crie `release-please-config.json` na raiz utilizando a estratégia oficial `terraform-module`:

```json
{
  "packages": {
    ".": {
      "release-type": "terraform-module",
      "include-component-in-tag": false,
      "include-v-in-tag": true,
      "changelog-sections": [
        {"type": "fix", "section": "Correções"},
        {"type": "feat", "section": "Funcionalidades"},
        {"type": "perf", "section": "Desempenho"}
      ]
    }
  }
}
```

### Quando usar `bootstrap-sha` e `last-release-sha`

| Opção | Quando é necessária | Comportamento no Release Please 17.6.0 |
|---|---|---|
| Padrão (sem `bootstrap-sha` / `last-release-sha`) | Quando a última release manual (`v6.2.0`) existe como GitHub Release ou tag Git ancestral de `main`. | `Manifest` localiza o SHA de `v6.2.0` e analisa apenas os commits `(v6.2.0..main]`. **Recomendado para adoção brownfield padrão.** |
| `bootstrap-sha` | Apenas quando nenhuma GitHub Release nem tag correspondente ao manifest é encontrada dentro de `releaseSearchDepth` (400). | Limita a busca inicial até o SHA configurado quando `needsBootstrap == true`. |
| `last-release-sha` | Quando é necessário forçar explicitamente o commit de corte independentemente do SHA da tag/release anterior. | Interrompe o `mergeCommitIterator` ao atingir `lastReleaseSha`. Deve ser removido após a primeira release automatizada para não fixar o corte permanentemente. |

## 7. Como utilizar o PAT existente

Por decisão vinculante do Owner (`D02`/`D03`), a autenticação utiliza o Fine-grained PAT armazenado no secret `RELEASE_PLEASE_TOKEN`:

1. **Escopo mínimo do PAT**: Restrito exclusivamente ao repositório do módulo, com permissões:
   - `Contents: Read and write` (criação de commits na branch `release-please--branches--main`, tags estáveis e GitHub Releases).
   - `Pull requests: Read and write` (abertura e atualização do Release PR).
   - `Issues: Read and write` (gerenciamento dos rótulos `autorelease: pending` e `autorelease: tagged` e invalidação de comentários obsoletos).
2. **Isolamento**:
   - `RELEASE_PLEASE_TOKEN` é referenciado **exclusivamente** no job `release` de `.github/workflows/release-please.yml` em `refs/heads/main`.
   - Para módulos corporativos com múltiplos colaboradores, armazene `RELEASE_PLEASE_TOKEN` em um **GitHub Environment protegido** (ex.: `release-publisher`) com deployment branch policy restrita a `main`, eliminando a cópia em nível de Repository Secret.
3. **Rotação e verificação**:
   - O preflight de `release-please.yml` valida a presença do token e o ID numérico esperado da identidade publicadora antes de qualquer operação de escrita.

## 8. Como integrar os required checks

Configure dois rulesets ativos no repositório:

1. **Ruleset da branch `main` (`Certified squash on main`)**:
   - `deletion` e `non_fast_forward` bloqueados.
   - `pull_request` obrigatório com `allowed_merge_methods: ["squash"]`, título/corpo do PR preservados no commit de squash (`PR_TITLE` e `PR_BODY`), `require_code_owner_review: true` e `required_approving_review_count >= 1` (em ambiente corporativo).
   - `required_status_checks` com `strict_required_status_checks_policy: true` exigindo o job agregador `Terraform certification` vinculado ao `integration_id: 15368` (GitHub Actions).
2. **Ruleset da branch do bot (`Fast-forward release branch`)**:
   - Aplica-se a `refs/heads/release-please--branches--main`.
   - Bloqueia `non_fast_forward` (impedindo `git push --force`).

## 9. Como apresentar a previsão de versão no PR

1. O workflow `.github/workflows/candidate.yml` (acionado em `pull_request_target` para eventos `opened`, `reopened`, `synchronize`, `edited`, `ready_for_review` de branches do próprio repositório) faz checkout exclusivamente de `github.event.pull_request.base.sha` (`main`) com `persist-credentials: false`.
2. Busca `refs/pull/<PR>/merge` apenas como objetos Git (`git fetch`) e executa `scripts/release/preview.cjs` usando `LocalGitHub`, `Manifest.fromManifest` e `buildStrategy` da biblioteca `release-please@17.6.0`.
3. `scripts/release/comment.cjs pending` publica ou atualiza in-place o comentário único identificado por `<!-- release-impact-certification-marker:v2 -->` e `<!-- metadata <sha256(title,body)> -->`.
4. Ao término do workflow `Terraform CI`, `.github/workflows/certification-comment.yml` (`workflow_run`) consulta os resultados reais dos jobs via API da `main` e atualiza o comentário para o estado final.

## 10. Como criar referências candidatas

O script `scripts/release/rc.cjs` (executado em `candidate.yml` a partir do código confiável da base) preserva a estratégia híbrida:

- **PRs com incremento SemVer (`PATCH`, `MINOR`, `MAJOR`)**:
  - Cria tag `v<next>-rc.pr<N>.<sha7>` (ex.: `v6.2.1-rc.pr1.0b99cd4`) e publica GitHub Release com `prerelease: true` e `make_latest: "false"`.
- **PRs sem incremento SemVer (`NONE`, ex.: `docs:`, `ci:`, `chore:`)**:
  - Cria referência candidata isolada `candidate/pr-<N>/<sha7>` sem criar GitHub Release.
- Qualquer tentativa de criar tag estável (`^v\d+\.\d+\.\d+$`) ou mover tag candidata existente para outro commit é recusada.

## 11. Como integrar os workflows de testes existentes

No workflow `.github/workflows/ci.yml` (`pull_request`, com `permissions: contents: read` em todos os jobs):

1. O job `prepare-candidate` recalcula `preview.json` com as ferramentas da base e aguarda/verifica que `refs/tags/<candidate_tag>` no `origin` aponte exatamente para `candidate_commit_sha`.
2. Os workflows corporativos de testes de infraestrutura (Terraform Test, TaaC/Pytest, matrizes EKS/ECS, Day 0 Fresh Installation e Day 2 Consumer Upgrade) recebem:
   - `CANDIDATE_TAG`: referência candidata remota (`git::https://github.com/<owner>/<repo>.git?ref=<CANDIDATE_TAG>`).
   - `STABLE_TAG`: última versão estável verificada (`v6.2.0`).
   - `EXPECTED_MODULE_HASH`: árvore Git completa (`git rev-parse 'HEAD^{tree}'`), verificada após o `terraform init` em `.terraform/modules/<module>`.
3. O job final `Terraform certification` (`scripts/certify/aggregate-gate.py`) consolida os resultados de todos os jobs obrigatórios e emite `CERTIFICATION_EVIDENCE_JSON` no log do passo `Evaluate Infrastructure Certification Gate`.

## 12. Como realizar a primeira release automatizada (Exemplo completo a partir de `v6.2.0`)

Considere um módulo existente com histórico manual `v6.0.0`, `v6.1.0`, `v6.1.1` e última versão manual **`v6.2.0`**:

1. **PR de Adoção (`ci: adopt release management`)**:
   - Adiciona `release-please-config.json`, `.release-please-manifest.json` (`{".":"6.2.0"}`), `.release/brownfield.json`, workflows e scripts.
   - Previsão no PR: `Current stable version: v6.2.0`, `Expected next version: None`, `Release type: NONE`, candidato `candidate/pr-1/<sha7>`.
   - Após certificação e squash merge na `main`, o Release Please executa e **não abre Release PR** (adoção sem mudança funcional elegível — H40).
2. **Primeiro Feature/Fix PR (`fix: correct module behavior`)**:
   - Previsão no PR:
     - `Current stable version: v6.2.0`
     - `Expected next version: v6.2.1`
     - `Release type: PATCH`
     - `Release Candidate: v6.2.1-rc.pr2.<sha7>`
   - Os testes Day 0 instalam `?ref=v6.2.1-rc.pr2.<sha7>` e os testes Day 2 fazem upgrade in-place no mesmo `terraform.tfstate` de `?ref=v6.2.0` para `?ref=v6.2.1-rc.pr2.<sha7>`.
   - Após aprovação e squash merge na `main`, `release-please.yml` executa `candidate.cjs` e abre o **Release PR (`chore(main): release 6.2.1`)** propondo `.release-please-manifest.json` = `6.2.1` e a seção `## [6.2.1]` no topo do `CHANGELOG.md`.
3. **Certificação e Publicação do Release PR (`v6.2.1`)**:
   - O Release PR gera sua própria candidata `v6.2.1-rc.pr3.<sha7>` e executa a certificação completa (`Terraform CI`).
   - Após o squash merge protegido do Release PR, `release-please.yml` executa:
     - Job `authorize`: executa `verify.py`, validando ruleset, `CI_POLICY`, conclusão dos 5 jobs obrigatórios antes do merge, igualdade da árvore Git, digest de metadados e `CERTIFICATION_EVIDENCE_JSON`.
     - Job `release`: cria a tag anotada `v6.2.1` com `proposal-sha256 <digest>`, publica a GitHub Release `v6.2.1`, faz upload e verificação byte a byte de `certification.json` e atualiza os rótulos do Release PR para `autorelease: tagged`.

## 13. Como verificar a preservação do histórico

Após a publicação de `v6.2.1`, execute a auditoria e compare com o inventário inicial:

```bash
python3 scripts/audit-release.py v6.2.1 <PR_NUMBER> <CI_RUN_ID>
git for-each-ref refs/tags --format='%(refname:short) %(objectname) %(*objectname)'
```

Comprove que:
- Todas as tags históricas (`v6.0.0`, `v6.1.0`, `v6.1.1`, `v6.2.0`) preservam exatamente os mesmos commit SHAs e tree SHAs.
- Todas as GitHub Releases históricas preservam seus `release_id`, notas e assets originais.
- Consumidores fixados em `?ref=v6.1.1` ou `?ref=v6.2.0` resolvem exatamente a mesma árvore Git.
- O `CHANGELOG.md` contém a nova seção `## [6.2.1]` seguida pelas seções históricas `6.2.0`, `6.1.1`, `6.1.0` e `6.0.0` sem duplicação.

## 14. Como diagnosticar inconsistências

| Sintoma / Mensagem de Erro | Causa Provável | Ação de Diagnóstico e Recuperação |
|---|---|---|
| `Invalid root stable manifest` | `.release-please-manifest.json` ausente, malformado ou com versão fora do padrão `X.Y.Z`. | Corrija `.release-please-manifest.json` para `{".":"<versão-estável-atual>"}`. |
| `fatal: couldn't find remote ref refs/tags/vX.Y.Z` | O manifest foi inicializado com uma versão cuja tag não existe no `origin`, ou uma publicação anterior avançou o manifest na `main` mas falhou antes de criar a tag. | Se for adoção inicial, alinhe o manifest com a tag real. Se for publicação interrompida na `main`, reexecute `gh workflow run release-please.yml --ref main` para concluir a publicação da tag pendente. |
| `Incomplete stable release: latest differs from manifest` | A tag `vX.Y.Z` existe no Git, mas não possui objeto GitHub Release publicado (ou a release está marcada como `draft`/`prerelease`, ou `releases/latest` aponta para outra versão). | Verifique `gh api repos/{owner}/{repo}/releases/latest`. Em adoção brownfield de tag sem GitHub Release, publique a release correspondente à baseline manual ou reconcilie a publicação interrompida. |
| `Manual baseline differs from reviewed adoption inventory` | `.release/brownfield.json` diverge do `release_id`, `commit` ou `repository` reais da tag manual `v6.2.0`. | Reconfira o inventário com `gh api repos/{owner}/{repo}/releases/tags/v6.2.0` e `git rev-parse 'v6.2.0^{commit}'`. |
| `Stable certificate differs from published tag or manifest` | A release estável automatizada não possui o asset `certification.json` ou o certificado diverge do commit/árvore da tag. | Reexecute `release-please.yml` na `main` para recuperar o upload de `certification.json` a partir da proposta autorizada. |
| `Tag or authorization mismatch` / `Existing proof mismatch` | Uma tentativa de publicação encontrou uma tag ou certificado preexistente com conteúdo/digest diferente da proposta autorizada. | **Bloqueio de integridade.** Não force o push; inspecione `git cat-file -p refs/tags/vX.Y.Z` e o log do run `authorize`. |
