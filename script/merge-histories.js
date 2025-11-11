import fs from 'fs';
import { getHistoryFilePaths } from './branch-utils.js';
import { execSync } from 'child_process';

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading or parsing JSON file: ${filePath}`, error);
    return [];
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing to JSON file: ${filePath}`, error);
  }
}

function mergeHistories(sourceBranch, targetBranch) {
  console.log(`Merging history from '${sourceBranch}' into '${targetBranch}'...`);

  const sourcePaths = getHistoryFilePaths(sourceBranch);
  const targetPaths = getHistoryFilePaths(targetBranch);

  // --- COMMIT HISTORY MERGE ---
  const sourceCommits = readJsonFile(sourcePaths.commitHistory);
  const targetCommits = readJsonFile(targetPaths.commitHistory);

  // Resolve the final "HEAD" commit from the source branch before merging
  const headIndex = sourceCommits.findIndex(c => c.sha === 'HEAD');
  if (headIndex > -1) {
    try {
      console.log(`Resolving final commit for branch '${sourceBranch}'...`);
      const realSha = execSync(`git rev-parse ${sourceBranch}`, { encoding: 'utf8' }).trim();
      const headCommit = sourceCommits[headIndex];
      headCommit.sha = realSha;
      if (headCommit.commit.url) {
        const baseUrl = headCommit.commit.url.split('/commit/')[0];
        headCommit.commit.url = `${baseUrl}/commit/${realSha}`;
      }
      console.log(`Resolved final commit to SHA: ${realSha}`);
    } catch (error) {
      console.error(`Could not resolve SHA for branch '${sourceBranch}'. Skipping HEAD commit.`, error);
      // If resolution fails, remove the HEAD commit to avoid merging it
      sourceCommits.splice(headIndex, 1);
    }
  }

  const targetCommitShas = new Set(targetCommits.map(c => c.sha));
  let newCommits = 0;
  sourceCommits.forEach(sourceCommit => {
    if (sourceCommit.sha && !targetCommitShas.has(sourceCommit.sha)) {
      targetCommits.push(sourceCommit);
      newCommits++;
    }
  });

  targetCommits.sort((a, b) => new Date(a.commit.date) - new Date(b.commit.date));
  writeJsonFile(targetPaths.commitHistory, targetCommits);
  console.log(`Merged ${newCommits} new commits into '${targetPaths.commitHistory}'.`);

  // --- TDD LOG MERGE ---
  const sourceTddLog = readJsonFile(sourcePaths.tddLog);
  const targetTddLog = readJsonFile(targetPaths.tddLog);

  // Resolve the final "HEAD" commit in the TDD log as well
  const tddHeadIndex = sourceTddLog.findIndex(c => c.commitId === 'HEAD');
  if (tddHeadIndex > -1) {
    try {
      const realSha = execSync(`git rev-parse ${sourceBranch}`, { encoding: 'utf8' }).trim();
      sourceTddLog[tddHeadIndex].commitId = realSha;
    } catch (error) {
      console.error(`Could not resolve SHA for branch '${sourceBranch}' in TDD log. Skipping HEAD entry.`);
      sourceTddLog.splice(tddHeadIndex, 1);
    }
  }

  const targetTddEntries = new Set(targetTddLog.map(e => e.commitId ? e.commitId : `${e.timestamp}-${e.testId}`));
  let newTddEntries = 0;
  sourceTddLog.forEach(sourceEntry => {
    const uniqueId = sourceEntry.commitId ? sourceEntry.commitId : `${sourceEntry.timestamp}-${sourceEntry.testId}`;
    if (!targetTddEntries.has(uniqueId)) {
      targetTddLog.push(sourceEntry);
      newTddEntries++;
    }
  });

  targetTddLog.sort((a, b) => (a.commitTimestamp || a.timestamp) - (b.commitTimestamp || b.timestamp));
  writeJsonFile(targetPaths.tddLog, targetTddLog);
  console.log(`Merged ${newTddEntries} new TDD log entries into '${targetPaths.tddLog}'.`);

  // --- CLEANUP ---
  try {
    console.log(`Cleaning up history files for branch '${sourceBranch}'...`);
    if (fs.existsSync(sourcePaths.commitHistory)) {
      fs.unlinkSync(sourcePaths.commitHistory);
    }
    if (fs.existsSync(sourcePaths.tddLog)) {
      fs.unlinkSync(sourcePaths.tddLog);
    }
    console.log('Cleanup complete.');
  } catch (error) {
    console.error(`Error cleaning up files for branch '${sourceBranch}'. Please remove them manually.`, error);
  }
}

// --- Main execution ---
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node script/merge-histories.js <source-branch> <target-branch>');
  process.exit(1);
}

const [sourceBranch, targetBranch] = args;
mergeHistories(sourceBranch, targetBranch);
