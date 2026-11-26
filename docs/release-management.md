# Operação

O pacote raiz em release-please-config.json escolhe terraform-module, tag com v e sem componente. A POC migrou da action v5.0.0 para a API da biblioteca 17.6.0 fixada em lockfile, para vincular a escrita a um único SHA. A estratégia prepara changelog e pode atualizar referências de versão reconhecidas em README e metadados Terraform. O manifest usa a chave ponto. Em um repositório novo, primeiro integrar e certificar a configuração e o changelog inicial por PR chore, depois criar a release v6.2.0 com --target apontando para o squash certificado. Conferir a árvore antes da criação. Em um repositório com tags existentes, recuperar a versão publicada e manter esse limite histórico. [Manifest](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) · [Action](https://github.com/googleapis/release-please-action)

| Mensagem isolada | Candidato a partir de 6.2.0 |
|---|---|
| fix, perf | 6.2.1 |
| feat | 6.3.0 |
| feat! ou footer BREAKING CHANGE | 7.0.0 |
| docs, test, chore, refactor, ci sem quebra | nenhum |

A matriz foi executada com o parser e a estratégia reais, usando um adaptador de inventário de arquivos em memória. Para reproduzir na raiz, instale a dependência em diretório temporário e execute o programa. Cada caso contém uma asserção sobre o candidato gerado.

```sh
policy_dir=$(mktemp -d)
npm install --prefix "$policy_dir" --ignore-scripts release-please@17.6.0
NODE_PATH="$policy_dir/node_modules" node scripts/check-policy.cjs
```

A estratégia usa o maior incremento das mudanças acumuladas e incorpora as entradas visíveis no changelog. Preserve as labels autorelease e a branch gerenciada. O mecanismo usa um grupo de concurrency único em main, sem cancelar o job em execução. GitHub pode substituir uma execução pendente por outra. Push e workflow_dispatch reconciliam o histórico da branch. Para repetir, rode `gh workflow run release-please.yml --ref main` e compare PRs, manifest, tags e releases antes/depois.

## Governança e diagnóstico

Verifique que o squash conserva título e corpo validados. Se o candidato estiver atrás da base, aguarde reconciliação e certifique a revisão atualizada antes de fazer merge. Confirme o check na revisão exata e compare o tree do run com o tree do squash publicado. Um job action_required pode sequer aparecer na lista de checks do PR. Abra Actions ou o banner do PR e autorize a execução com uma conta com escrita. Eventos opened, synchronize e reopened produzidos pelo GITHUB_TOKEN podem criar runs aguardando aprovação. Outros eventos gerados por esse token normalmente suprimem novos runs, com exceções explícitas de dispatch. [Eventos e autenticação](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

Para H12, a variável de Actions CERTIFICATION_HOLD_VERSION retém uma versão do candidato no passo de extensão. Confirme o run vermelho, a recusa de merge e a ausência da tag antes de retirar a retenção e repetir o CI. Preservar o histórico de tentativas. Se o Terraform falhar, abra o log do teste e corrija a branch pelo fluxo normal. Para H11, registre o head e o run aprovados antes da segunda mudança, aguarde atualização do mesmo PR e compare a nova certificação. Para H10, confira changelog e manifest lidos pela tag, release notes, merge_commit_sha e o tree registrado no CI.

O owner fornece RELEASE_PLEASE_TOKEN como Repository Secret para este repositório e o fluxo valida o ID de usuário 82914085. O input booleano test_missing_token do workflow_dispatch permite exercitar a falha antes de qualquer escrita. O PAT só é referenciado pelo writer na main. npm ci usa lockfile e ignore-scripts. O CI de PR usa credencial efêmera de leitura. [Gatilhos de workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

## Comparativo para a próxima POC

| Dimensão | Release Please | Semantic Release |
|---|---|---|
| Publicação e aprovação | Mantém um Release PR revisável. Merge inicia publicação. | Pipeline de branch calcula e publica após os gates configurados. Aprovação humana pode ser implementada por environment ou etapa anterior. |
| SemVer e changelog | Commits, manifest e changelog versionado no candidato. | Plugins de análise e geração de notas. Arquivo de changelog e commit dependem de plugins. |
| Terraform e extensibilidade | Estratégia terraform-module e updaters de arquivos. | Pipeline configurável por plugins e comandos para integrar o ecossistema Terraform. |
| Certificação | Certificar árvore do candidato e rastrear squash. | Certificar o commit de release antes da etapa publish. |
| Autenticação e segurança | Credencial para PR, tags e release. Verificar gatilhos do bot. | Credencial para refs e plataforma publicada. Restringir tokens de cada plugin. |
| IA | Sugestões podem ser revisadas no PR. | Enriquecimento pode entrar antes da publicação com revisão externa. |

Experimentar Semantic Release separadamente com o mesmo conjunto de casos e gates. Nesta POC, o único publicador pós-bootstrap é Release Please. [Semantic Release](https://semantic-release.gitbook.io/semantic-release/)

Para auditar uma tag, execute por exemplo `python3 scripts/audit-release.py v6.2.1 3 45746966949` antes da expiração dos logs de Actions. O programa compara SHA do PR, árvore Git registrada pelo runner, merge, tag, manifest, changelog e notas da release. Exporte o resultado e retenha o log antes de expirar.

## Transporte da branch do bot

O PR 13 conservou a action oficial para publicação com skip-github-pull-request. A biblioteca oficial na mesma versão calcula os candidatos via Manifest.buildPullRequests e aplica os updaters a partir da árvore da main. scripts/release/candidate.cjs escreve essa árvore em um commit com a base e o head anterior como pais, envia por push fast-forward e reconcilia título, descrição e rótulo do PR. O lockfile fixa as dependências. O script termina sem criar commit quando a árvore e a base já coincidem. Se a main avançou durante o cálculo, o próximo push reconcilia novamente. O ruleset da branch do bot recusa non-fast-forward inclusive para administradores.

A investigação encontrou divergência de ancestralidade quando a action em sua configuração original reutilizou a branch entre os PRs 3, 8 e 12. O cliente da biblioteca envia force=true nesse caminho. Isso contrariou a restrição da POC para a referência do bot. As tags e a main foram preservadas. A correção foi aplicada antes da acumulação de mudanças elegíveis no PR 12. [Implementação oficial](https://github.com/googleapis/release-please/blob/v17.6.0/src/github.ts) · [Correção](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/13)

Para reproduzir em um repositório novo, configure o PAT e crie os rótulos `autorelease: pending` e `autorelease: tagged` antes do primeiro candidato. Reproduza o ruleset de main (squash, strict e check Terraform certification com integração GitHub Actions) e o da branch do bot (non-fast-forward). Configure o squash com PR_TITLE e PR_BODY. No bootstrap use um commit chore, faça o primeiro merge com CI verde e crie a tag no SHA desse merge.

## Revisão para adoção corporativa

### Identidade que prepara o PR

| Identidade | Execução de CI e operação |
|---|---|
| GITHUB_TOKEN | Efêmero por job. Nesta POC, a atualização do release PR criou um run pull_request em action_required. A autorização de execução e a revisão de código são controles independentes. [Eventos do GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) |
| Fine-grained PAT | Um token de usuário com acesso apenas ao repositório pode disparar o evento normal. Tem expiração e depende das permissões e da continuidade da conta. É uma opção transitória para a POC. [Permissões e ciclo de vida](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) |
| GitHub App | Para vários módulos, instalar uma App de preparação nos repositórios selecionados e emitir um token de instalação por execução, válido por uma hora. Usar a identidade da App tanto no push quanto na criação/edição do PR. Validar que opened e synchronize disparam o CI normal no ambiente corporativo. A chave de assinatura requer custódia, rotação e acesso restrito ao workflow confiável. [Token de instalação](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) |

Para o fluxo atual, conceder ao preparador Contents e Pull requests com escrita e Issues com escrita para a rotulagem usada pela integração. Manter a certificação de PR com leitura de conteúdo. Em produção, manter os revisores CODEOWNERS independentes e o check estrito de CI, sem bypass de main para o bot. Na POC a regra efetiva exige zero reviews. A POC homologou o PAT. O auditor vincula cada release histórica ao seu PR, autor e publicador esperados. O autor do PR 12 continua sendo o bot. O commit da branch pode ter metadados github-actions[bot] mesmo quando a atividade de push e a publicação são do owner.

### Transporte do candidato

A implementação 17.6.0 usa code-suggester e passa force=true nas rotas de criação e atualização do PR. O modo fork muda o repositório de origem e acrescenta governança de fork. As opções oficiais de separar criação do PR e publicação separam responsabilidades, mas o transporte nativo continua usando essa atualização da ref. Não foi identificada opção documentada nessa versão para exigir atualização fast-forward do mesmo PR. [Código fixado](https://github.com/googleapis/release-please/blob/v17.6.0/src/github.ts) · [Inputs da action](https://github.com/googleapis/release-please-action/blob/v5.0.0/action.yml)

Com a proibição vigente, manter candidate.cjs. Ele usa o cálculo oficial e escreve um commit descendente da base e do candidato anterior. O custo inclui acompanhar o formato dos candidatos, updaters, caminhos permitidos, labels, tratamento de falha parcial e versões distintas da biblioteca e da action. Antes de atualizar dependências, repetir os experimentos de acumulação, reconciliação idempotente, recertificação, concorrência e publicação em repositório de teste.

Se a política corporativa aceitar histórico reescrito **apenas na branch descartável do bot**, avaliar o transporte nativo com um ruleset específico para a ref exata e uma App identificada. Manter main e tags em regras separadas, restringir quem pode escrever na branch do bot e validar a combinação de rulesets do plano. Uma exceção de bypass afeta o conjunto de regras em que é criada. Preservar externamente o SHA e a evidência de cada revisão anterior. A alternativa depende de decisão de governança. [Regras aplicáveis](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

### Gate determinístico antes de criar a tag

Na main, Manifest.buildReleases seleciona um único candidato. O job authorize lê o squash protegido, o manifest, as notas e o histórico de CI. A política 1 fixa os blobs de ci.yml e certify.sh. A tentativa bem-sucedida deve anteceder o merge e pertencer à branch e ao head corretos. O verificador confere os pais do merge sintético (base e head), a árvore da API Git, a árvore registrada no job e a árvore do squash. Uma alteração intencional na política de CI exige revisão dos blobs em verify.py. EXPECTED_CERTIFICATION_RUN acrescenta uma restrição de igualdade para a homologação negativa.

O writer recebe as coordenadas imutáveis e as notas como output do job. Cria a ref diretamente no SHA certificado, por push normal que recusa uma tag divergente, e usa GitHub.createRelease da biblioteca oficial nesse mesmo SHA. A API de releases ignora target_commitish quando a tag já existe, por isso o writer confere a ref antes e depois. Em uma repetição, confere release, identidade, notas e asset já presentes e completa as labels. O contrato certification.json contém árvore, PR, head, base, squash, run, tentativa, job, política, resultado e instante da certificação. O auditor pós-publicação continua em scripts/audit-release.py. [Manifest](https://github.com/googleapis/release-please/blob/v17.6.0/src/manifest.ts) · [Cliente de publicação](https://github.com/googleapis/release-please/blob/v17.6.0/src/github.ts) · [API de releases](https://docs.github.com/en/rest/releases/releases)

### Limites de governança

Os testes usaram o escopo declarado pelo owner. O writer precisa escrever conteúdo e refs, PRs e rótulos. A leitura de Actions da verificação final pertence ao GITHUB_TOKEN do job authorize. A POC não testou revogar permissões individuais do PAT. O prazo de expiração é administrado pelo owner. Para rotacionar, criar manualmente um token restrito, substituir o secret, validar identidade e reconciliação e revogar o antigo. O valor do token não integra as evidências.

O repositório tem um colaborador administrador, zero reviews obrigatórios, dois rulesets de branch e releases mutáveis. Um Repository Secret depende da proteção das definições de workflow: alguém com capacidade de modificar e executar workflows confiáveis representa risco. Para adoção corporativa, exigir revisão independente dos CODEOWNERS em workflows, verificadores e dependências, restringir a liberação do secret a um environment protegido na main e avaliar uma identidade de serviço com escopo mínimo. A POC usa o PAT por decisão do owner.

O grupo de concorrência serializa o publicador da POC. Outro escritor privilegiado ainda poderia mover/excluir tags ou substituir assets fora desse fluxo. Avaliar regras para criação de v* apenas pelo publicador e regras separadas que impeçam atualização e exclusão. Antes de habilitar imutabilidade, adaptar o upload do asset para uma release draft, anexar a prova e só então publicar. Arquivar logs e prova com retenção pelo período de suporte e assinatura independente. [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) · [Imutabilidade](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
