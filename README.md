# Fix Peer Dependencies

A Node.js script to automatically check and add missing peer dependencies for your project. 
This script works for both single-package projects and monorepo workspaces.

## Features

- Automatically checks for missing peer dependencies after adding a new library.
- Can be run manually via a custom command to check all dependencies.
- Supports workspace mode (monorepos) using `-ws` flag.
- Zero external dependencies.

## Installation

Install the package globally to use the `fix-peerds` command:

```bash
npm install -g fix-peerds
```

## Usage

### Automatically check after adding a new library

After adding a new library with `pnpm add <library>`, the script will automatically verify if the 
new library has peer dependencies, and if any are missing from your `package.json`, they will be added.
```json
{
  "scripts": {
    "postinstall": "fix-peerds"
  }
}
```

### Manually check peer dependencies

You can manually run the peer dependency check with:

```bash
fix-peerds
```

The script will analyze the installed libraries and check if the `peerDependencies` of each one 
are listed in your project's `package.json`. If any are missing, it will automatically add them.

### Workspace mode (Monorepos)

If you are working in a monorepo (multi-package workspace), you can check peer dependencies across all sub-packages:

```bash
fix-peerds -ws
```

This will scan the workspace configuration (such as `pnpm-workspace.yaml` or `package.json` with 
`workspaces` defined) and run the peer dependency check in each sub-package.

## Example

```bash
pnpm add some-library
# Automatically checks for peer dependencies

fix-peerds
# Manually checks for peer dependencies

fix-peerds -ws
# Checks peer dependencies across workspace projects
```

## License

MIT License
