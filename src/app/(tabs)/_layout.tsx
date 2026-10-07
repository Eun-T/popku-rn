import { Tabs } from 'expo-router/tabs';

import FloatingTabBar from '../../components/navigation/FloatingTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => props.state.routes[props.state.index]?.name === 'map'
        ? null
        : <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: '메인 홈' }} />
      <Tabs.Screen name="places" options={{ title: '플레이스' }} />
      <Tabs.Screen name="map" options={{ title: '지도' }} />
      <Tabs.Screen name="community" options={{ title: '커뮤니티' }} />
      <Tabs.Screen name="profile" options={{ title: '마이페이지', popToTopOnBlur: true }} />
    </Tabs>
  );
}
