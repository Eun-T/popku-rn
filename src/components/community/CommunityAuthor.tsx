import { UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { CommunityFeedItem } from '../../lib/community';
import { formatCommunityTime } from '../../lib/communityTime';
import { communityColors } from '../../theme/communityColors';
import { radius, spacing, typography } from '../../theme/tokens';

type Props = { author: CommunityFeedItem['author']; createdAt: string; now?: number; showTime?: boolean };

export default function CommunityAuthor({ author, createdAt, now = Date.now(), showTime = true }: Props) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const time = formatCommunityTime(createdAt, now);
  return (
    <View style={styles.row}>
      {author.avatarUrl && author.avatarUrl !== failedAvatar
        ? <Image source={{ uri: author.avatarUrl }} style={styles.avatar} resizeMode="cover"
          onError={() => setFailedAvatar(author.avatarUrl)} />
        : <View style={[styles.avatar, styles.fallback]}><UserRound size={22} color={communityColors.secondaryText} /></View>}
      <View style={styles.text}>
        <Text style={styles.nickname} numberOfLines={1}>{author.nickname}</Text>
        {showTime && <Text style={styles.time}>{time}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space12 },
  avatar: { width: 40, height: 40, borderRadius: radius.full },
  fallback: { backgroundColor: communityColors.mutedSurface, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  nickname: { ...typography.label, fontWeight: '600', color: communityColors.text },
  time: { ...typography.caption, color: communityColors.secondaryText },
});
