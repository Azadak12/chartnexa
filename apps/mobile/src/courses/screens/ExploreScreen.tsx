import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { FlatList, Pressable, View } from "react-native";
import type { CourseLevel } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { categoryApi } from "../../categories/category-api";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../kit/Feedback";
import { CourseCard } from "../../kit/CourseCards";
import { FilterSheet } from "../../kit/FilterSheet";
import { SearchBar } from "../../kit/SearchBar";
import { useRestorableScroll, useScreenMemoryState } from "../../navigation/screen-memory";
import { colors, neutrals, radii, spacing } from "../../theme";
import { Screen, Skeleton, Text } from "../../ui";
import { courseApi } from "../course-api";
import { LEVEL_LABEL } from "../CourseCard";

const SEARCH_DELAY_MS = 350;

/** A small chip for an applied filter, with a button to remove just that one. */
function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove filter ${label}`}
      onPress={onRemove}
      hitSlop={6}
      testID={`chip-${label}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        minHeight: 32,
        paddingLeft: spacing.md,
        paddingRight: spacing.sm,
        borderRadius: radii.pill,
        backgroundColor: colors.blueTint,
      }}
    >
      <Text variant="caption" tone="link" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <Feather name="x" size={14} color={colors.blue} accessible={false} />
    </Pressable>
  );
}
interface Filters {
  q: string;
  level: CourseLevel | null;
  category: string | null;
}

/** The full catalog: search, difficulty and topic filters, compact cards. State survives opening a course. */
export function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [filters, setFilters] = useScreenMemoryState<Filters>("catalog:filters", {
    q: "",
    level: null,
    category: null,
  });
  const [text, setText] = useState(filters.q);
  const [sheet, setSheet] = useState(false);
  const scroll = useRestorableScroll("catalog:list");
  const categories = useQuery({ queryKey: ["categories"], queryFn: categoryApi.list });

  // A topic chosen on Home arrives as a parameter; apply it once.
  useEffect(() => {
    if (params.category && params.category !== filters.category) {
      setFilters({ ...filters, category: params.category });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.category]);
  // Search runs shortly after typing stops, not on every key.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = text.trim();
      if (q !== filters.q) setFilters({ ...filters, q });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const { q, level, category } = filters;
  const query = useInfiniteQuery({
    queryKey: ["catalog", q, level, category],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      courseApi.list({
        ...(q ? { q } : {}),
        ...(level ? { level } : {}),
        ...(category ? { category } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = q !== "" || level !== null || category !== null;
  const withCourses = (categories.data ?? []).filter((c) => c.courseCount > 0 || c.id === category);
  const clear = () => {
    setText("");
    setFilters({ q: "", level: null, category: null });
  };

  const levelName = level ? LEVEL_LABEL[level] : null;
  const categoryName = category
    ? ((categories.data ?? []).find((c) => c.id === category)?.name ?? "Category")
    : null;
  const activeCount = (level ? 1 : 0) + (category ? 1 : 0);
  const count = query.status === "success" ? items.length : null;

  const header = (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Explore Courses
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SearchBar value={text} onChangeText={setText} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={activeCount > 0 ? `Filters, ${activeCount} applied` : "Filters"}
          onPress={() => setSheet(true)}
          testID="filters-button"
          style={{
            minHeight: 48,
            minWidth: 48,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingHorizontal: spacing.md,
            borderRadius: radii.control,
            borderWidth: 1,
            borderColor: activeCount > 0 ? colors.blue : neutrals.divider,
            backgroundColor: activeCount > 0 ? colors.blueTint : colors.white,
          }}
        >
          <Feather name="sliders" size={18} color={colors.blue} accessible={false} />
          <Text variant="bodyStrong" tone="link">
            Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </Text>
        </Pressable>
      </View>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }}
      >
        {count !== null ? (
          <Text variant="caption" tone="muted" testID="result-count">
            {count}
            {query.hasNextPage ? "+" : ""}{" "}
            {count === 1 && !query.hasNextPage ? "course" : "courses"}
          </Text>
        ) : null}
        {levelName ? (
          <RemovableChip
            label={levelName}
            onRemove={() => setFilters({ ...filters, level: null })}
          />
        ) : null}
        {categoryName ? (
          <RemovableChip
            label={categoryName}
            onRemove={() => setFilters({ ...filters, category: null })}
          />
        ) : null}
      </View>
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (query.status === "pending") empty = <LoadingSkeleton rows={5} />;
  else if (query.status === "error") {
    const e = query.error;
    empty = (
      <ErrorState
        offline={isAppError(e) && e.kind === "network"}
        message={isAppError(e) ? e.message : messageFor("unknown")}
        requestId={isAppError(e) ? e.requestId : null}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (items.length === 0) {
    empty = (
      <EmptyState
        title={filtered ? "No courses match" : "No courses yet"}
        message={
          filtered
            ? "Try a different search, level or topic."
            : "Courses will appear here once they are published."
        }
        {...(filtered ? { actionLabel: "Clear search and filters", onAction: clear } : {})}
      />
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <FilterSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        value={{ level, category }}
        categories={withCourses}
        onApply={(v) => setFilters({ ...filters, level: v.level, category: v.category })}
      />
      <FlatList
        ref={scroll.ref as never}
        testID="catalog-list"
        data={items}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <CourseCard course={item} onPress={() => router.push(`/course/${item.id}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty ?? undefined}
        ListFooterComponent={query.isFetchingNextPage ? <Skeleton height={80} /> : undefined}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        {...scroll.props}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </Screen>
  );
}
