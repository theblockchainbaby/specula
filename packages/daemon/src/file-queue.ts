/**
 * Per-file serialization. The transaction lifecycle requires that two
 * transactions never write the same file concurrently (`specs/protocol.md`).
 * Work on different files is free to overlap.
 */
export class FileQueue {
  readonly #tails = new Map<string, Promise<unknown>>();

  /**
   * Run `work` after all work previously queued for `file` has settled.
   * The returned promise resolves/rejects with `work`'s own outcome; a
   * rejection does not break the chain for later work on the same file.
   */
  run<T>(file: string, work: () => Promise<T>): Promise<T> {
    const prior = this.#tails.get(file) ?? Promise.resolve();
    const result = prior.then(work, work);
    this.#tails.set(
      file,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }
}
