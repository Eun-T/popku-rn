import { Image, StyleSheet } from 'react-native';

export default function HomeBanner() {
  return (
    <Image
      source={require('../../../assets/images/banner_01.jpg')}
      style={styles.banner}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    height: 355,
  },
});
