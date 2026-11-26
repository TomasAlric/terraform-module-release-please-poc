# Operação

O pacote raiz em release-please-config.json escolhe terraform-module, tag com v e sem componente. A action v5.0.0 usa a biblioteca 17.6.0. A estratégia prepara changelog e pode atualizar referências de versão reconhecidas em README e metadados Terraform. O manifest usa a chave ponto. Em um repositório novo, primeiro integrar e certificar a configuração e o changelog inicial por PR chore, depois criar a release v6.2.0 com --target apontando para o squash certificado. Conferir a árvore antes da criação. Em um repositório com tags existentes, recuperar a versão publicada e manter esse limite histórico. [Manifest](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) · [Action](https://github.com/googleapis/release-please-action)

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

Como alternativa ao consentimento para runs do bot, um mantenedor pode instalar um GitHub App somente neste repositório, conceder Contents, Pull requests e Issues com escrita e Metadata com leitura, configurar a variável RELEASE_APP_ID e o secret RELEASE_APP_PRIVATE_KEY no GitHub, e adaptar o job para emitir um token de instalação curto com actions/create-github-app-token fixada por SHA. Outra opção é criar manualmente um fine-grained PAT com expiração e os mesmos direitos neste repositório, armazenar em RELEASE_PLEASE_TOKEN e passá-lo ao input token, ao checkout autenticado e ao GH_TOKEN do passo de reconciliação. Ambas requerem configuração explícita pelo mantenedor e validação de novos eventos e permissões. [Autenticação da action](https://github.com/googleapis/release-please-action#github-credentials)

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

Para reproduzir em um repositório novo, habilite criação de PRs pelo token do workflow e crie o rótulo `autorelease: pending` antes do primeiro candidato. Reproduza o ruleset de main (squash, strict e check Terraform certification com integração GitHub Actions) e o da branch do bot (non-fast-forward). Configure o squash com PR_TITLE e PR_BODY. No bootstrap use um commit chore, faça o primeiro merge com CI verde e crie a tag no SHA desse merge.

## Revisão para adoção corporativa

### Identidade que prepara o PR

| Identidade | Execução de CI e operação |
|---|---|
| GITHUB_TOKEN | Efêmero por job. Nesta POC, a atualização do release PR criou um run pull_request em action_required. A autorização de execução e a revisão de código são controles independentes. [Eventos do GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) |
| Fine-grained PAT | Um token de usuário com acesso apenas ao repositório pode disparar o evento normal. Tem expiração e depende das permissões e da continuidade da conta. É uma opção transitória para a POC. [Permissões e ciclo de vida](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) |
| GitHub App | Para vários módulos, instalar uma App de preparação nos repositórios selecionados e emitir um token de instalação por execução, válido por uma hora. Usar a identidade da App tanto no push quanto na criação/edição do PR. Validar que opened e synchronize disparam o CI normal no ambiente corporativo. A chave de assinatura requer custódia, rotação e acesso restrito ao workflow confiável. [Token de instalação](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) |

Para o fluxo atual, conceder ao preparador Contents e Pull requests com escrita e Issues com escrita para a rotulagem usada pela integração. Manter a certificação de PR com leitura de conteúdo. Em produção, manter os revisores CODEOWNERS independentes e o check estrito de CI, sem bypass de main para o bot. Na POC a regra efetiva exige zero reviews. A migração de identidade também exige ajustar o auditor, que hoje identifica o autor pelo login literal github-actions[bot]. Fixar e verificar a identidade esperada da App. PAT e App são alternativas analisadas nesta revisão, ainda sem homologação prática.

### Transporte do candidato

A implementação 17.6.0 usa code-suggester e passa force=true nas rotas de criação e atualização do PR. O modo fork muda o repositório de origem e acrescenta governança de fork. As opções oficiais de separar criação do PR e publicação separam responsabilidades, mas o transporte nativo continua usando essa atualização da ref. Não foi identificada opção documentada nessa versão para exigir atualização fast-forward do mesmo PR. [Código fixado](https://github.com/googleapis/release-please/blob/v17.6.0/src/github.ts) · [Inputs da action](https://github.com/googleapis/release-please-action/blob/v5.0.0/action.yml)

Com a proibição vigente, manter candidate.cjs. Ele usa o cálculo oficial e escreve um commit descendente da base e do candidato anterior. O custo inclui acompanhar o formato dos candidatos, updaters, caminhos permitidos, labels, tratamento de falha parcial e versões distintas da biblioteca e da action. Antes de atualizar dependências, repetir os experimentos de acumulação, reconciliação idempotente, recertificação, concorrência e publicação em repositório de teste.

Se a política corporativa aceitar histórico reescrito **apenas na branch descartável do bot**, avaliar o transporte nativo com um ruleset específico para a ref exata e uma App identificada. Manter main e tags em regras separadas, restringir quem pode escrever na branch do bot e validar a combinação de rulesets do plano. Uma exceção de bypass afeta o conjunto de regras em que é criada. Preservar externamente o SHA e a evidência de cada revisão anterior. A alternativa depende de decisão de governança. [Regras aplicáveis](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

### Gate determinístico antes de criar a tag

Hoje audit-release.py faz a comparação **após** a publicação. A action tem escrita durante a reconciliação e o nome de check obrigatório identifica um job de GitHub Actions. Para uma certificação de infraestrutura, propõe-se a seguinte sequência:

1. Registrar evidência autenticada fora do controle do código do PR. Vincular repositório, PR, base, head, SHA de merge de teste, tree SHA, versão proposta, workflow confiável, run ID, tentativa, matriz e conclusões. Preservar o resultado mesmo após expiração ou reexecução do run. Um summary ou arquivo fornecido pelo próprio PR, isoladamente, é insuficiente.
2. Após o merge protegido, um verificador de leitura resolve o candidato exato de Release Please. Exigir PR de release esperado e merged, último head certificado, run e job confiáveis concluídos com sucesso, governança satisfeita e igualdade entre a árvore registrada e a árvore do squash. Ler manifest e changelog pelo SHA do squash. Se uma evidência estiver ausente, duplicada ou inconsistente, interromper antes da tag.
3. Vincular explicitamente tag, SHA do squash e digest da evidência à operação de publicação. Liberar escrita somente para o publicador em contexto protegido. O publicador deve consumir o candidato verificado. Chamar uma action que redescobre todos os releases pendentes após verificar apenas um candidato reintroduziria uma corrida. O cliente oficial envia release.sha como target_commitish. Validar o conjunto exato de candidatos ao integrar o gate. [Manifest](https://github.com/googleapis/release-please/blob/v17.6.0/src/manifest.ts) · [Cliente de publicação](https://github.com/googleapis/release-please/blob/v17.6.0/src/github-api.ts)
4. Serializar pelo repositório e tag, usar criação única, verificar qualquer ref ou release preexistente e tratar repetição idêntica como recuperação. Divergência interrompe a publicação. Resolver uma tag anotada até o commit antes de comparar. Um novo push na main não muda o SHA aprovado.
5. Para v*, avaliar um ruleset que restrinja **criação** à identidade publicadora e outro que bloqueie **atualização e exclusão**, sem estender a exceção de criação. Preparar evidências e assets antes de publicar uma release imutável. Arquivar atestação, logs, inventário e digest com retenção pelo prazo de suporte do módulo. A imutabilidade protege tag e assets publicados; título e notas ainda podem ser editados. A API desta POC informou immutable releases desabilitadas e dois rulesets de branch. [Imutabilidade](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) · [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

Para EKS e ECS, homologar primeiro as identidades e o gate por SHA em um módulo piloto. Em seguida, incluir contratos e runtime da matriz, teste de upgrade e evidência de destroy e janitor no mesmo registro de certificação. A publicação depende da matriz e dos CODEOWNERS. O desenho acima é uma proposta para a próxima etapa.
