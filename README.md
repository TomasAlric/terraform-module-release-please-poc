# Release management de um módulo Terraform

Esta POC pessoal simula a configuração de um cluster com o recurso embutido `terraform_data`. A versão inicial do módulo é 6.2.0. O runner usa Terraform CLI 1.6.6, Bash e jq. O exemplo em `examples/complete` mostra uma configuração completa e o objeto de saída `cluster`.

## Testes locais

Na raiz do checkout, execute `scripts/certify.sh`. O script verifica formatação, inicializa o módulo, valida HCL, roda os contratos e valida o exemplo e a política de release. O único apply do teste usa o provider embutido em estado temporário. O script termina com código diferente de zero na primeira falha.

## Contribuições e publicação

Abra um PR para main. Use um título como `fix: corrigir validação DNS` ou `feat: adicionar metadados opcionais`. Descreva uma quebra com `feat!: remover output legado` ou um parágrafo final iniciado por `BREAKING CHANGE: `. O GitHub usa o título e o corpo no squash. A aprovação do check Terraform certification libera o merge da revisão atualizada.

Depois do merge, o Release Please reconcilia o histórico, reúne as mudanças elegíveis num PR com a versão e o changelog e publica a GitHub Release após o merge desse PR. O GitHub pode exigir autorização humana para iniciar o CI do PR criado pelo token do workflow. O repositório tem um único mantenedor e exige CI. CODEOWNERS identifica o responsável.

Consulte os resultados e SHAs no [relatório de homologação](docs/validation-report.md), a [arquitetura](docs/architecture.md) e o [procedimento de operação](docs/release-management.md).

## Migração para 7.x

Troque o argumento de entrada `capacity_type` por `capacity_model` no bloco module. Os valores ON_DEMAND e SPOT continuam aceitos. O campo de saída `cluster.capacity_type` conserva o nome para leitores do contrato.
