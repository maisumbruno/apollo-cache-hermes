import * as _ from 'lodash';

import { CacheContext } from '../../../../src/context';
import { GraphSnapshot } from '../../../../src/GraphSnapshot';
import { ParameterizedValueSnapshot } from '../../../../src/nodes';
import { nodeIdForParameterizedValue } from '../../../../src/operations/SnapshotEditor';
import { write } from '../../../../src/operations/write';
import { NodeId, Query, StaticNodeId } from '../../../../src/schema';
import { query, strictConfig } from '../../../helpers';

const { QueryRoot: QueryRootId } = StaticNodeId;

// These are really more like integration tests, given the underlying machinery.
//
// It just isn't very fruitful to unit test the individual steps of the write
// workflow in isolation, given the contextual state that must be passed around.
describe(`operations.write`, () => {

  const context = new CacheContext(strictConfig);
  const empty = new GraphSnapshot();
  const viewerQuery = query(`{
    viewer {
      id
      name
    }
  }`);

  describe(`parameterized fields`, () => {

    describe(`creating a new top level field`, () => {

      let snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($id: ID!) {
          foo(id: $id, withExtra: true) {
            name extra
          }
        }`, { id: 1 });

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo'], { id: 1, withExtra: true });

        const result = write(context, empty, parameterizedQuery, {
          foo: {
            name: 'Foo',
            extra: false,
          },
        });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`writes a node for the field`, () => {
        expect(snapshot.get(parameterizedId)).to.deep.eq({ name: 'Foo', extra: false });
      });

      it(`creates an outgoing reference from the field's container`, () => {
        const queryRoot = snapshot.getNodeSnapshot(QueryRootId)!;
        expect(queryRoot.outbound).to.deep.eq([{ id: parameterizedId, path: ['foo'] }]);
      });

      it(`creates an inbound reference to the field's container`, () => {
        const values = snapshot.getNodeSnapshot(parameterizedId)!;
        expect(values.inbound).to.deep.eq([{ id: QueryRootId, path: ['foo'] }]);
      });

      it(`does not expose the parameterized field directly from its container`, () => {
        expect(_.get(snapshot.get(QueryRootId), 'foo')).to.eq(undefined);
      });

      it(`marks only the new field as edited`, () => {
        expect(Array.from(editedNodeIds)).to.have.members([parameterizedId]);
      });

      it(`emits a ParameterizedValueSnapshot`, () => {
        expect(snapshot.getNodeSnapshot(parameterizedId)).to.be.an.instanceOf(ParameterizedValueSnapshot);
      });

    });

    describe(`creating a nested field`, () => {

      let snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($id: ID!) {
          foo {
            bar {
              baz(id: $id, withExtra: true) {
                name extra
              }
            }
          }
        }`, { id: 1 });

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo', 'bar', 'baz'], { id: 1, withExtra: true });

        const result = write(context, empty, parameterizedQuery, {
          foo: {
            bar: {
              baz: {
                name: 'Foo',
                extra: false,
              },
            },
          },
        });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`writes a node for the field`, () => {
        expect(snapshot.get(parameterizedId)).to.deep.eq({ name: 'Foo', extra: false });
      });

      it(`creates an outgoing reference from the field's container`, () => {
        const queryRoot = snapshot.getNodeSnapshot(QueryRootId)!;
        expect(queryRoot.outbound).to.deep.eq([{ id: parameterizedId, path: ['foo', 'bar', 'baz'] }]);
      });

      it(`creates an inbound reference to the field's container`, () => {
        const values = snapshot.getNodeSnapshot(parameterizedId)!;
        expect(values.inbound).to.deep.eq([{ id: QueryRootId, path: ['foo', 'bar', 'baz'] }]);
      });

      it(`does not expose the parameterized field directly from its container`, () => {
        expect(_.get(snapshot.get(QueryRootId), 'foo.bar.baz')).to.eq(undefined);
      });

      it(`marks only the new field as edited`, () => {
        expect(Array.from(editedNodeIds)).to.have.members([parameterizedId]);
      });

      it(`emits a ParameterizedValueSnapshot`, () => {
        expect(snapshot.getNodeSnapshot(parameterizedId)).to.be.an.instanceOf(ParameterizedValueSnapshot);
      });

    });

    describe(`updating a field`, () => {

      let baseline: GraphSnapshot, snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($id: ID!) {
          foo(id: $id, withExtra: true) {
            name extra
          }
        }`, { id: 1 });

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo'], { id: 1, withExtra: true });

        const baselineResult = write(context, empty, parameterizedQuery, {
          foo: {
            name: 'Foo',
            extra: false,
          },
        });
        baseline = baselineResult.snapshot;

        const result = write(context, baseline, parameterizedQuery, {
          foo: {
            name: 'Foo Bar',
          },
        });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`doesn't edit the original snapshot`, () => {
        expect(_.get(baseline.get(QueryRootId), 'foo')).to.eq(undefined);
        expect(baseline.get(parameterizedId)).to.deep.eq({ name: 'Foo', extra: false });
        expect(baseline.get(parameterizedId)).to.not.eq(snapshot.get(parameterizedId));
      });

      it(`updates the node for the field`, () => {
        expect(snapshot.get(parameterizedId)).to.deep.eq({ name: 'Foo Bar', extra: false });
      });

      it(`marks only the field as edited`, () => {
        expect(Array.from(editedNodeIds)).to.have.members([parameterizedId]);
      });

      it(`emits a ParameterizedValueSnapshot`, () => {
        expect(snapshot.getNodeSnapshot(parameterizedId)).to.be.an.instanceOf(ParameterizedValueSnapshot);
      });

    });

    describe(`new fields with a direct reference`, () => {

      let snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($id: ID!) {
          foo(id: $id, withExtra: true) {
            id name extra
          }
        }`, { id: 1 });

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo'], { id: 1, withExtra: true });

        const result = write(context, empty, parameterizedQuery, {
          foo: {
            id: 1,
            name: 'Foo',
            extra: false,
          },
        });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`writes a node for the new entity`, () => {
        expect(snapshot.get('1')).to.deep.eq({ id: 1, name: 'Foo', extra: false });
      });

      it(`writes a node for the field that points to the entity's value`, () => {
        expect(snapshot.get(parameterizedId)).to.eq(snapshot.get('1'));
      });

      it(`creates an outgoing reference from the field's container`, () => {
        const queryRoot = snapshot.getNodeSnapshot(QueryRootId)!;
        expect(queryRoot.outbound).to.deep.eq([{ id: parameterizedId, path: ['foo'] }]);
      });

      it(`creates an inbound reference to the field's container`, () => {
        const values = snapshot.getNodeSnapshot(parameterizedId)!;
        expect(values.inbound).to.deep.eq([{ id: QueryRootId, path: ['foo'] }]);
      });

      it(`creates an outgoing reference from the parameterized field to the referenced entity`, () => {
        const values = snapshot.getNodeSnapshot(parameterizedId)!;
        expect(values.outbound).to.deep.eq([{ id: '1', path: [] }]);
      });

      it(`creates an incoming reference from the parameterized field to the referenced entity`, () => {
        const entity = snapshot.getNodeSnapshot('1')!;
        expect(entity.inbound).to.deep.eq([{ id: parameterizedId, path: [] }]);
      });

      it(`does not expose the parameterized field directly from its container`, () => {
        expect(_.get(snapshot.get(QueryRootId), 'foo')).to.eq(undefined);
      });

      it(`marks the new field and entity as edited`, () => {
        expect(Array.from(editedNodeIds)).to.have.members([parameterizedId, '1']);
      });

    });

    describe(`updating fields with an array of direct references`, () => {

      let baseline: GraphSnapshot, snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($id: ID!) {
          foo(id: $id, withExtra: true) {
            id name extra
          }
        }`, { id: 1 });

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo'], { id: 1, withExtra: true });

        const baselineResult = write(context, empty, parameterizedQuery, {
          foo: [
            { id: 1, name: 'Foo', extra: false },
            { id: 2, name: 'Bar', extra: true },
            { id: 3, name: 'Baz', extra: false },
          ],
        });
        baseline = baselineResult.snapshot;

        const result = write(context, baseline, parameterizedQuery, {
          foo: [
            { extra: true },
            { extra: false },
            { extra: true },
          ],
        });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`writes nodes for each entity`, () => {
        expect(snapshot.get('1')).to.deep.eq({ id: 1, name: 'Foo', extra: true });
        expect(snapshot.get('2')).to.deep.eq({ id: 2, name: 'Bar', extra: false });
        expect(snapshot.get('3')).to.deep.eq({ id: 3, name: 'Baz', extra: true });
      });

      it(`writes an array for the parameterized node`, () => {
        expect(snapshot.get(parameterizedId)).to.deep.eq([
          { id: 1, name: 'Foo', extra: true },
          { id: 2, name: 'Bar', extra: false },
          { id: 3, name: 'Baz', extra: true },
        ]);
      });

    });

    describe(`updating a field with a direct reference`, () => {

      let baseline: GraphSnapshot, snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($id: ID!) {
          foo(id: $id, withExtra: true) {
            id name extra
          }
        }`, { id: 1 });

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo'], { id: 1, withExtra: true });

        const baselineResult = write(context, empty, parameterizedQuery, {
          foo: {
            id: 1,
            name: 'Foo',
            extra: false,
          },
        });
        baseline = baselineResult.snapshot;

        const result = write(context, baseline, parameterizedQuery, {
          foo: {
            id: 1,
            name: 'Foo Bar',
          },
        });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`doesn't edit the original snapshot`, () => {
        expect(_.get(baseline.get(QueryRootId), 'foo')).to.eq(undefined);
        expect(baseline.get('1')).to.deep.eq({ id: 1, name: 'Foo', extra: false });
        expect(baseline.get('1')).to.not.eq(snapshot.get('1'));
      });

      it(`updates the node for the field`, () => {
        expect(snapshot.get(parameterizedId)).to.deep.eq({ id: 1, name: 'Foo Bar', extra: false });
      });

      it(`writes a node for the field that points to the entity's value`, () => {
        expect(snapshot.get(parameterizedId)).to.eq(snapshot.get('1'));
      });

      it(`marks only the entity as edited`, () => {
        expect(Array.from(editedNodeIds)).to.have.members(['1']);
      });

    });

    describe(`indirectly updating a field with a direct reference`, () => {

      let baseline: GraphSnapshot, snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($id: ID!) {
          foo(id: $id, withExtra: true) {
            id name extra
          }
        }`, { id: 1 });

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo'], { id: 1, withExtra: true });

        const baselineResult = write(context, empty, parameterizedQuery, {
          foo: {
            id: 1,
            name: 'Foo',
            extra: false,
          },
        });
        baseline = baselineResult.snapshot;

        const result = write(context, baseline, viewerQuery, {
          viewer: {
            id: 1,
            name: 'Foo Bar',
          },
        });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`doesn't edit the original snapshot`, () => {
        expect(_.get(baseline.get(QueryRootId), 'foo')).to.eq(undefined);
        expect(baseline.get('1')).to.deep.eq({ id: 1, name: 'Foo', extra: false });
        expect(baseline.get('1')).to.not.eq(snapshot.get('1'));
      });

      it(`updates the node for the field`, () => {
        expect(snapshot.get(parameterizedId)).to.deep.eq({ id: 1, name: 'Foo Bar', extra: false });
      });

      it(`ensures normalized references`, () => {
        const entity = snapshot.get('1');
        expect(snapshot.get(QueryRootId).viewer).to.eq(entity);
        expect(snapshot.get(parameterizedId)).to.eq(entity);
      });

      it(`marks only the entity as edited`, () => {
        expect(Array.from(editedNodeIds)).to.have.members([QueryRootId, '1']);
      });

    });

    describe(`writing nested indirect fields contained in an array`, () => {

      let nestedQuery: Query, snapshot: GraphSnapshot, containerId: NodeId, entry1Id: NodeId, entry2Id: NodeId;
      beforeAll(() => {
        nestedQuery = query(`query nested($id: ID!) {
          one {
            two(id: $id) {
              three {
                four(extra: true) {
                  five
                }
              }
            }
          }
        }`, { id: 1 });

        containerId = nodeIdForParameterizedValue(QueryRootId, ['one', 'two'], { id: 1 });
        entry1Id = nodeIdForParameterizedValue(containerId, [0, 'three', 'four'], { extra: true });
        entry2Id = nodeIdForParameterizedValue(containerId, [1, 'three', 'four'], { extra: true });

        snapshot = write(context, empty, nestedQuery, {
          one: {
            two: [
              {
                three: {
                  four: { five: 1 },
                },
              },
              {
                three: {
                  four: { five: 2 },
                },
              },
            ],
          },
        }).snapshot;
      });

      it(`writes a value snapshot for the containing field`, () => {
        expect(snapshot.getNodeSnapshot(containerId)).to.exist;
      });

      it(`writes value snapshots for each array entry`, () => {
        expect(snapshot.getNodeSnapshot(entry1Id)).to.exist;
        expect(snapshot.getNodeSnapshot(entry2Id)).to.exist;
      });

      it(`references the parent snapshot from the children`, () => {
        const entry1 = snapshot.getNodeSnapshot(entry1Id)!;
        const entry2 = snapshot.getNodeSnapshot(entry2Id)!;

        expect(entry1.inbound).to.have.deep.members([{ id: containerId, path: [0, 'three', 'four'] }]);
        expect(entry2.inbound).to.have.deep.members([{ id: containerId, path: [1, 'three', 'four'] }]);
      });

      it(`references the children from the parent`, () => {
        const container = snapshot.getNodeSnapshot(containerId)!;

        expect(container.outbound).to.have.deep.members([
          { id: entry1Id, path: [0, 'three', 'four'] },
          { id: entry2Id, path: [1, 'three', 'four'] },
        ]);
      });

      it(`writes an array with the correct length`, () => {
        // This is a bit arcane, but it ensures that _overlayParameterizedValues
        // behaves properly when iterating arrays that contain _only_
        // parameterized fields.
        expect(snapshot.get(containerId)).to.deep.eq([undefined, undefined]);
      });

      it(`allows removal of values containing a field`, () => {
        const updated = write(context, snapshot, nestedQuery, {
          one: {
            two: [
              null,
              {
                three: {
                  four: { five: 2 },
                },
              },
            ],
          },
        }).snapshot;

        expect(updated.get(containerId)).to.deep.eq([null, undefined]);
      });

    });

    describe(`with nested entities in an array`, () => {

      let nestedQuery: Query, snapshot: GraphSnapshot, containerId: NodeId;
      beforeAll(() => {
        nestedQuery = query(`query nested($id: ID!) {
          one {
            two(id: $id) {
              three { id }
            }
          }
        }`, { id: 1 });

        containerId = nodeIdForParameterizedValue(QueryRootId, ['one', 'two'], { id: 1 });

        snapshot = write(context, empty, nestedQuery, {
          one: {
            two: [
              { three: { id: 1 } },
              { three: { id: 2 } },
            ],
          },
        }).snapshot;
      });

      it(`writes a value snapshot for the containing field`, () => {
        expect(snapshot.getNodeSnapshot(containerId)).to.exist;
      });

      it(`writes value snapshots for each array entry`, () => {
        expect(snapshot.getNodeSnapshot('1')).to.exist;
        expect(snapshot.getNodeSnapshot('2')).to.exist;
      });

      it(`references the parent snapshot from the children`, () => {
        const entry1 = snapshot.getNodeSnapshot('1')!;
        const entry2 = snapshot.getNodeSnapshot('2')!;

        expect(entry1.inbound).to.have.deep.members([{ id: containerId, path: [0, 'three'] }]);
        expect(entry2.inbound).to.have.deep.members([{ id: containerId, path: [1, 'three'] }]);
      });

      it(`references the children from the parent`, () => {
        const container = snapshot.getNodeSnapshot(containerId)!;

        expect(container.outbound).to.have.deep.members([
          { id: '1', path: [0, 'three'] },
          { id: '2', path: [1, 'three'] },
        ]);
      });

      it.skip(`allows shifting from the front`, () => {
        const updated = write(context, snapshot, nestedQuery, {
          one: {
            two: [
              { three: { id: 2 } },
            ],
          },
        }).snapshot;

        expect(updated.getNodeSnapshot(containerId)!.outbound).to.have.deep.members([
          { id: '2', path: [0, 'three'] },
        ]);

        expect(updated.getNodeSnapshot('2')!.inbound).to.have.deep.members([
          { id: containerId, path: [0, 'three'] },
        ]);
      });

    });

    describe(`optional arguments`, () => {

      let snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($one: Number, $two: String) {
          foo(a: $one, b:$two)
        }`, { one: 1 });

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo'], { a: 1, b: null });

        const result = write(context, empty, parameterizedQuery, { foo: 'hello' });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`writes a node for the field`, () => {
        expect(snapshot.get(parameterizedId)).to.deep.eq('hello');
      });

      it(`creates an outgoing reference from the field's container`, () => {
        const queryRoot = snapshot.getNodeSnapshot(QueryRootId)!;
        expect(queryRoot.outbound).to.deep.eq([{ id: parameterizedId, path: ['foo'] }]);
      });

      it(`creates an inbound reference to the field's container`, () => {
        const values = snapshot.getNodeSnapshot(parameterizedId)!;
        expect(values.inbound).to.deep.eq([{ id: QueryRootId, path: ['foo'] }]);
      });

      it(`does not expose the parameterized field directly from its container`, () => {
        expect(_.get(snapshot.get(QueryRootId), 'foo')).to.eq(undefined);
      });

      it(`marks only the new field as edited`, () => {
        expect(Array.from(editedNodeIds)).to.have.members([parameterizedId]);
      });

      it(`emits a ParameterizedValueSnapshot`, () => {
        expect(snapshot.getNodeSnapshot(parameterizedId)).to.be.an.instanceOf(ParameterizedValueSnapshot);
      });

    });

    describe(`default arguments`, () => {

      let snapshot: GraphSnapshot, editedNodeIds: Set<NodeId>, parameterizedId: NodeId;
      beforeAll(() => {
        const parameterizedQuery = query(`query getAFoo($one: Number = 123, $two: String = "stuff") {
          foo(a: $one, b:$two)
        }`);

        parameterizedId = nodeIdForParameterizedValue(QueryRootId, ['foo'], { a: 123, b: 'stuff' });

        const result = write(context, empty, parameterizedQuery, { foo: 'hello' });
        snapshot = result.snapshot;
        editedNodeIds = result.editedNodeIds;
      });

      it(`writes a node for the field`, () => {
        expect(snapshot.get(parameterizedId)).to.deep.eq('hello');
      });

      it(`creates an outgoing reference from the field's container`, () => {
        const queryRoot = snapshot.getNodeSnapshot(QueryRootId)!;
        expect(queryRoot.outbound).to.deep.eq([{ id: parameterizedId, path: ['foo'] }]);
      });

      it(`creates an inbound reference to the field's container`, () => {
        const values = snapshot.getNodeSnapshot(parameterizedId)!;
        expect(values.inbound).to.deep.eq([{ id: QueryRootId, path: ['foo'] }]);
      });

      it(`does not expose the parameterized field directly from its container`, () => {
        expect(_.get(snapshot.get(QueryRootId), 'foo')).to.eq(undefined);
      });

      it(`marks only the new field as edited`, () => {
        expect(Array.from(editedNodeIds)).to.have.members([parameterizedId]);
      });

      it(`emits a ParameterizedValueSnapshot`, () => {
        expect(snapshot.getNodeSnapshot(parameterizedId)).to.be.an.instanceOf(ParameterizedValueSnapshot);
      });

    });

    describe.skip(`removing array nodes that contain parameterized values`, () => {

      let rootedQuery: Query, snapshot: GraphSnapshot, value1Id: NodeId, value2Id: NodeId;
      beforeAll(() => {
        rootedQuery = query(`{
          foo {
            bar(extra: true) {
              baz { id }
            }
          }
        }`);

        value1Id = nodeIdForParameterizedValue(QueryRootId, ['foo', 0, 'bar'], { extra: true });
        value2Id = nodeIdForParameterizedValue(QueryRootId, ['foo', 1, 'bar'], { extra: true });

        const { snapshot: baseSnapshot } = write(context, empty, rootedQuery, {
          foo: [
            { bar: { baz: { id: 1 } } },
            { bar: { baz: { id: 2 } } },
          ],
        });

        const result = write(context, baseSnapshot, rootedQuery, {
          foo: [
            { bar: { baz: { id: 1 } } },
          ],
        });
        snapshot = result.snapshot;
      });

      it(`doesn't contain the orphaned parameterized value`, () => {
        expect(snapshot.allNodeIds()).to.not.include(value2Id);
      });

      it(`doesn't contain transitively orphaned nodes`, () => {
        expect(snapshot.allNodeIds()).to.not.include('2');
      });

    });

  });

});
