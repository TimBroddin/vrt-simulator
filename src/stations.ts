// The VRT radio stations: the ghost radio streams them, and every radio studio
// in the building belongs to one of them (its ON AIR light follows the stream).
// `video` is the station's visual radio: the studio cameras, live (HLS, no DRM).
const VR = "https://live.vrtcdn.be";
export const STATIONS = [
  { name: "Radio 1", label: "RADIO 1", url: "https://quantumcast.vrtcdn.be/radio1/mp3-128", logo: "radio1", video: `${VR}/groupa/live/3c3a12b5-093d-4a19-ae1f-3e775433286e/live.isml/.m3u8` },
  { name: "Radio 2", label: "RADIO 2", url: "https://quantumcast.vrtcdn.be/ra2ant/mp3-128", logo: "radio2", video: `${VR}/groupa/live/66a9668e-b37b-4de2-878e-0218563b2dd2/live.isml/.m3u8` },
  { name: "Klara", label: "KLARA", url: "https://quantumcast.vrtcdn.be/klara/mp3-128", logo: "klara", video: `${VR}/groupb/live/9c429b62-e160-417a-b438-cdf985bcd352/live.isml/.m3u8` },
  { name: "Studio Brussel", label: "STUDIO BRUSSEL", url: "https://quantumcast.vrtcdn.be/stubru/mp3-128", logo: "stubru", video: `${VR}/groupb/live/450aa9d1-7173-47f3-aaaa-9701426f8ddd/live.isml/.m3u8` },
  { name: "MNM", label: "MNM", url: "https://quantumcast.vrtcdn.be/mnm/mp3-128", logo: "mnm", video: `${VR}/groupa/live/1718328a-5c53-410d-87ec-d8db68124cfc/live.isml/.m3u8` },
] as const;

export const MNM = 4;
