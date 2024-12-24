import deepmerge from 'deepmerge';
import { P2P } from '@shardus/types';
import { reversed } from '../utils';
import * as CycleCreator from './CycleCreator';
export function parse(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    const changes = CycleCreator.submodules.map((submodule) => submodule.parseRecord(record));
    const mergedChange = deepmerge.all<P2P.CycleParserTypes.Change>(changes);
    return mergedChange;
}
export class ChangeSquasher {
    final: P2P.CycleParserTypes.Change;
    removedIds: Set<P2P.NodeListTypes.Node['id']>;
    seenUpdates: Map<P2P.NodeListTypes.Update['id'], P2P.NodeListTypes.Update>;
    addedIds: Set<P2P.NodeListTypes.Node['id']>;
    constructor() {
        this.final = {
            added: [],
            removed: [],
            updated: [],
        };
        this.addedIds = new Set();
        this.removedIds = new Set();
        this.seenUpdates = new Map();
    }
    addChange(change: P2P.CycleParserTypes.Change): void {
        for (const id of change.removed) {
            if (this.removedIds.has(id))
                continue;
            this.removedIds.add(id);
        }
        for (const update of change.updated) {
            if (this.removedIds.has(update.id))
                continue;
            this.seenUpdates.set(update.id, update);
        }
        for (const joinedConsensor of reversed(change.added)) {
            if (this.addedIds.has(joinedConsensor.id))
                continue;
            if (this.removedIds.has(joinedConsensor.id)) {
                continue;
            }
            const update = this.seenUpdates.get(joinedConsensor.id);
            if (update) {
                this.final.updated.unshift(update);
                this.seenUpdates.delete(joinedConsensor.id);
            }
            this.final.added.unshift(joinedConsensor);
            this.addedIds.add(joinedConsensor.id);
        }
    }
}