# Changelog

## [7.2.0](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/v7.1.1...v7.2.0) (2026-11-27)


### Funcionalidades

* add optional maintenance_window cluster metadata ([#27](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/27)) ([c2759e9](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/c2759e960b728d04886ab5ae899ed6fb357e67a6))

## [7.1.1](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/v7.1.0...v7.1.1) (2026-11-27)


### Correções

* normalize whitespace in addon metadata maps ([#26](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/26)) ([992092d](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/992092db2791e7c7141fead8707a31bf759c56c8))

## [7.1.0](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/v7.0.1...v7.1.0) (2026-11-26)


### Funcionalidades

* accept the OCI amd64 architecture alias ([#23](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/23)) ([e4cb30f](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/e4cb30f0a43e597266ede0d650ff7c8140ee017d))

## [7.0.1](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/v7.0.0...v7.0.1) (2026-11-26)


### Correções

* accept SemVer prerelease identifiers in Bottlerocket versions ([#21](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/21)) ([0c99a7c](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/0c99a7cc397bf6419c75461e1985386805729ac3))
* preserve SemVer build metadata in Bottlerocket versions ([#19](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/19)) ([1566b4b](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/1566b4b09c78cf4c7e2bb26bc82393b9c13bc6cb))

## [7.0.0](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/v6.3.0...v7.0.0) (2026-11-26)


### ⚠ BREAKING CHANGES

* Consumers must rename the capacity_type module argument to capacity_model.

### Correções

* accept DNS cluster labels starting with a digit ([#16](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/16)) ([80150db](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/80150dbf01c7eef29587b11a69b5c1a5485bd082))
* reject ambiguous zero-padded cluster versions ([#10](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/10)) ([3818cfa](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/3818cfa2a957cc85d26749ffc22ff55fb20a2f89))


### Funcionalidades

* add optional addon ownership metadata ([#11](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/11)) ([91a36e3](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/91a36e3cb1e6f7c4a8c623abd10fdcbe39b62d17))
* rename the capacity input to capacity_model ([#14](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/14)) ([466b5c0](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/466b5c099205fa29140cf43529d9a0467e03885f))

## [6.3.0](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/v6.2.1...v6.3.0) (2026-11-26)


### Funcionalidades

* expose optional addon channels ([#7](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/7)) ([9bf8048](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/9bf8048bc340682cbb5edcd20ee12fe3de58ea7f))

## [6.2.1](https://github.com/TomasAlric/terraform-module-release-please-poc/compare/v6.2.0...v6.2.1) (2026-11-26)


### Correções

* reject a trailing hyphen in DNS cluster names ([#2](https://github.com/TomasAlric/terraform-module-release-please-poc/issues/2)) ([deea7ea](https://github.com/TomasAlric/terraform-module-release-please-poc/commit/deea7eaadc311cb353d2ccc9c81d2dbebc6aa63c))

## 6.2.0

Baseline do módulo fictício. O contrato descreve versões, capacidade, arquitetura, addons e tags de um cluster.
