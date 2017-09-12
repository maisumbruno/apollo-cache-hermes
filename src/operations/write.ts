import { CacheContext } from '../context';
import { GraphSnapshot } from '../GraphSnapshot';
import { JsonObject } from '../primitive';
import { Query } from '../schema';

import { EditedSnapshot, SnapshotEditor } from './SnapshotEditor';

/**
 * Merges a payload with an existing graph snapshot, generating a new one.
 *
 * Performs the minimal set of edits to generate new immutable versions of each
 * node, while preserving immutability of the parent snapshot.
 */
export function write(context: CacheContext, snapshot: GraphSnapshot, query: Query, payload: JsonObject): EditedSnapshot {
  // We _could_ go purely functional with the editor, but it's honestly pretty
  // convenient to follow the builder function instead - it'd end up passing
  // around a context object anyway.
  const editor = new SnapshotEditor(context, snapshot);
  editor.mergePayload(query, payload);
  const commitedSnapshot = editor.commit();
  context.previousWrite = {
    oldSnapshotValueBeforeWrite: snapshot._values,
    writeSnapshotValue: commitedSnapshot.snapshot._values,
    writePayload: payload,
    writeQuery: query };
  return commitedSnapshot;
}
