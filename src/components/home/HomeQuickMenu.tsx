import { useRouter, type Href } from 'expo-router';
import {
  CalendarDays,
  Heart,
  Map,
  MapPin,
  Search,
  Store,
  Ticket,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme/tokens';

type QuickMenuItem = {
  label: string;
  icon: LucideIcon;
  href?: Href;
};

const MENU_GAP = spacing.space8;
const SIDE_PADDING = spacing.space16;

const menus: QuickMenuItem[] = [
  { label: '팝업', icon: Search },
  { label: '지역', icon: MapPin },
  { label: '브랜드', icon: Store },
  { label: '찜', icon: Heart },
  { label: '일정', icon: CalendarDays },
  { label: '지도', icon: Map },
  { label: '이벤트', icon: Ticket },
];

export default function HomeQuickMenu() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const itemWidth = (width - SIDE_PADDING - MENU_GAP * 5) / 5.5;

  const handlePress = (href?: Href) => {
    if (href) router.push(href);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {menus.map(({ label, icon: Icon, href }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => handlePress(href)}
          style={[styles.item, { width: itemWidth }]}
        >
          <View style={styles.iconBackground}>
            <Icon size={24} color={colors.text} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 100,
    flexGrow: 0,
  },
  content: {
    alignItems: 'center',
    columnGap: MENU_GAP,
    paddingLeft: SIDE_PADDING,
    paddingRight: SIDE_PADDING,
  },
  item: {
    alignItems: 'center',
  },
  iconBackground: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.radius12,
    backgroundColor: colors.surface,
  },
  label: {
    marginTop: spacing.space6,
    ...typography.caption,
    color: colors.text,
    textAlign: 'center',
  },
});
