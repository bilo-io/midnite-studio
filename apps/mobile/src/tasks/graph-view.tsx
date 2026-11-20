// The Graph (Phase 146 H4): tasks-core layout over the project's dependency graph, edges as react-native-svg paths, nodes
// as absolutely positioned compact cards inside a container moved by a pinch + pan gesture (scale 0.3 to 2.5). Nodes and
// edges outside the viewport (plus one node width of margin) are culled.
import { EmptyState, useTheme } from '@bilo-io/ui-native';
import type { ForgeGraph, ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import {
  DEFAULT_GRAPH_FACETS,
  blockedItemIds,
  filterForgeGraph,
  itemStatusStroke,
  findStatusField,
  layoutForgeGraph,
  topAlignedViewport,
  type PositionedNode,
  type Viewport,
} from '@midnite/tasks-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '../ui/icons';
import {
  CULL_MARGIN,
  FIT_PADDING,
  MOBILE_GRAPH_GEOMETRY,
  cullToViewport,
  edgePath,
  inPort,
  outPort,
  panBy,
  viewportRect,
  zoomAt,
} from './graph-geometry';

export function GraphLoading({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[2] }} testID="graph-loading">
      <ActivityIndicator />
      <Text style={[theme.type.sm, { color: theme.colors.mutedForeground }]}>
        {count > 0 ? `Laying out ${count} items` : 'Loading dependencies'}
      </Text>
    </View>
  );
}

