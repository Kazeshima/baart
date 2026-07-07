import { registerRoot } from "remotion";
import { loadFont as loadRajdhani } from "@remotion/google-fonts/Rajdhani";
import { RemotionRoot } from "./Root.jsx";
import "../../src/styles/theme.css";
import "../video.css";

loadRajdhani("normal", { weights: ["400", "500", "600", "700"] });
registerRoot(RemotionRoot);
