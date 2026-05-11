import { readFile, writeFile } from 'node:fs/promises';

const START_TAG = '<!-- repowiki:start -->';
const END_TAG = '<!-- repowiki:end -->';

export class HarnessWriter {
  static async write(filePath: string, innerContent: string): Promise<void> {
    const wrapped = `${START_TAG}\n${innerContent}\n${END_TAG}`;

    let existing: string | null = null;
    try {
      existing = await readFile(filePath, 'utf-8');
    } catch {
      // file does not exist
    }

    if (existing === null) {
      await writeFile(filePath, wrapped, 'utf-8');
      return;
    }

    const startIdx = existing.indexOf(START_TAG);
    const endIdx = existing.indexOf(END_TAG, startIdx);

    if (startIdx !== -1 && endIdx !== -1) {
      const before = existing.slice(0, startIdx);
      const after = existing.slice(endIdx + END_TAG.length);
      await writeFile(filePath, `${before}${wrapped}${after}`, 'utf-8');
      return;
    }

    if (startIdx !== -1 && endIdx === -1) {
      process.stderr.write(`[warn] Unclosed repowiki block found in \`${filePath}\`; removing orphaned start tag and appending new block\n`);
      const cleaned = existing.replace(new RegExp(`.*${escapeRegex(START_TAG)}.*\n?`, ''), '');
      await writeFile(filePath, `${cleaned}\n\n${wrapped}`, 'utf-8');
      return;
    }

    await writeFile(filePath, `${existing}\n\n${wrapped}`, 'utf-8');
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
