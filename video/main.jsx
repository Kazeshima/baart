import React from "react";
import ReactDOM from "react-dom/client";
import VideoStudio from "./VideoStudio.jsx";
import "../src/styles/theme.css";
import "./video.css";
import "./studio.css";

ReactDOM.createRoot(document.getElementById("video-root")).render(<React.StrictMode><VideoStudio /></React.StrictMode>);
