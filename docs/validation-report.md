# Homologação no GitHub

Snapshot de 26/11/2026 UTC. Todos os links referem-se ao repositório público pessoal. O checkout inicial continha dois commits, README e um workflow flutuante v4. A main local e remota apontava para 670e23b484edef1bac664a9b77f2f03e9a1e6964. Actions estava habilitado, com permissão padrão de leitura e criação de PRs permitida. O mantenedor autenticado tinha acesso administrativo. Não havia proteções, tags, releases nem secrets de Actions. A API não informou o nome do plano de cobrança. A aplicação do ruleset ao repositório público foi confirmada por leitura e recusa real de merge. O Terraform instalado era 1.15.8. Para a homologação local foi utilizado o binário oficial 1.6.6 darwin_arm64 com checksum SHA-256 conferido. CI usou 1.6.6 em Linux. O módulo utiliza apenas o provider embutido terraform.io/builtin/terraform.

| Caso | Estado | Esperado e observado |
|---|---|---|
| H01 | PASS | Tag, release, manifest e changelog em 6.2.0. Nove runs de contrato passaram no bootstrap. |
| H02 | PASS | O fix rejeitou hífen final no nome. O bot abriu o PR de 6.2.1, escreveu changelog e manifest e publicou após certificação e merge. |
| H03 | PASS | Somente README mudou no PR 6. A reconciliação não publicou tag nem incrementou o candidato preexistente. Foi executado com o PATCH ainda aberto. |
| H04 | PASS | Input opcional addon_channels certificado no PR 7. O bot abriu o PR 8 e publicou 6.3.0 após certificação e merge. |
| H05 | PASS | O mesmo PR 12 passou de 6.3.1 para 6.4.0 após o feat. O changelog contém os PRs 10 e 11. Nenhuma tag intermediária foi criada. |
| H06 | PASS | Renomeação incompatível integrada pelo PR 14. O PR 12 publicou v7.0.0 após certificação hospedada e merge protegido. |
| H07 | PASS | Ao fixar arquitetura em arm64 o Terraform Test falhou. O GitHub recusou o merge. A correção restaurou o mapeamento e acrescentou cobertura ARM com capacidade sob demanda. |
| H08 | PASS | Reconciliação de main no mesmo SHA conservou a única tag 6.2.0 e um único candidato 6.2.1 com o mesmo head. |
| H09 | PASS | Dois dispatches a dois segundos de distância conservam tag, versão e PR únicos. Jobs executaram de 03:04:55 a 03:05:02 e de 03:05:05 a 03:05:15 UTC. |
| H10 | PASS | A auditoria confirmou o PR, o squash, a árvore certificada, o manifest e as notas das releases da POC. |
| H11 | PASS | O run verde em 75f4603 perdeu validade após o fix #16. A migração #18 reconciliou novamente o mesmo PR 12. O head final 1351944 começou bloqueado e recebeu seu próprio CI aprovado na tentativa 1. |
| H12 | PASS | A retenção experimental de 6.2.1 reprovou diretamente o gate do PR 3. Merge recusado e apenas v6.2.0 publicada naquele instante. Depois da retirada da retenção, a segunda tentativa certificou a mesma revisão e permitiu a publicação. |
| H13 | PASS | O PAT criou o PR 20 com a versão 7.0.1 e o head 9744ce3 foi certificado na primeira tentativa. |
| H14 | PASS | O segundo fix atualizou o PR 20 para 6f4191d. Um novo run iniciou automaticamente e a certificação antiga perdeu validade. |
| H15 | PASS | Uma retenção reprovou o gate da nova revisão. O GitHub recusou o squash comum, a tag estava ausente e a recuperação certificou o mesmo head antes da publicação. |
| H16 | PASS | Dois dispatches sobre v7.0.1 chegaram com 2 s de intervalo. Os jobs executaram 04:15:45–04:15:57 e 04:15:59–04:16:07 UTC, com árvore, tags, releases e fila de candidatos estáveis. |
| H17 | PASS | O dispatch test_missing_token omitiu a credencial do preflight e falhou explicitamente. As etapas de escrita ficaram skipped. O secret cadastrado foi preservado. |

**Veredito PASS para H01–H17 e para os dois cenários do gate pré-publicação.** A issue de autorização #4 foi encerrada após a auditoria de v7.0.0.

## Evidências

