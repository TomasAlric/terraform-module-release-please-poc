# Release Candidate Management (Fase 2)

## 1. Identidade e rastreabilidade de candidatos

Antes que qualquer alteração seja integrada à `main` ou promovida a uma versão estável, o script `scripts/release/rc.cjs` cria uma referência candidata imutável e rastreável associada a:

- **Repositório**: `TomasAlric/terraform-module-release-please-poc`
- **Pull Request**: Número do PR (`pr_number`)
- **Versão estável atual e versão prevista**: ex. `v7.1.0` -> `v7.1.1`
- **Head SHA**: Commit do topo da branch do PR (`head_sha`)
- **Base SHA**: Commit da `main` utilizado como base (`base_sha`)
- **Tested Merge SHA**: Commit do merge sintético do PR (`tested_sha`)
- **Certified Tree SHA**: Árvore Git exata do conteúdo testado (`tree_sha`)
- **Workflow Run ID e Attempt**: Identificador da execução no GitHub Actions
- **Policy Version**: Versão da política de certificação (`policy_version: 2`)

## 2. Avaliação experimental: Alternativa A vs Alternativa B

Foram implementadas e homologadas experimentalmente no GitHub as duas estratégias de referência candidata:

- **Alternativa A — Tags SemVer pre-release + GitHub Pre-release**:
  Padrão: `v<major>.<minor>.<patch>-rc.pr<N>.<sha7>`
  Exemplos reais homologados:
  - `v7.1.1-rc.pr26.d299f87`
  - `v7.1.1-rc.pr26.e57c8f6`
  - `v7.1.1-rc.pr26.b46ee01`
  - `v8.0.0-rc.pr27.3085955`
  - `v7.2.0-rc.pr27.3085955`
  - `v7.1.1-rc.pr28.f0a7758`
  - `v7.2.0-rc.pr27.835922c`
  - `v7.2.0-rc.pr29.1c3e58e`
