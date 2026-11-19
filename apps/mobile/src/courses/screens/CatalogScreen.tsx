import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { COURSE_LEVELS, type CourseLevel } from "@chartnexa/api-contracts";
import { accountApi } from "../../auth/account-api";
import { isAppError, messageFor } from "../../api/errors";
import { VerifyNotice } from "../../auth/VerifyNotice";
import { useRestorableScroll, useScreenMemoryState } from "../../navigation/screen-memory";
import { StateView } from "../../state/StateView";
import { spacing } from "../../theme";
import { Chip, Screen, Skeleton, Text, TextField } from "../../ui";
import { categoryApi } from "../../categories/category-api";
import { courseApi } from "../course-api";
import { CourseCard, LEVEL_LABEL } from "../CourseCard";
import { NextLiveCard } from "../../live/NextLiveCard";

interface Filters {
  q: string;
  level: CourseLevel | null;
  category?: string | null;
}

const SEARCH_DELAY_MS = 300;

/** Home: published courses, newest first. Search, level and scroll position survive opening a course. */
export function CatalogScreen() {
  const router = useRouter();
  const [filters, setFilters] = useScreenMemoryState<Filters>("catalog:filters", {
    q: "",
    level: null,
    category: null,
  });
  const category = filters.category ?? null;
  // Categories are optional: if they fail to load, the catalog still works without the filter.
  const categories = useQuery({ queryKey: ["categories"], queryFn: categoryApi.list });
  const withCourses = (categories.data ?? []).filter((c) => c.courseCount > 0 || c.id === category);
  const [text, setText] = useState(filters.q);
  const scroll = useRestorableScroll("catalog:list");
  const me = useQuery({ queryKey: ["me"], queryFn: accountApi.me });

  // Search runs shortly after typing stops, not on every key.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = text.trim();
      if (q !== filters.q) setFilters({ ...filters, q });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const query = useInfiniteQuery({
    queryKey: ["catalog", filters.q, filters.level, category],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      courseApi.list({
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.level ? { level: filters.level } : {}),
        ...(category ? { category } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = filters.q !== "" || filters.level !== null || category !== null;

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Courses
      </Text>
      {me.data && !me.data.emailVerified ? <VerifyNotice /> : null}
      {me.data ? <NextLiveCard /> : null}
      <TextField
        label="Search courses"
        value={text}
        onChangeText={setText}
        placeholder="Search by title"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip
          label="All levels"
          selected={filters.level === null}
          onPress={() => setFilters({ ...filters, level: null })}
        />
        {COURSE_LEVELS.map((l) => (
          <Chip
            key={l}
            label={LEVEL_LABEL[l]}
            selected={filters.level === l}
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

  let empty: React.ReactElement | null = null;
  if (query.status === "pending") empty = <StateView state="loading" />;
  else if (query.status === "error") {
    const e = query.error;
    empty = (
      <StateView
        state={isAppError(e) && e.kind === "network" ? "offline" : "error"}
        message={isAppError(e) ? e.message : messageFor("unknown")}
        requestId={isAppError(e) ? e.requestId : null}
        onAction={() => void query.refetch()}
      />
    );
  } else if (items.length === 0) {
    empty = (
      <StateView
        state="empty"
        title={filtered ? "No courses match" : "No courses yet"}
        message={
          filtered
            ? "Try a different search, level or topic."
            : "Courses will appear here once they are published."
        }
        {...(filtered
          ? {
              actionLabel: "Clear search and filters",
              onAction: () => {
                setText("");
                setFilters({ q: "", level: null, category: null });
              },
            }
          : {})}
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
        ListHeaderComponent={header}
        ListEmptyComponent={empty ?? undefined}
        ListFooterComponent={query.isFetchingNextPage ? <Skeleton height={80} /> : undefined}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg }}
        {...scroll.props}
      />
    </Screen>
  );
}
