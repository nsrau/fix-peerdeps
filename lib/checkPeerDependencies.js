const fs = require('fs');
const path = require('path');

// Load a package.json file
function loadPackageJson(packageJsonPath) {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

// Save the modified package.json file
function savePackageJson(packageJsonPath, data) {
  fs.writeFileSync(packageJsonPath, JSON.stringify(data, null, 2));
}

// Get installed libraries from node_modules
function getInstalledLibraries(dir) {
  const nodeModulesPath = path.resolve(dir, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.error(`Error: node_modules folder not found in ${dir}.`);
    process.exit(1);
  }
  return fs.readdirSync(nodeModulesPath).filter(pkg => {
    const pkgPath = path.join(nodeModulesPath, pkg, 'package.json');
    return fs.existsSync(pkgPath);
  });
}

// Extract peerDependencies from a library's package.json
function getPeerDependencies(libPackageJson) {
  return libPackageJson.peerDependencies || {};
}

// Normalize version strings (replacing `>=` with `^`)
function normalizeVersion(version) {
  return version.replace(/^>=/, '^');
}

// Check peer dependencies in a specific directory
function checkPeerDependencies(dir) {
  console.log(`Checking peer dependencies in ${dir}...`);

  const packageJsonPath = path.join(dir, 'package.json');
  const mainPackageJson = loadPackageJson(packageJsonPath);

  // Ensure dependencies and devDependencies are defined
  mainPackageJson.dependencies = mainPackageJson.dependencies || {};
  mainPackageJson.devDependencies = mainPackageJson.devDependencies || {};

  const installedLibraries = getInstalledLibraries(dir);
  let missingPeerDeps = {};

  installedLibraries.forEach(lib => {
    const libPackageJsonPath = path.join(dir, 'node_modules', lib, 'package.json');
    const libPackageJson = loadPackageJson(libPackageJsonPath);
    const peerDeps = getPeerDependencies(libPackageJson);

    Object.keys(peerDeps).forEach(peerDep => {
      const version = normalizeVersion(peerDeps[peerDep]);

      // Check if peerDep is missing in dependencies or devDependencies
      if (!mainPackageJson.dependencies[peerDep] && !mainPackageJson.devDependencies[peerDep]) {
        missingPeerDeps[peerDep] = version;
      }
    });
  });

  if (Object.keys(missingPeerDeps).length > 0) {
    console.log('Missing peer dependencies found:');
    Object.entries(missingPeerDeps).forEach(([dep, version]) => {
      console.log(`  ${dep}@${version}`);
    });
    Object.assign(mainPackageJson.dependencies, missingPeerDeps);
    savePackageJson(packageJsonPath, mainPackageJson);
    console.log('Added missing peer dependencies to package.json.');
  } else {
    console.log('All peer dependencies are already satisfied.');
  }
}

// Load pnpm-workspace.yaml
function loadPnpmWorkspaceYaml(yamlPath) {
  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  const lines = yamlContent.split('\n');
  const packages = [];

  // Parse the YAML manually
  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('-')) {
      const packagePath = trimmedLine.substring(1).trim();
      packages.push(packagePath);
    }
  });

  return packages;
}

// Recursively find workspace directories based on package manager configuration
function findWorkspaceDirectories(rootDir) {
  const validWorkspaces = [];

  // Check for pnpm workspace file
  const pnpmWorkspacePath = path.join(rootDir, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWorkspacePath)) {
    const pnpmPackages = loadPnpmWorkspaceYaml(pnpmWorkspacePath);
    pnpmPackages.forEach(packagePattern => {
      const packagePaths = path.resolve(rootDir, packagePattern);
      validWorkspaces.push(packagePaths);
    });
  }

  // Check for npm/yarn workspaces
  const packageJsonPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = loadPackageJson(packageJsonPath);
    if (packageJson.workspaces) {
      const workspacePaths = Array.isArray(packageJson.workspaces)
        ? packageJson.workspaces
        : [packageJson.workspaces];

      workspacePaths.forEach(workspacePath => {
        const fullPath = path.resolve(rootDir, workspacePath);
        validWorkspaces.push(fullPath);
      });
    }
  }

  return validWorkspaces;
}

// Main function
function main() {
  const args = process.argv.slice(2); // Get command line arguments
  const isWorkspace = args.includes('-w'); // Check if `-w` flag is passed

  if (isWorkspace) {
    console.log('Workspace mode enabled. Checking subdirectories...');
    const workspaceDirs = findWorkspaceDirectories(process.cwd());

    if(workspaceDirs.length === 0) {
      console.error('Error: No workspaces found.');
      process.exit(1);
    }

    workspaceDirs.forEach(dir => {
      checkPeerDependencies(dir); // Check dependencies in each workspace
    });
  } else {
    checkPeerDependencies(process.cwd()); // Check dependencies in the main directory
  }
}

module.exports = main;