- **Alternativa B — Referências isoladas fora do padrão SemVer**:
  Padrão: `candidate/pr-<N>/<sha7>`
  Exemplo real homologado:
  - `candidate/pr-25/7187b3f` (PR #25, `ci:`, sem incremento de versão)

### Matriz experimental comparativa (11 critérios obrigatórios)

| Critério | Alternativa A (`vX.Y.Z-rc.prN.sha7` + GitHub Pre-release) | Alternativa B (`candidate/pr-N/sha7` tag isolada) | Evidência experimental na POC |
|---|---|---|---|
| 1. Descoberta da última release pelo Release Please | **Não interfere.** `Manifest.fromManifest` lê `.release-please-manifest.json` (`7.1.0`) e compara igualdade exata `expectedVersion.toString() === tagName.version.toString()`. Como `7.1.1-rc.pr26.b46ee01 !== 7.1.0`, o Release Please ignora os pre-releases e localiza `v7.1.0`. | **Não interfere.** `TagName.parse("candidate/pr-25/7187b3f")` retorna `undefined`, sendo imediatamente descartada pelo iterador. | Runs `45989932616` e `45991676018` descobriram `v7.1.0` e `v7.1.1` com 8 tags RC presentes. |
| 2. Cálculo de SemVer | **Não interfere.** O incremento parte sempre da versão do manifest na `main` (`7.1.0` -> `7.1.1` -> `7.2.0`), mesmo após existir `v8.0.0-rc.pr27.3085955`. | **Não interfere.** | Mesmo com `v8.0.0-rc.pr27.3085955` criada no H20, o Release Please calculou `7.1.1` (PR #28) e `7.2.0` (PR #29). |
| 3. Acumulação de alterações | **Não interfere.** O histórico de commits é coletado em `main` até o SHA da release estável do manifest. | **Não interfere.** | `CHANGELOG.md` e commits acumulados preservados em `v7.1.1` e `v7.2.0`. |
| 4. Manifest (`.release-please-manifest.json`) | **Não interfere.** Candidatos não alteram o manifest na `main`. | **Não interfere.** | `.release-please-manifest.json` evoluiu estritamente `7.1.0` -> `7.1.1` -> `7.2.0`. |
| 5. Changelog (`CHANGELOG.md`) | **Não interfere.** Os links de comparação no changelog utilizam apenas tags estáveis (`v7.1.0...v7.1.1`, `v7.1.1...v7.2.0`). | **Não interfere.** | `CHANGELOG.md` nas releases `v7.1.1` e `v7.2.0`. |
| 6. GitHub Releases | Visível na interface do GitHub com badge `Pre-release` e metadados completos de auditoria. | Não cria GitHub Release (apenas tag Git), evitando pre-releases sem versão SemVer associada. | Releases listadas via `gh release list`. |
| 7. Identificação da release `Latest` | **Não interfere** quando criada com `prerelease: true` e `make_latest: "false"`. O badge `Latest` permaneceu em `v7.1.0`, depois `v7.1.1`, depois `v7.2.0`. | **Não interfere.** | `gh release list` confirma `v7.1.1` e depois `v7.2.0` como `Latest`. |
| 8. Consumo Terraform via Git source (`?ref=`) | **Compatível.** Terraform clona e faz checkout exato de `?ref=v7.1.1-rc.pr26.b46ee01`. | **Compatível.** Terraform clona e faz checkout exato de `?ref=candidate/pr-25/7187b3f`. | Comprovado nos jobs Day 0 e Day 2 dos PRs #25, #26, #27, #28 e #29. |
| 9. Auditoria das releases estáveis | **Não interfere.** `verify.py` exige `v\d+\.\d+\.\d+` para promoção e `audit-release.py` audita a tag estável e rastreia o RC associado. | **Não interfere.** | `audit-release.py` em `v6.2.0`..`v7.2.0`. |
| 10. Concorrência entre PRs | **Isolamento total.** O identificador inclui `pr<N>` e `<sha7>`, impossibilitando colisão entre PRs simultâneos. | **Isolamento total** (`pr-<N>/<sha7>`). | H30: PR #26 (`v7.1.1-rc.pr26.b46ee01`) e PR #27 (`v7.2.0-rc.pr27.3085955`) abertos simultaneamente. |
| 11. Idempotência | **Idempotente.** Reexecuções no mesmo SHA verificam a igualdade do commit/tree da tag e a existência da pre-release sem sobrescrever. | **Idempotente.** | 4 tentativas no run `45944466864` (PR #26) e 2 tentativas no run `45991745368` (PR #29). |

### Decisão arquitetural adotada

Adotamos uma **estratégia híbrida governada** que atende à preferência por pre-releases SemVer visíveis sem criar versões fictícias em PRs que não geram release:

1. **Quando o PR prevê incremento de versão (`PATCH`, `MINOR` ou `MAJOR`)**:
   - Utiliza a **Alternativa A**: cria a tag imutável `v<next>-rc.pr<N>.<sha7>` e publica uma **GitHub Release marcada com `prerelease: true` e `make_latest: "false"`**.
2. **Quando o PR não gera release (`Release type: NONE`, ex. `docs:` ou `ci:` sem commits elegíveis acumulados)**:
   - Utiliza a **Alternativa B**: cria a referência candidata isolada `candidate/pr-<N>/<sha7>` (sem criar GitHub Release), permitindo que os testes obrigatórios de Fresh Installation (Day 0) e Consumer Upgrade (Day 2) continuem consumindo o módulo remotamente via Git sem pular nenhum quality gate.

## 3. Imutabilidade e segurança

- **Proibição de criação prematura de tag estável**: `scripts/release/rc.cjs` rejeita explicitamente qualquer referência no formato `^v\d+\.\d+\.\d+$`.
- **Imutabilidade de tags candidatas**: `rc.cjs` verifica `git ls-remote origin refs/tags/<candidate_tag>` e faz push sem `--force`. Se a tag já existir para o mesmo commit e árvore, a operação é idempotente; se apontar para outro commit, a execução falha imediatamente.
- **Execução privilegiada sem código não confiável**: O job `prepare-candidate` faz checkout de `refs/heads/main`, busca os commits do PR apenas como objetos Git (`git fetch`), calcula a versão e cria a tag candidata usando o `GITHUB_TOKEN` efêmero do job, sem jamais expor `RELEASE_PLEASE_TOKEN`.
