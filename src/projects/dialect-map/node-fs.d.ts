// Just enough of node:fs for the tests and the preview script (no @types/node here).
declare module 'node:fs' {
  const fs: {
    existsSync(path: string): boolean;
    readdirSync(path: string): string[];
    readFileSync(path: string, encoding: 'utf8'): string;
    writeFileSync(path: string, data: string): void;
    mkdirSync(path: string, options: { recursive: boolean }): void;
  };
  export default fs;
}