| Release | PR | CI | SHA da tag | Árvore certificada |
|---|---|---|---|---|
| [v6.2.0](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v6.2.0) | [#1](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/1) | [run](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746401361) | 6042bf2bff2cf45cba858c4bae677709120d6298 | 9cb343f3ec8fc570368b69f5a8e2e79eee00b94e |
| [v6.2.1](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v6.2.1) | [#3](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/3) | [run](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746966949) | e39cbc4984b2388be44a3c45a3ae3ca26b00a14b | 6feefe1c4cf04ca60af83723ee9277bf9a862554 |
| [v6.3.0](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v6.3.0) | [#8](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/8) | [run](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747308832) | eeb9208b5e8d863c5606db275b9d53483d69cd6b | 3e86828c1f15cc30c72d55a031e9a9686148777d |

| Experimento | Registros |
|---|---|
| Correção do escape na regex jq do bootstrap | [actions/runs/45746351212](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746351212) · [actions/runs/45746371344](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746371344) |
| H02, cálculo e publicação | [pull/2](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/2) · [actions/runs/45746454574](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746454574) · [actions/runs/45746482887](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746482887) · [actions/runs/45747053101](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747053101) |
| H03, README e reconciliação | [pull/6](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/6) · [actions/runs/45746898933](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746898933) · [actions/runs/45746952803](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746952803) |
| H04, input e candidato | [pull/7](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/7) · [actions/runs/45747081514](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747081514) · [actions/runs/45747118153](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747118153) · [pull/8](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/8) |
| H07, falha e recuperação | [pull/5](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/5) · [actions/runs/45746603219](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746603219) · [actions/runs/45746647529](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746647529) |
| H08 e H09, dispatch no SHA deea7eaadc311cb353d2ccc9c81d2dbebc6aa63c | [actions/runs/45746586120](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746586120) · [actions/runs/45746589679](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746589679) |
| H12, autorização de workflow e duas tentativas | [issues/4](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/4) · [actions/runs/45746513186](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746513186) · [actions/runs/45746966949/attempts/1](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746966949/attempts/1) · [actions/runs/45746966949/attempts/2](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746966949/attempts/2) |
| Ruleset ativo | [rules/28132014](https://github.com/TomasAlric/terraform-module-release-please-poc/rules/28132014) |

O head reprovado em H07 foi 04cdc53958d22a727c23dfb29040472361ca1af1. A revisão corrigida foi f4be5cb863769f14cd1201f7ef2c4c2b6697aaf7. O Release PR 3 abriu em a1d7f33ced6468b02aaf3c102d9175cd3c175b31 e foi certificado em 103a2d77ee0da945a02401326f5e6e620ed6e4c0 após sincronização com main. O GitHub exigiu autorização no evento de abertura gerado pelo token do bot. O evento de atualização pelo mantenedor criou novo CI no head atualizado.

## Reconciliações posteriores

- PATCH proposto. [PR #10](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/10) · [reconciliação](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747454848) · [changelog do candidato](https://github.com/TomasAlric/terraform-module-release-please-poc/blob/457d83e92ef78783640158421ed3931639080503/CHANGELOG.md)
- Transporte fast-forward. [PR #13](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/13) · [reconciliação](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747737197) · [changelog do candidato](https://github.com/TomasAlric/terraform-module-release-please-poc/blob/3b1a350c12a7aeeedc0fd580ac56d0ada2ab03ba/CHANGELOG.md)
- MINOR acumulada. [PR #11](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/11) · [reconciliação](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747846293) · [changelog do candidato](https://github.com/TomasAlric/terraform-module-release-please-poc/blob/3f4c670e34d7d34f53e55c5d3a42fc0df0a90153/CHANGELOG.md)
- MAJOR acumulada. [PR #14](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/14) · [reconciliação](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747901767) · [changelog do candidato](https://github.com/TomasAlric/terraform-module-release-please-poc/blob/61e22d60377e0ffb2c54d087ae2bceb4fba9a815/CHANGELOG.md)

O dispatch sem commits elegíveis após a publicação de 6.3.0 terminou com sucesso no SHA da tag. O log registra “No commits for path”. [H08 após publicação](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747397390)

O workflow apresentou a MAJOR no mesmo PR que havia acumulado fix e feat. Os três eventos de atualização exigiram execução por revisão. O GitHub deixou a certificação em action_required. [PR atual](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/12) · [CI de 6.3.1](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747774760) · [CI de 6.4.0](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747875746) · [CI de 7.0.0](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45747939746)

A reutilização nativa da branch do bot produziu histórico divergente entre candidatos no início da POC. Preservamos essa evidência e protegemos a referência com um segundo ruleset. A atualização elegível seguinte foi fast-forward e levou o head anterior como ancestral. [Divergência inicial](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/103a2d77ee0da945a02401326f5e6e620ed6e4c0...483b5ae0ef0a70a2e44582faba675f5613e8da04) · [Histórico após correção](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/3b1a350c12a7aeeedc0fd580ac56d0ada2ab03ba...3f4c670e34d7d34f53e55c5d3a42fc0df0a90153)

Os dez casos do script check-policy.cjs passaram com a biblioteca 17.6.0. Eles exercitam a geração de candidato em memória. As publicações hospedadas e seus SHAs constam da tabela de releases. O único recurso aplicado na homologação foi terraform_data em estado de teste local ao runner. A execução não acessou APIs ou credenciais AWS.

## H11 após a primeira autorização

| Revisão do PR #12 | Tree SHA | Run hospedado | Observação |
|---|---|---|---|
| 75f4603d28b54a0b3ad3fec416a367c07efc9014 | be9d05223a419b9f94b140f56818b594f8af8690 | [45748126424, tentativa 2](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45748126424/attempts/2) | SUCCESS, 12 testes, árvore do merge sintético 4ddb25423719001a8df6322672262fc6ee3e1db7 confirmada no log. O PR estava OPEN e CLEAN. |
| a8f6a3a16dfd91f2d6f8d359f7c90f0083db87d6 | 05d6079a8131a4e39fd187c5cda66cd7008b7ed5 | [45751632630](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45751632630) | Na abertura da recertificação, action_required e PR BLOCKED, sem resultado do check para esse head. A árvore nesta linha foi lida do commit do candidato. |

O novo teste de nome DNS iniciado por dígito produziu 12 passes e uma falha antes do fix. Depois passaram 13 testes. O squash protegido 80150dbf01c7eef29587b11a69b5c1a5485bd082 integrou a correção. O bot acrescentou o fix ao changelog do mesmo PR #12 e manteve 7.0.0 no manifest. O candidato tem como pais esse squash e o head previamente verde. O check obrigatório continua estrito e vinculado ao app GitHub Actions. [PR #16](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/16) · [CI da correção](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45751557696) · [Reconciliação](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45751594717) · [Impedimento](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/4#issuecomment-7182102114)

## Homologação do PAT

- Migração e primeira recertificação PAT. [pull/18](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/18) · [actions/runs/45753624299](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753624299) · [actions/runs/45753676786](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753676786) · [actions/runs/45753714473](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753714473) · [releases/tag/v7.0.0](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.0.0) · [issues/4](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/4)
- H13, fix e criação. [pull/19](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/19) · [pull/20](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/20) · [actions/runs/45753804437](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753804437) · [actions/runs/45753840011](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753840011)
- H14/H15, atualização e recuperação. [pull/21](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/21) · [actions/runs/45753914465](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753914465) · [actions/runs/45753946032/attempts/1](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753946032/attempts/1) · [actions/runs/45753946032/attempts/2](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753946032/attempts/2) · [actions/runs/45754002960](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45754002960) · [releases/tag/v7.0.1](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.0.1)
- H16 e H17. [actions/runs/45754080116](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45754080116) · [actions/runs/45754084441](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45754084441) · [actions/runs/45753684651](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45753684651)

| Tag | Head certificado | SHA do squash e da tag | Árvore do CI e da tag |
|---|---|---|---|
| v7.0.0 | 135194423b975d79adb970cda87c5d3c08a255e6 | 70b0f83a10fde9174b949e92c9901de78e6e9086 | 77c7ec777374a7f1780f9407c0a1a2511881ad1e |
| v7.0.1 | 6f4191d0b26545a737e5ff37ee14267139143c76 | d1ccee5653cc6c1ac703e0f09ee73c4a2c1c8a8a | 3c5bd2edb98fdcfe7f786807451bb2038ad07d72 |

No histórico de atividade da branch, o pusher autenticado dos heads PAT é TomasAlric. O metadado Git do autor e committer é github-actions[bot]. O PR 12 preservou o autor github-actions[bot], o PR 20 foi aberto por TomasAlric, os runs PAT foram acionados por TomasAlric e o campo author das releases PAT é TomasAlric. Essas identidades descrevem operações diferentes. Os eventos antigos em action_required continuam no histórico.

## Certificação antes da publicação

O PR #22 introduziu a separação entre verificador read-only e publicador. O PR #23 acrescentou o alias OCI amd64 para exercitar uma MINOR real. O merge do release PR #24 passou pela avaliação protegida 5387247545 (PR, checks e proteção de histórico). [Implementação](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/22) · [Mudança do módulo](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/23) · [Candidato](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/24)

| Experimento | Resultado | Evidência |
|---|---|---|
| Antes da tag, identificador de evidência divergente | PASS | O verificador encontrou um run diferente do exigido, encerrou com falha e o writer ficou skipped. A consulta git/matching-refs/tags/v7.1.0 devolveu uma lista vazia antes do retry. [Run negativo](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45821459295) |
| Antes da tag, evidência da revisão correta | PASS | Removida a retenção experimental, o verificador autorizou o mesmo squash e a publicação ocorreu em workflow_dispatch. O asset baixado e a auditoria independente coincidiram nos três SHAs abaixo. [CI](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45821415181) · [Publicação](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45821511144) · [Release e asset](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v7.1.0) |

Tag v7.1.0, candidato bcec8061ef748d0ada82924430a46a162b2e69d6, árvore certificada f1ac7cf7d06866da7ade9924cd0af240cc32b761, squash e tag 7094d1b149697f366165ea756fb6cee9dbbac1fe. A evidência registra a tentativa 1 do run 45821415181, job 139914339925, concluído em 2026-11-26T12:37:47Z. As três releases desta continuação foram auditadas e as três históricas foram revalidadas com a política de identidade atualizada.

As ações negativas H15 e H17 foram experimentos controlados. No H15 o mantenedor tentou o merge comum pela CLI. A política ativa tinha lista de bypass vazia e também se aplicava ao proprietário do PAT. O workflow de release não possui etapa que realize merge. O prazo e a lista de permissões individuais do secret não foram inspecionados. A POC executou Terraform Test com provider embutido, sem autenticação ou provisionamento na AWS.
