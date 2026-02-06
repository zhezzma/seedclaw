import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/ is one level deep. Root is up one level.
const rootDir = path.resolve(__dirname, '..');

const openClawRepoDir = path.join(rootDir, 'openclaw');
const srcOpenClawDir = path.join(rootDir, 'src', 'openclaw');

const excludedFiles = [
    "src/openclaw/ui/src/ui/app-chat.ts"
].map(p => path.normalize(p));

async function main() {
    console.log(`Root Dir: ${rootDir}`);
    console.log(`Repo Dir: ${openClawRepoDir}`);
    console.log(`Target Dir: ${srcOpenClawDir}`);

    // 1. Git Pull
    console.log('--- Pulling latest changes in openclaw ---');
    try {
        // Ensure the directory exists
        if (!fs.existsSync(openClawRepoDir)) {
             console.error(`OpenClaw repo directory not found at: ${openClawRepoDir}`);
             process.exit(1);
        }
        
        execSync('git pull', { cwd: openClawRepoDir, stdio: 'inherit' });
    } catch (e) {
        console.error('Git pull failed:', e.message);
        // We'll proceed even if git pull fails, in case user works offline, 
        // but typically better to stop. For now, let's warn and continue or exit? 
        // User instruction: "1. Use git pull..." implies strictly pulling.
        // Assuming we should stop if critical.
        // But maybe openclaw is not a git repo in some envs? 
        // Let's allow it to continue with error logged, or exit? 
        // I will exit to be safe as per "1. use git pull".
        process.exit(1);
    }

    // 2. Walk src/openclaw
    console.log('--- Scanning files in src/openclaw ---');
    const filesToSync = [];
    
    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
                walk(itemPath);
            } else {
                filesToSync.push(itemPath);
            }
        }
    }

    if (fs.existsSync(srcOpenClawDir)) {
         walk(srcOpenClawDir);
    } else {
        console.error(`Target directory does not exist: ${srcOpenClawDir}`);
        process.exit(1);
    }

    // 3 & 4. Filter and Copy
    console.log(`Found ${filesToSync.length} files in target. Syncing...`);
    
    let syncedCount = 0;
    let skippedCount = 0;
    
    for (const destPath of filesToSync) {
        // Get path relative to root to check exclusions
        const relToRoot = path.relative(rootDir, destPath);
        
        // Check exclusion
        if (excludedFiles.includes(relToRoot)) {
            console.log(`[Skipped] (Excluded): ${relToRoot}`);
            skippedCount++;
            continue;
        }

        // Determine source path
        // destPath is .../src/openclaw/path/to/file
        // We want .../openclaw/path/to/file
        // So we get relative path from srcOpenClawDir
        const relToSrcOpenClaw = path.relative(srcOpenClawDir, destPath);
        const sourcePath = path.join(openClawRepoDir, relToSrcOpenClaw);

        if (fs.existsSync(sourcePath)) {
            try {
                // Read source and dest to compare? 
                // User said "cover these files", implies overwrite.
                // We'll just overwrite.
                const srcContent = fs.readFileSync(sourcePath);
                const destContent = fs.readFileSync(destPath);
                
                if (!srcContent.equals(destContent)) {
                    fs.copyFileSync(sourcePath, destPath);
                    console.log(`[Synced]: ${relToSrcOpenClaw}`);
                    syncedCount++;
                }
            } catch (err) {
                console.error(`[Error] Failed to sync ${relToSrcOpenClaw}: ${err.message}`);
            }
        } else {
            console.warn(`[Warning] Source file not found: ${sourcePath}`);
        }
    }

    console.log(`--- Sync Complete ---`);
    console.log(`Total Scanned: ${filesToSync.length}`);
    console.log(`Synced (Changed): ${syncedCount}`);
    console.log(`Skipped: ${skippedCount}`);
}

main().catch(err => console.error(err));