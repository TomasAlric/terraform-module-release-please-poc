# Homologação no GitHub

Snapshot de 26/11/2026 UTC. Todos os links referem-se ao repositório público pessoal. O checkout inicial continha dois commits, README e um workflow flutuante v4. A main local e remota apontava para 670e23b484edef1bac664a9b77f2f03e9a1e6964. Actions estava habilitado, com permissão padrão de leitura e criação de PRs permitida. O mantenedor autenticado tinha acesso administrativo. Não havia proteções, tags, releases nem secrets de Actions. A API não informou o nome do plano de cobrança. A aplicação do ruleset ao repositório público foi confirmada por leitura e recusa real de merge. O Terraform instalado era 1.15.8. Para a homologação local foi utilizado o binário oficial 1.6.6 darwin_arm64 com checksum SHA-256 conferido. CI usou 1.6.6 em Linux. O módulo utiliza apenas o provider embutido terraform.io/builtin/terraform.

| Caso | Estado | Esperado e observado |
|---|---|---|
| H01 | PASS | Tag, release, manifest e changelog em 6.2.0. Nove runs de contrato passaram no bootstrap. |
| H02 | PASS | O fix rejeitou hífen final no nome. O bot abriu o PR de 6.2.1, escreveu changelog e manifest e publicou após certificação e merge. |
| H03 | PASS | Somente README mudou no PR 6. A reconciliação não publicou tag nem incrementou o candidato preexistente. Foi executado com o PATCH ainda aberto. |
| H04 | BLOCKED | Input opcional addon_channels certificado no PR 7. O Release PR 8 propôs 6.3.0. A publicação depende de certificação. |
| H05 | NOT EXECUTED | Acumular fix e feat e verificar mesma proposta, duas entradas e incremento MINOR. |
| H06 | NOT EXECUTED | Alterar contrato e publicar MAJOR. O parser já produziu 7.0.0 no experimento local. |
| H07 | PASS | Ao fixar arquitetura em arm64 o Terraform Test falhou. O GitHub recusou o merge. A correção restaurou o mapeamento e acrescentou cobertura ARM com capacidade sob demanda. |
| H08 | PASS | Reconciliação de main no mesmo SHA conservou a única tag 6.2.0 e um único candidato 6.2.1 com o mesmo head. |
| H09 | PASS | Dois dispatches a dois segundos de distância conservam tag, versão e PR únicos. Jobs executaram de 03:04:55 a 03:05:02 e de 03:05:05 a 03:05:15 UTC. |
| H10 | PASS | As duas releases existentes neste snapshot passaram na auditoria de árvore, SHA, PR, manifest, changelog, notas e certificação. |
| H11 | NOT EXECUTED | Uma mudança test deixou o PR 3 BEHIND. Falta comprovar nova certificação de uma mudança elegível acumulada em candidato previamente verde. |
| H12 | PASS | A retenção experimental de 6.2.1 reprovou diretamente o gate do PR 3. Merge recusado e apenas v6.2.0 publicada naquele instante. Depois da retirada da retenção, a segunda tentativa certificou a mesma revisão e permitiu a publicação. |

## Evidências

| Release | PR | CI | SHA da tag | Árvore certificada |
|---|---|---|---|---|
| [v6.2.0](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v6.2.0) | [#1](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/1) | [run](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746401361) | 6042bf2bff2cf45cba858c4bae677709120d6298 | 9cb343f3ec8fc570368b69f5a8e2e79eee00b94e |
| [v6.2.1](https://github.com/TomasAlric/terraform-module-release-please-poc/releases/tag/v6.2.1) | [#3](https://github.com/TomasAlric/terraform-module-release-please-poc/pull/3) | [run](https://github.com/TomasAlric/terraform-module-release-please-poc/actions/runs/45746966949) | e39cbc4984b2388be44a3c45a3ae3ca26b00a14b | 6feefe1c4cf04ca60af83723ee9277bf9a862554 |

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
