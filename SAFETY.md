# Privacy & Software Safety

Last updated: October 27, 2026

## Scope and requirements

This repository supplies a ComfyUI custom node. Review its source and documentation before adding it to your ComfyUI installation.

This guidance is not a certification or guarantee of safety. Website hosting and embedded-service disclosures are on the [website privacy page](https://rebeltortuga.github.io/privacy-software-safety.html); they do not describe this project's software behavior.

## Downloads and verification

Use [this repository’s releases](https://github.com/RebelTortuga/comfyui-clean-slate/releases) and source code. Other copies may be outdated or modified. Consult the release notes for your version. When published checksums are available, compare them before use; a matching checksum identifies the expected file but does not establish that it is harmless. Do not assume releases are signed or independently audited.

## Dependencies, prompts, and images

Review every required custom node, model, and upstream dependency before installation or updates. Local generation does not guarantee that all dependencies operate offline. Prompts, source images, output files, history, and workflow metadata can contain personal information. Review saved outputs and workflows before sharing them.

## Backups and recovery

Preserve your workflows, source images, desired outputs, and configuration before changes. Changes to custom nodes or models can affect existing workflows. Keep copies of the versions you need for recovery.

## Data handling

Consult the source and project documentation for file access, network activity, and stored data. Third-party nodes and applications have separate data practices. Review prompt history, output metadata, logs, and screenshots before sharing them. Do not submit passwords, tokens, private backups, or complete browser profiles in public issues.

## Removal

Close ComfyUI before removing this custom node’s installation folder, then restart ComfyUI. Workflows that reference its nodes may need editing. Preserve any desired files first; removing a node does not remove all third-party dependencies or saved outputs.

If the documentation does not explain a relevant storage path or removal step, ask in Issues without sharing sensitive files.

## Security warnings and reporting

Keep security software current. If a file produces an unexpected warning, pause. Record the filename, version, source URL, exact detection, and security-product version. Do not assume every detection is a false positive, and do not disable protection merely to run a tool.

Report ordinary bugs through [Issues](https://github.com/RebelTortuga/comfyui-clean-slate/issues). Follow [SECURITY.md](SECURITY.md) for sensitive vulnerabilities.

## License and third-party terms

Read [LICENSE](LICENSE) and relevant upstream terms. Optional donations do not alter those terms. Compatibility and results vary by system.

