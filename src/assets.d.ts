declare module "*.jpg" {
  const url: string;
  export default url;
}
declare module "*.png" {
  const url: string;
  export default url;
}
declare module "hls.js/light" {
  import Hls from "hls.js";
  export default Hls;
}
