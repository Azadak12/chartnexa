import { useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { useRestorableScroll, useScreenMemoryState } from "../navigation/screen-memory";
import { Banner, BottomSheet, Button, Card, IconButton, Screen, Text, TextField } from "../ui";

// Unique marker so a test can prove this file is absent from production bundles.
export const GALLERY_MARKER = "GALLERY_MARKER_7f3a91c2";

const items = Array.from({ length: 40 }, (_, i) => ({
  id: String(i + 1),
  label: `Sample row ${i + 1}`,
}));

export default function Gallery() {
  const [sheet, setSheet] = useState(false);
  const opener = useRef(null);
  const [filter, setFilter] = useScreenMemoryState<"all" | "even">("gallery:filter", "all");
  const scroll = useRestorableScroll("gallery:list");
  const rows = filter === "even" ? items.filter((r) => Number(r.id) % 2 === 0) : items;
  return (
    <Screen scroll={false}>
      <Text variant="title" accessibilityRole="header">
        Gallery ({GALLERY_MARKER.slice(0, 7)})
      </Text>
      <Banner
        kind="info"
        message="Development only. Checks components and remembered list position."
      />
      <TextField label="Email" error="Example error text" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Primary" onPress={() => undefined} />
        <Button label="Secondary" variant="secondary" onPress={() => undefined} />
        <IconButton icon="info" accessibilityLabel="Information" onPress={() => setSheet(true)} />
      </View>
      <Button
        label={filter === "all" ? "Show even rows" : "Show all rows"}
        variant="tertiary"
        onPress={() => setFilter(filter === "all" ? "even" : "all")}
      />
      <FlatList
        ref={scroll.ref as never}
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Card>
            <Text>{item.label}</Text>
          </Card>
        )}
        {...scroll.props}
      />
      <BottomSheet
        visible={sheet}
        onDismiss={() => setSheet(false)}
        title="Details"
        openerRef={opener}
      >
        <Text>Short, contextual content. Back closes this first.</Text>
      </BottomSheet>
    </Screen>
  );
}