export function GraphView({
  graph,
  items,
  fields,
  onOpenNode,
  onViewAsList,
}: {
  graph: ForgeGraph;
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  onOpenNode: (node: PositionedNode) => void;
  onViewAsList: () => void;
}) {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const fitted = useRef(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);
  const statusField = useMemo(() => findStatusField(fields), [fields]);
  const blocked = useMemo(() => blockedItemIds(graph), [graph]);
  const layout = useMemo(() => {
    const filtered = filterForgeGraph(graph, {
      filteredItemIds: new Set(items.map((i) => i.id)),
      facets: DEFAULT_GRAPH_FACETS,
    });
    return layoutForgeGraph(filtered, MOBILE_GRAPH_GEOMETRY);
  }, [graph, items]);

  const fit = useCallback(() => {
    if (size.width === 0) return;
    setViewport(topAlignedViewport(layout.bounds, size.width, 1, FIT_PADDING));
  }, [layout.bounds, size.width]);

  // Initial viewport once the container is measured.
  useEffect(() => {
    if (!fitted.current && size.width > 0 && layout.nodes.length > 0) {
      fitted.current = true;
      fit();
    }
  }, [fit, size.width, layout.nodes.length]);

  const last = useRef({ scale: 1, tx: 0, ty: 0 });
  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        last.current.scale = 1;
      })
      .onUpdate((e) => {
        const factor = e.scale / last.current.scale;
        last.current.scale = e.scale;
        setViewport((v) => zoomAt(v, factor, e.focalX, e.focalY));
      });
    const pan = Gesture.Pan()
      .runOnJS(true)
      .onStart(() => {
        last.current.tx = 0;
        last.current.ty = 0;
      })
      .onUpdate((e) => {
        const dx = e.translationX - last.current.tx;
        const dy = e.translationY - last.current.ty;
        last.current.tx = e.translationX;
        last.current.ty = e.translationY;
        setViewport((v) => panBy(v, dx, dy));
      });
    return Gesture.Simultaneous(pinch, pan);
  }, []);

  if (layout.nodes.length === 0 || graph.edges.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="graph" size={32} color={theme.colors.mutedForeground} />}
        title="No dependencies in this project"
        action={{ label: 'View as list', onPress: onViewAsList }}
      />
    );
  }

  const visible = viewportRect(viewport, size.width || 1, size.height || 1, CULL_MARGIN);
  const { nodes, edges } = cullToViewport(layout.nodes, layout.edges, visible);
  const byKey = new Map(layout.nodes.map((n) => [n.key, n] as const));

  return (
    <View style={{ flex: 1 }} testID="graph-view">
      {graph.truncated ? (
        <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, padding: theme.space[2] }]}>
          Showing the first {graph.nodes.length} of {graph.totalCount} items.
        </Text>
      ) : null}
      <GestureDetector gesture={gesture}>
        <View
          accessibilityLabel="Dependency graph"
          onLayout={(e: LayoutChangeEvent) => setSize(e.nativeEvent.layout)}
          style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.colors.muted }}
        >
          <View
            testID="graph-canvas"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transformOrigin: 'top left',
              transform: [{ scale: viewport.scale }, { translateX: -viewport.x }, { translateY: -viewport.y }],
            }}
          >
            <Svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
              {edges.map((edge) => {
                const from = byKey.get(edge.from)!;
                const to = byKey.get(edge.to)!;
                const s = outPort(from);
                const t = inPort(to);
                return (
                  <Path
                    key={`${edge.kind}|${edge.from}|${edge.to}`}
                    d={edgePath(s.x, s.y, t.x, t.y)}
                    fill="none"
                    stroke={edge.kind === 'blocks' ? theme.accents.kind.bug : theme.colors.border}
                    strokeWidth={1.5}
                    strokeDasharray={edge.kind === 'contains' ? '4 4' : undefined}
                  />
                );
              })}
            </Svg>
            {nodes.map((node) => {
              const item = itemById.get(node.itemId);
              const stroke = itemStatusStroke(item, statusField, blocked.has(node.itemId));
              const isSelected = selected === node.key;
              return (
                <Pressable
                  key={node.key}
                  testID={`graph-node-${node.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${node.number === null ? 'Draft' : `#${node.number}`}, ${node.title}${node.blocked ? ', blocked' : ''}`}
                  onFocus={() => setFocused(node.key)}
                  onBlur={() => setFocused((k) => (k === node.key ? null : k))}
                  onPress={() => {
                    setSelected(node.key);
                    onOpenNode(node);
                  }}
                  style={[
                    {
                      position: 'absolute',
                      left: node.x,
                      top: node.y,
                      width: MOBILE_GRAPH_GEOMETRY.width,
                      height: MOBILE_GRAPH_GEOMETRY.height,
                      flexDirection: 'row',
                      overflow: 'hidden',
                      borderRadius: theme.radius.lg,
                      backgroundColor: theme.colors.card,
                      borderWidth: isSelected || focused === node.key ? 2 : 0,
                      borderColor: theme.colors.ring,
                    },
                    theme.elevation[1],
                  ]}
                >
                  <View style={{ width: 3, backgroundColor: stroke?.color ?? theme.colors.border, opacity: stroke?.opacity ?? 1 }} />
                  <View style={{ flex: 1, padding: theme.space[2], gap: 2 }}>
                    <Text style={[theme.type.xs, { color: theme.colors.mutedForeground, fontFamily: theme.font.mono }]}>
                      {node.number === null ? 'Draft' : `#${node.number}`}
                    </Text>
                    <Text numberOfLines={2} style={[theme.type.sm, { color: theme.colors.foreground, fontWeight: theme.font.medium }]}>
                      {node.title}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={{ position: 'absolute', left: theme.space[3], bottom: theme.space[3], flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
            <View style={{ paddingHorizontal: theme.space[2], paddingVertical: theme.space[1], borderRadius: theme.radius.full, backgroundColor: theme.colors.popover }}>
              <Text testID="graph-zoom" style={[theme.type.xs, { color: theme.colors.popoverForeground }]}>
                {Math.round(viewport.scale * 100)}%
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fit graph to screen"
              onPress={fit}
              hitSlop={theme.space[2]}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.popover }}
            >
              <Icon name="maximize" size={16} color={theme.colors.popoverForeground} />
            </Pressable>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}
