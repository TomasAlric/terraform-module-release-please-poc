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
