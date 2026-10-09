import { BlurTargetView, BlurView } from "expo-blur";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import {
  ChevronRight,
  Heart,
  MessageSquare,
  Settings,
  Star,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getAuthUser,
  refreshAuthUser,
  subscribeAuthUser,
} from "../../../lib/auth";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useTranslation } from '../../../hooks/useTranslation';

type MenuRowProps = {
  icon?: LucideIcon;
  iconColor?: string;
  iconFill?: string;
  label: string;
  onPress?: () => void;
  divider?: boolean;
  showChevron?: boolean;
};

function MenuRow({
  icon: Icon,
  iconColor = colors.secondaryText,
  iconFill = "none",
  label,
  onPress,
  divider = false,
  showChevron = true,
}: MenuRowProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        onPress ? undefined : t('profile.unavailable')
      }
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.menuRow, divider && styles.divider]}
    >
      {Icon && <Icon size={20} color={iconColor} fill={iconFill} />}
      <Text style={styles.menuLabel}>{label}</Text>
      {showChevron && <ChevronRight size={20} color={colors.inactiveText} />}
    </Pressable>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const router = useRouter();
  const blurTarget = useRef<View>(null);
  const user = useSyncExternalStore(
    subscribeAuthUser,
    getAuthUser,
    getAuthUser,
  );
  const [loading, setLoading] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const hasEmail = Boolean(user?.email?.trim());
  const onPressSettings = () => router.push("/profile/settings" as Href);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setRestoreFailed(false);

      async function restoreSession() {
        try {
          await refreshAuthUser(() => active);
        } catch {
          if (active) setRestoreFailed(true);
        } finally {
          if (active) setLoading(false);
        }
      }

      void restoreSession();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('language.settings')}
            onPress={onPressSettings}
            hitSlop={{ top: 6, bottom: 6 }}
            style={styles.settingsButton}
          >
            <Settings size={24} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.profileCard}>
          <BlurTargetView
            ref={blurTarget}
            pointerEvents={user ? "auto" : "none"}
            accessibilityElementsHidden={!user}
            importantForAccessibility={user ? "auto" : "no-hide-descendants"}
          >
            <View style={styles.nicknameArea}>
              {user ? (
                <>
                  <Text style={styles.nickname}>{user.nickname}</Text>
                  {hasEmail && (
                    <Text
                      style={styles.email}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {user.email}
                    </Text>
                  )}
                </>
              ) : (
                <View style={styles.nicknamePlaceholder} />
              )}
            </View>
            <Text
              style={[
                styles.activityTitle,
                hasEmail && styles.activityTitleWithEmail,
              ]}
            >
              {t('profile.activity')}
            </Text>
            <MenuRow
              icon={Heart}
              iconColor="#FF5A6E"
              iconFill="#FF5A6E"
              label={t('profile.favorites.title')}
              onPress={
                user
                  ? () => router.push("/profile/favorites" as Href)
                  : undefined
              }
            />
            <MenuRow
              icon={Star}
              iconColor="#F5B82E"
              iconFill="#F5B82E"
              label={t('profile.reviews.title')}
              onPress={
                user ? () => router.push("/profile/reviews" as Href) : undefined
              }
              divider
            />
            <MenuRow
              icon={MessageSquare}
              iconColor="#5B8DEF"
              iconFill="#5B8DEF"
              label={t('profile.posts.title')}
              onPress={() => router.push("/profile/posts" as Href)}
              divider
            />
          </BlurTargetView>
          {!user && (
            <View style={styles.loginOverlay}>
              <BlurView
                style={styles.overlayFill}
                blurTarget={blurTarget}
                blurMethod="dimezisBlurView"
                tint="light"
                intensity={40}
                pointerEvents="none"
              />
              <View
                style={[styles.overlayFill, styles.whiteOverlay]}
                pointerEvents="none"
              />
              {loading ? (
                <ActivityIndicator
                  accessibilityLabel={t('profile.loadingUser')}
                  color={colors.primary}
                />
              ) : (
                <View style={styles.loginForeground}>
                  <Text style={styles.loginTitle}>
                    {t('profile.loginTitle')}
                  </Text>
                  <Text style={styles.loginDescription}>
                    {t('profile.loginDescription')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.loginButton}
                    onPress={() => router.push({ pathname: "/profile/login", params: { loginOrigin: "profile" } })}
                  >
                    <Text style={styles.loginButtonText}>{t('profile.login')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
        {!loading && !user && restoreFailed && (
          <Text style={styles.errorText}>
            {t('profile.userLoadFailed')}
          </Text>
        )}
        <View style={styles.sectionDivider} />
        <View style={styles.serviceSection}>
          <Text style={styles.sectionTitle}>{t('profile.service')}</Text>
          <View style={styles.serviceGridRow}>
            <View style={styles.serviceLeftCell}>
              <MenuRow
                label={t('profile.notices')}
                onPress={() => router.push("/profile/notices" as Href)}
                showChevron={false}
              />
            </View>
            <View style={styles.serviceRightCell}>
              <MenuRow
                label={t('language.settings')}
                onPress={onPressSettings}
                showChevron={false}
              />
            </View>
          </View>
          <View style={[styles.serviceGridRow, styles.divider]}>
            <View style={styles.serviceLeftCell}>
              <MenuRow
                label={t('profile.inquiries')}
                onPress={() => router.push("/profile/inquiries" as Href)}
                showChevron={false}
              />
            </View>
            <View style={styles.serviceRightCell}>
              <MenuRow
                label={t('profile.policies')}
                onPress={() => router.push("/profile/policies" as Href)}
                showChevron={false}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    paddingTop: spacing.space8,
    paddingHorizontal: spacing.space16,
    paddingBottom: spacing.space60 + spacing.space40,
  },
  title: { ...typography.titleL, color: colors.text },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsButton: {
    minWidth: 44,
    minHeight: typography.titleL.lineHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  profileCard: {
    marginTop: spacing.space24,
    padding: spacing.space16,
    borderRadius: radius.radius16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    shadowColor: colors.text,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  nicknameArea: {
    minHeight: typography.titleM.lineHeight,
    justifyContent: "center",
  },
  nickname: { ...typography.titleM, color: colors.text },
  email: {
    ...typography.label,
    fontSize: 16,
    color: colors.secondaryText,
    marginTop: spacing.space4,
  },
  nicknamePlaceholder: {
    width: spacing.space60 + spacing.space40,
    height: typography.titleM.lineHeight,
    borderRadius: radius.radius8,
    backgroundColor: colors.border,
  },
  activityTitle: {
    ...typography.titleS,
    color: colors.text,
    marginTop: spacing.space32,
    marginBottom: spacing.space8,
  },
  activityTitleWithEmail: { marginTop: spacing.space24 },
  menuRow: {
    minHeight: spacing.space56,
    paddingVertical: spacing.space16,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.space12,
  },
  menuLabel: { ...typography.body, color: colors.text, flex: 1 },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  overlayFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  whiteOverlay: { backgroundColor: colors.background, opacity: 0.08 },
  loginOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "center",
    padding: spacing.space16,
    borderRadius: radius.radius16,
    overflow: "hidden",
  },
  loginForeground: { gap: spacing.space8 },
  loginTitle: { ...typography.titleS, color: colors.text },
  loginDescription: { ...typography.label, color: colors.secondaryText },
  loginButton: {
    marginTop: spacing.space8,
    minHeight: spacing.space24 * 2,
    paddingHorizontal: spacing.space32,
    paddingVertical: spacing.space12,
    alignItems: "center",
    borderRadius: radius.radius8,
    backgroundColor: colors.primary,
  },
  loginButtonText: { ...typography.label, color: colors.background },
  errorText: {
    ...typography.caption,
    color: colors.secondaryText,
    marginTop: spacing.space12,
  },
  sectionDivider: {
    height: spacing.space8,
    backgroundColor: colors.border,
    marginHorizontal: -spacing.space16,
    marginTop: spacing.space32,
  },
  serviceSection: { marginTop: spacing.space16 },
  serviceGridRow: { flexDirection: "row" },
  serviceLeftCell: { width: "50%", paddingRight: spacing.space8 },
  serviceRightCell: { width: "50%", paddingLeft: spacing.space8 },
  sectionTitle: {
    ...typography.titleM,
    color: colors.text,
    marginBottom: spacing.space8,
  },
});
