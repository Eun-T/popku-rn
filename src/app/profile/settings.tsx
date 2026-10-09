import { accountUiText } from '../../locales/accountUi';
import { communityColors } from '../../theme/communityColors';
import { useRouter, type Href } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getAuthUser, logout, subscribeAuthUser } from "../../lib/auth";
import { colors, spacing, typography } from "../../theme/tokens";
import { useTranslation } from '../../hooks/useTranslation';
import ThemePreferenceSheet from '../../components/profile/ThemePreferenceSheet';
import { useTheme } from '../../theme/useTheme';
import { DARK_MODE_ENABLED } from '../../theme/themeFeature.js';

export default function Settings() {
  const { t } = useTranslation();
  const { themePreference } = useTheme();
  const [themeSheetVisible, setThemeSheetVisible] = useState(false);
  const accountTranslation = useRef(t);
  useEffect(() => { accountTranslation.current = t; }, [t]);
  const router = useRouter();
  const user = useSyncExternalStore(
    subscribeAuthUser,
    getAuthUser,
    getAuthUser,
  );
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  async function handleLogout() {
    if (pendingRef.current || !getAuthUser()) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await logout();
      router.dismissTo("/profile");
    } catch {
      // Existing logout also clears local authentication when the server request fails.
      if (!getAuthUser()) router.dismissTo("/profile");
      else
        Alert.alert(accountUiText(accountTranslation.current, "로그아웃"), accountUiText(accountTranslation.current, "로그아웃에 실패했습니다. 다시 시도해주세요."));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('language.back')}
          disabled={pending}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/profile")
          }
          style={styles.backButton}
        >
          <ChevronLeft size={24} color={colors.text} style={styles.backIcon} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('language.settings')}</Text>
        <View pointerEvents="none" style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {DARK_MODE_ENABLED && <><Pressable accessibilityRole="button"
          accessibilityLabel={`${t('account.settings.theme.title')}, ${t(`account.settings.theme.${themePreference}`)}`}
          disabled={pending} onPress={() => setThemeSheetVisible(true)} style={styles.row}>
          <Text style={styles.rowLabel}>{t('account.settings.theme.title')}</Text>
          <Text style={styles.themeValue}>{t(`account.settings.theme.${themePreference}`)}</Text>
          <ChevronRight size={20} color={colors.inactiveText} />
        </Pressable>
        <View style={styles.languageSpacing} />
        </>}
        {user && (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={accountUiText(t, "닉네임 변경")} disabled={pending}
              onPress={() => { if (getAuthUser() && !pendingRef.current) router.push('/profile/nickname' as Href); }} style={styles.row}>
              <Text style={styles.rowLabel}>{accountUiText(t, "닉네임 변경")}</Text>
              <ChevronRight size={20} color={colors.inactiveText} />
            </Pressable>
            {user.provider === 'LOCAL' && <Pressable accessibilityRole="button" accessibilityLabel={accountUiText(t, "비밀번호 변경")} disabled={pending}
              onPress={() => { if (getAuthUser()?.provider === 'LOCAL' && !pendingRef.current) router.push('/profile/password' as Href); }} style={[styles.row, styles.divider]}>
              <Text style={styles.rowLabel}>{accountUiText(t, "비밀번호 변경")}</Text>
              <ChevronRight size={20} color={colors.inactiveText} />
            </Pressable>}
          </>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={t('language.screenTitle')}
          disabled={pending} onPress={() => router.push('/profile/language' as Href)} style={styles.row}>
          <Text style={styles.rowLabel}>{t('language.screenTitle')}</Text>
          <ChevronRight size={20} color={colors.inactiveText} />
        </Pressable>
        {user ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={accountUiText(t, "로그아웃")}
              accessibilityState={{ disabled: pending, busy: pending }}
              disabled={pending}
              onPress={() => void handleLogout()}
              style={styles.row}
            >
              <Text style={styles.rowLabel}>{accountUiText(t, "로그아웃")}</Text>
              {pending ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <ChevronRight size={20} color={colors.inactiveText} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={accountUiText(t, "회원탈퇴")}
              accessibilityState={{ disabled: pending }}
              disabled={pending}
              onPress={() => {
                if (getAuthUser() && !pendingRef.current)
                  router.push("/profile/withdrawal" as Href);
              }}
              style={[styles.row, styles.divider]}
            >
              <Text style={styles.withdrawalLabel}>{accountUiText(t, "회원탈퇴")}</Text>
              {/* <ChevronRight size={20} color={colors.inactiveText} /> */}
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.dismissTo("/profile/login")}
            style={styles.row}
          >
            <Text style={styles.rowLabel}>{accountUiText(t, "로그인")}</Text>
            <ChevronRight size={20} color={colors.inactiveText} />
          </Pressable>
        )}
      </ScrollView>
      <ThemePreferenceSheet visible={DARK_MODE_ENABLED && themeSheetVisible} onClose={() => setThemeSheetVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backIcon: { alignSelf: "flex-start" },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: spacing.space56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.space16,
    borderBottomWidth: 1,
    borderBottomColor: communityColors.divider,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.titleS,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    textAlign: "center",
  },
  content: {
    paddingHorizontal: spacing.space16,
    paddingTop: spacing.space24,
    paddingBottom: spacing.space60 + spacing.space40,
  },
  row: {
    minHeight: spacing.space56,
    paddingVertical: spacing.space16,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.space12,
  },
  rowLabel: { ...typography.body, color: colors.text, flex: 1 },
  themeValue: { ...typography.body, color: colors.secondaryText },
  languageSpacing: { height: spacing.space32 },
  withdrawalLabel: { ...typography.body, color: "#DC2626", flex: 1 },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
