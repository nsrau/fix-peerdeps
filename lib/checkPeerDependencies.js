const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load a package.json file
function loadPackageJson(packageJsonPath) {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
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

// Normalize version strings (removing spaces and replacing `>=` with `^`)
function normalizeVersion(version) {
  return version.replace(/^>=/, '').trim().replace(/\s+/g, '').replace(/\^/g, '');
}

// Check if a version is a valid semver
function isValidSemver(version) {
  const semverRegex = /^(\d+\.)?(\d+\.)?(\*|\d+)(-[a-zA-Z0-9-.]+)?$/;
  return semverRegex.test(version);
}

// Get the highest valid version from a version string
function getValidVersion(version) {
  const versions = normalizeVersion(version).split('||').map(v => normalizeVersion(v.trim()));
  const validVersions = versions.filter(v => isValidSemver(v));

  if (validVersions.length === 0) {
    return 'latest'; // Default to latest if no valid version found
  }

  // Sort valid versions and return the highest one
  validVersions.sort((a, b) => {
    const aSemver = a.replace(/[^0-9.]/g, '').split('.').map(Number);
    const bSemver = b.replace(/[^0-9.]/g, '').split('.').map(Number);

    // Compare major, minor, and patch versions
    for (let i = 0; i < Math.max(aSemver.length, bSemver.length); i++) {
      const aVer = aSemver[i] || 0; // Default to 0 if undefined
      const bVer = bSemver[i] || 0; // Default to 0 if undefined
      if (aVer !== bVer) {
        return aVer - bVer; // Ascending order
      }
    }
    return 0; // They are equal
  });

  return validVersions[validVersions.length - 1]; // Return the highest version
}

// Check peer dependencies in a specific directory
function checkPeerDependencies(dir, extraArgs = '') {
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
      const version = getValidVersion(peerDeps[peerDep]);

      // Check if peerDep is missing in dependencies or devDependencies
      if (!mainPackageJson.dependencies[peerDep] && !mainPackageJson.devDependencies[peerDep]) {
        missingPeerDeps[peerDep] = version;
      }
    });
  });

  if (Object.keys(missingPeerDeps).length > 0) {
    console.log('Missing peer dependencies found:');
    Object.entries(missingPeerDeps).forEach(([dep, version]) => {
      console.log(`  ${dep}@^${version}`);
    });
    installMissingPeerDependencies(missingPeerDeps, dir, extraArgs);
  } else {
    console.log('All peer dependencies are already satisfied.');
  }
}

// Install missing peer dependencies based on package manager
function installMissingPeerDependencies(missingPeerDeps, dir, extraArgs) {
  const packageManager = detectPackageManager();
  const dependencies = Object.entries(missingPeerDeps)
    .map(([dep, version]) => `${dep}@^${version}`)
    .join(' ');

  console.log(`Installing missing peer dependencies using ${packageManager}...`);

  const commandAdd = packageManager === 'npm' ? 'install' : 'add';

  const installCommand = `${packageManager} ${commandAdd} ${dependencies} ${extraArgs}`;

  console.log(`Running command: ${installCommand}`);

  try {
    execSync(installCommand, { cwd: dir, stdio: 'inherit' });
    console.log('Installed missing peer dependencies successfully.');
  } catch (error) {
    console.error(`Failed to install dependencies: ${error.message}`);
  }
}

// Detect the package manager based on the presence of lock files
function detectPackageManager() {
  if (fs.existsSync(path.join(process.cwd(), 'yarn.lock'))) {
    return 'yarn';
  } else if (fs.existsSync(path.join(process.cwd(), 'package-lock.json'))) {
    return 'npm';
  } else if (fs.existsSync(path.join(process.cwd(), 'pnpm-lock.yaml'))) {
    return 'pnpm';
  } else {
    console.error('No package manager lock file found. Please ensure you are using npm, yarn, or pnpm.');
    process.exit(1);
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
  const isWorkspace = args.includes('-ws'); // Check if `-ws` flag is passed
  const wsIndex = args.indexOf('-ws'); // Get the index of `-ws` flag
  let extraArgs = args.slice(wsIndex + 1).join(' '); // Capture all arguments after `-ws`
  if (isWorkspace) {
    console.log('Workspace mode enabled. Checking subdirectories...');
    const workspaceDirs = findWorkspaceDirectories(process.cwd());

    if (workspaceDirs.length === 0) {
      console.error('Error: No workspaces found.');
      process.exit(1);
    }
    
    workspaceDirs.forEach(dir => {
      checkPeerDependencies(dir,extraArgs); // Check dependencies in each workspace
    });
  } else {
    checkPeerDependencies(process.cwd(),extraArgs); // Check dependencies in the main directory
  }
}

module.exports = main;
