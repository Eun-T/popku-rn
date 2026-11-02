import { memo } from "react";
import { StyleSheet } from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";

const camera = {
  center: { latitude: 37.5350, longitude: 126.98238576042822 },
  //37.52632491406909,126.98238576042822
  zoom: 11,
  altitude: 0,
  pitch: 0,
  heading: 0,
};

export default memo(function HomeSeoulMapSurface({
  onLoaded,
}: {
  onLoaded: () => void;
}) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      mapType="standard"
      initialCamera={camera}
      pointerEvents="none"
      accessible={false}
      scrollEnabled={false}
      zoomEnabled={false}
      zoomTapEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      scrollDuringRotateOrZoomEnabled={false}
      showsUserLocation={false}
      showsMyLocationButton={false}
      followsUserLocation={false}
      showsCompass={false}
      showsScale={false}
      showsTraffic={false}
      showsBuildings={false}
      showsIndoors={false}
      showsIndoorLevelPicker={false}
      toolbarEnabled={false}
      zoomControlEnabled={false}
      onMapLoaded={onLoaded}
    />
  );
});
