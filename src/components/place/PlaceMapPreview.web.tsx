import StaticMapImage from './StaticMapImage';

type PlaceMapPreviewProps = {
  latitude: number;
  longitude: number;
};

const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_STATIC_API_KEY;

// Keep the location section and directions button visible while the key is being configured.
export const isMapPreviewAvailable = true;

export default function PlaceMapPreview({ latitude, longitude }: PlaceMapPreviewProps) {
  return <StaticMapImage latitude={latitude} longitude={longitude} apiKey={apiKey} />;
}
