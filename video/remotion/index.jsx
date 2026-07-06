import { registerRoot } from "remotion";
import { loadFont as loadRajdhani } from "@remotion/google-fonts/Rajdhani";
import { loadFont as loadMaShanZheng } from "@remotion/google-fonts/MaShanZheng";
import { RemotionRoot } from "./Root.jsx";
import "../../src/styles/theme.css";
import "../video.css";

loadRajdhani("normal", { weights: ["400", "500", "600", "700"] });
loadMaShanZheng("normal", { weights: ["400"], ignoreTooManyRequestsWarning: true });
registerRoot(RemotionRoot);
