import fs from 'fs';
import path from 'path';

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach((file) => {
    if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
      if (['node_modules', 'dist', 'build', '.next', '.git'].includes(file)) return;
      arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
    } else {
      if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) {
        arrayOfFiles.push(path.join(dirPath, file));
      }
    }
  });

  return arrayOfFiles;
}

const files = getAllFiles(process.cwd());

let hasError = false;
// Also match single or double quotes, dynamic imports, etc.
const internalImportRegex = /(?:from\s+|import\s*\(?\s*)['"]@workspace\/[^\/"]+\/src[^'"]*['"]/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const matches = [...content.matchAll(internalImportRegex)];
  
  if (matches.length > 0) {
    for (const match of matches) {
      console.error(`Error in ${file}:\n  Invalid internal import found: ${match[0]}`);
      console.error(`  -> You must import from the exported entry points defined in the package.json 'exports' field, rather than diving into /src/.\n`);
      hasError = true;
    }
  }
}

if (hasError) {
  console.error('Build failed due to invalid workspace package imports.');
  process.exit(1);
} else {
  console.log('✅ Workspace import validation passed.');
}
