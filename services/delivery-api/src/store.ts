import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * One JSON document on disk. Writes go to a temporary file first and are
 * renamed into place, so a crash never leaves half a document behind.
 */
export class JsonStore<T> {
  private readonly file: string;
  private readonly seed: () => T;
  private document: T;

  constructor(file: string, seed: () => T) {
    this.file = file;
    this.seed = seed;
    this.document = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : this.persist(seed());
  }

  read(): T {
    return this.document;
  }

  write(next: T): T {
    return this.persist(next);
  }

  reset(): T {
    return this.persist(this.seed());
  }

  private persist(next: T): T {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(next));
    renameSync(temporary, this.file);
    this.document = next;
    return next;
  }
}
