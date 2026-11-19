import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { COURSE_LEVELS } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { categoryApi } from "../../categories/category-api";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../kit/Feedback";
import { CourseCard } from "../../kit/CourseCards";
import { SearchBar } from "../../kit/SearchBar";
import { useRestorableScroll, useScreenMemoryState } from "../../navigation/screen-memory";
import { spacing } from "../../theme";
import { Chip, Screen, Skeleton, Text } from "../../ui";
import { courseApi } from "../course-api";
import { LEVEL_LABEL } from "../CourseCard";

const SEARCH_DELAY_MS = 350;
interface Filters {
  q: string;
  level: (typeof COURSE_LEVELS)[number] | null;
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

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Explore
      </Text>
      <SearchBar value={text} onChangeText={setText} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip
          label="All levels"
          selected={level === null}
          onPress={() => setFilters({ ...filters, level: null })}
        />
        {COURSE_LEVELS.map((l) => (
          <Chip
            key={l}
            label={LEVEL_LABEL[l]}
            selected={level === l}
            onPress={() => setFilters({ ...filters, level: l })}
          />
        ))}
      </View>
      {withCourses.length > 0 ? (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
          testID="category-filter"
        >
          <Chip
            label="All topics"
            selected={category === null}
            onPress={() => setFilters({ ...filters, category: null })}
          />
          {withCourses.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={category === c.id}
              onPress={() => setFilters({ ...filters, category: c.id })}
            />
          ))}
        </View>
      ) : null}
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
